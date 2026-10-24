using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Bills;

namespace MoneyVisualizer.Api.Modules.Email;

/// <summary>
/// Reads bill-related emails from connected mailboxes and stages them for review. Nothing becomes a bill
/// (or a payment) until the user confirms it. Email bodies are never stored – only the extracted fields.
/// </summary>
public sealed class EmailImportService(
    MoneyDbContext database,
    IEnumerable<IMailboxClient> clients,
    IDataProtectionProvider protectionProvider,
    BillService bills,
    IConfiguration configuration,
    ILogger<EmailImportService> logger)
{
    private readonly IDataProtector tokenProtector = protectionProvider.CreateProtector("MoneyVisualizer.EmailTokens.v1");
    private readonly IDataProtector stateProtector = protectionProvider.CreateProtector("MoneyVisualizer.EmailOAuthState.v1");

    public IMailboxClient Client(MailProvider provider) =>
        clients.FirstOrDefault(client => client.Provider == provider) ?? throw new NotConfiguredException($"{provider} is not supported.");

    public async Task<EmailStatusResponse> StatusAsync(CancellationToken cancellationToken)
    {
        var connections = await database.EmailConnections.AsNoTracking()
            .Select(connection => new ConnectionResponse(connection.Provider, connection.EmailAddress, connection.CreatedAt, connection.LastSyncedAt))
            .ToListAsync(cancellationToken);
        var counts = await database.EmailImports.AsNoTracking().GroupBy(import => import.Status)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Key, item => item.Count, cancellationToken);
        foreach (var status in Enum.GetValues<EmailImportStatus>())
            counts.TryAdd(status, 0);
        return new EmailStatusResponse(Client(MailProvider.Outlook).IsConfigured, Client(MailProvider.Gmail).IsConfigured, connections, counts);
    }

    /// <summary>Builds the provider sign-in URL. The PKCE verifier travels in an encrypted, short-lived cookie value.</summary>
    public (string Url, string ProtectedState) BeginConnect(MailProvider provider, Guid userId, string redirectUri)
    {
        var client = Client(provider);
        if (!client.IsConfigured)
            throw new NotConfiguredException($"{provider} integration is not configured. Set Email:{provider}:ClientId (see README).");

        var state = Base64Url(RandomNumberGenerator.GetBytes(24));
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(32));
        var challenge = Base64Url(SHA256.HashData(System.Text.Encoding.ASCII.GetBytes(verifier)));
        var payload = stateProtector.ToTimeLimitedDataProtector().Protect($"{state}|{verifier}|{userId}|{provider}", TimeSpan.FromMinutes(10));
        return (client.BuildAuthorizeUrl(state, challenge, redirectUri), payload);
    }

    public async Task CompleteConnectAsync(MailProvider provider, Guid userId, string code, string state, string? protectedState, string redirectUri, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(protectedState))
            throw new BusinessRuleException("The sign-in session expired. Try connecting again.");

        string[] parts;
        try
        {
            parts = stateProtector.ToTimeLimitedDataProtector().Unprotect(protectedState).Split('|');
        }
        catch (CryptographicException)
        {
            throw new BusinessRuleException("The sign-in session expired. Try connecting again.");
        }

        if (parts.Length != 4 || parts[0] != state || parts[2] != userId.ToString() || parts[3] != provider.ToString())
            throw new BusinessRuleException("The sign-in response did not match this session.");

        var client = Client(provider);
        var tokens = await client.ExchangeCodeAsync(code, parts[1], redirectUri, cancellationToken);
        var email = await client.GetEmailAddressAsync(tokens.AccessToken, cancellationToken);

        var connection = await database.EmailConnections.FirstOrDefaultAsync(candidate => candidate.Provider == provider, cancellationToken);
        if (connection is null)
        {
            connection = new EmailConnection { Provider = provider };
            database.EmailConnections.Add(connection);
        }

        connection.EmailAddress = email;
        StoreTokens(connection, tokens);
        await database.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Connected {Provider} mailbox for user {UserId}", provider, userId);
    }

    public async Task DisconnectAsync(MailProvider provider, bool deleteImports, CancellationToken cancellationToken)
    {
        var connection = await database.EmailConnections.FirstOrDefaultAsync(candidate => candidate.Provider == provider, cancellationToken);
        if (connection is not null)
        {
            try
            {
                await Client(provider).RevokeAsync(ReadTokens(connection), cancellationToken);
            }
            catch (Exception exception) when (exception is HttpRequestException or CryptographicException or ExternalServiceException)
            {
                logger.LogWarning(exception, "Token revocation for {Provider} failed; tokens are deleted locally anyway", provider);
            }

            database.EmailConnections.Remove(connection);
        }

        if (deleteImports)
        {
            var imports = await database.EmailImports.Where(import => import.Provider == provider).ToListAsync(cancellationToken);
            var ids = imports.Select(import => (Guid?)import.Id).ToList();
            // Confirmed bills belong to the user and stay, but lose their link to the deleted email record.
            await database.Bills.Where(bill => ids.Contains(bill.EmailImportId))
                .ExecuteUpdateAsync(setters => setters.SetProperty(bill => bill.EmailImportId, (Guid?)null), cancellationToken);
            database.EmailImports.RemoveRange(imports);
        }

        await database.SaveChangesAsync(cancellationToken);
    }

    public async Task<SyncResult> SyncAsync(CancellationToken cancellationToken)
    {
        var connections = await database.EmailConnections.ToListAsync(cancellationToken);
        if (connections.Count == 0)
            throw new BusinessRuleException("Connect Outlook or Gmail first.");

        int fetched = 0, detected = 0, duplicates = 0, failed = 0, already = 0, payments = 0;
        var errors = new List<string>();
        var max = configuration.GetValue("Email:MaxMessagesPerSync", 200);
        var lookback = configuration.GetValue("Email:LookbackDays", 60);
        foreach (var connection in connections)
        {
            try
            {
                var accessToken = await GetFreshAccessTokenAsync(connection, cancellationToken);
                var since = connection.LastSyncedAt?.AddDays(-2) ?? DateTime.UtcNow.AddDays(-lookback);
                var messages = await Client(connection.Provider).SearchBillEmailsAsync(accessToken, since, max, cancellationToken);
                fetched += messages.Count;

                var ids = messages.Select(message => message.Id).ToList();
                var known = (await database.EmailImports.AsNoTracking()
                    .Where(import => import.Provider == connection.Provider && ids.Contains(import.MessageId))
                    .Select(import => import.MessageId).ToListAsync(cancellationToken)).ToHashSet();

                foreach (var message in messages)
                {
                    if (known.Contains(message.Id))
                    {
                        already++;
                        continue;
                    }

                    var import = await StageAsync(connection.Provider, message, cancellationToken);
                    if (import is null)
                        continue;
                    database.EmailImports.Add(import);
                    known.Add(message.Id);
                    switch (import.Status)
                    {
                        case EmailImportStatus.Duplicate: duplicates++; break;
                        case EmailImportStatus.Failed: failed++; break;
                        default:
                            detected++;
                            if (import.LooksLikePayment) payments++;
                            break;
                    }
                }

                connection.LastSyncedAt = DateTime.UtcNow;
                await database.SaveChangesAsync(cancellationToken);
            }
            catch (AppException exception)
            {
                errors.Add($"{connection.Provider}: {exception.Message}");
            }
            catch (HttpRequestException exception)
            {
                logger.LogWarning(exception, "Mailbox {Provider} could not be reached", connection.Provider);
                errors.Add($"{connection.Provider}: the mailbox could not be reached.");
            }
        }

        return new SyncResult(fetched, detected, duplicates, failed, already, payments, DateTime.UtcNow, errors);
    }

    /// <summary>Turns one email into a staged import record, or null if it is not bill-related at all.</summary>
    public async Task<EmailImport?> StageAsync(MailProvider provider, MailMessage message, CancellationToken cancellationToken)
    {
        var extraction = BillEmailExtractor.Extract(message);
        if (!extraction.IsBillRelated)
            return null;

        var import = new EmailImport
        {
            Provider = provider,
            MessageId = message.Id,
            Subject = message.Subject.Length > 300 ? message.Subject[..300] : message.Subject,
            FromAddress = message.From.Length > 200 ? message.From[..200] : message.From,
            ReceivedAt = message.ReceivedAt,
            ProviderName = extraction.ProviderName,
            BillType = extraction.BillType,
            MaskedAccount = extraction.MaskedAccount,
            Amount = extraction.Amount,
            MinimumDue = extraction.MinimumDue,
            DueDate = extraction.DueDate,
            PeriodStart = extraction.PeriodStart,
            PeriodEnd = extraction.PeriodEnd,
            AttachmentName = extraction.AttachmentName,
            Confidence = extraction.Confidence,
            LooksLikePayment = extraction.LooksLikePayment,
            Status = EmailImportStatus.Detected
        };

        if (!extraction.LooksLikePayment && (extraction.Amount is null || extraction.DueDate is null))
        {
            import.Status = EmailImportStatus.Failed;
            import.FailureReason = $"Could not find the {string.Join(" and ", extraction.Missing)}. Open the email and enter the details manually.";
        }
        else if (!extraction.LooksLikePayment &&
                 await bills.FindDuplicateAsync(extraction.ProviderName ?? string.Empty, extraction.MaskedAccount, extraction.PeriodStart,
                     extraction.PeriodEnd, extraction.Amount!.Value, extraction.DueDate!.Value, null, cancellationToken) is { } duplicate)
        {
            import.Status = EmailImportStatus.Duplicate;
            import.DuplicateOfBillId = duplicate.Id;
        }

        return import;
    }

    public async Task<IReadOnlyList<EmailImportResponse>> ListAsync(EmailImportStatus? status, CancellationToken cancellationToken)
    {
        var query = database.EmailImports.AsNoTracking();
        if (status is { } filter)
            query = query.Where(import => import.Status == filter);
        var items = await query.OrderByDescending(import => import.ReceivedAt).Take(500).ToListAsync(cancellationToken);
        return items.Select(ToResponse).ToList();
    }

    /// <summary>Saves the user-reviewed details as a bill. Duplicate detection runs again on the edited values.</summary>
    public async Task<BillResponse> ConfirmAsync(Guid id, BillRequest request, CancellationToken cancellationToken)
    {
        var import = await FindAsync(id, cancellationToken);
        if (import.Status == EmailImportStatus.Confirmed)
            throw new BusinessRuleException("This email has already been saved as a bill.");

        var source = $"{import.Provider}: {import.Subject}";
        var bill = await bills.CreateAsync(request with { EmailSource = source.Length > 200 ? source[..200] : source }, cancellationToken, import.Id);
        import.Status = EmailImportStatus.Confirmed;
        import.BillId = bill.Id;
        await database.SaveChangesAsync(cancellationToken);
        return bill;
    }

    public async Task<EmailImportResponse> SetIgnoredAsync(Guid id, bool ignored, CancellationToken cancellationToken)
    {
        var import = await FindAsync(id, cancellationToken);
        if (import.Status == EmailImportStatus.Confirmed)
            throw new BusinessRuleException("Confirmed emails cannot be ignored. Delete or ignore the bill instead.");
        import.Status = ignored
            ? EmailImportStatus.Ignored
            : import.Amount is null || (import.DueDate is null && !import.LooksLikePayment) ? EmailImportStatus.Failed : EmailImportStatus.Detected;
        await database.SaveChangesAsync(cancellationToken);
        return ToResponse(import);
    }

    /// <summary>Unpaid bills that a payment email could belong to, best matches first. The user must pick one.</summary>
    public async Task<IReadOnlyList<BillResponse>> PaymentCandidatesAsync(Guid id, CancellationToken cancellationToken)
    {
        var import = await FindAsync(id, cancellationToken);
        var unpaid = (await bills.ListAsync(new BillQuery(null, null, null, null, null, null, null), cancellationToken))
            .Where(bill => bill.Unpaid > 0 && bill.Status != BillStatus.Ignored).ToList();
        return unpaid
            .OrderByDescending(bill => Score(bill, import))
            .ThenBy(bill => bill.DueDate)
            .Take(10)
            .ToList();
    }

    public async Task<BillResponse> ApplyPaymentAsync(Guid id, ApplyPaymentRequest request, CancellationToken cancellationToken)
    {
        var import = await FindAsync(id, cancellationToken);
        if (import.Status == EmailImportStatus.Confirmed)
            throw new BusinessRuleException("This email has already been applied.");

        var bill = await bills.PayAsync(request.BillId!.Value,
            new BillPaymentRequest(request.Amount, request.Date, request.PaymentMethod, request.RecordAsExpense, null, null), cancellationToken);
        import.Status = EmailImportStatus.Confirmed;
        import.BillId = bill.Id;
        await database.SaveChangesAsync(cancellationToken);
        return bill;
    }

    private static int Score(BillResponse bill, EmailImport import)
    {
        var score = 0;
        if (!string.IsNullOrWhiteSpace(import.ProviderName) && bill.Provider.Contains(import.ProviderName, StringComparison.OrdinalIgnoreCase)) score += 3;
        if (import.MaskedAccount is not null && bill.AccountIdentifier == import.MaskedAccount) score += 3;
        if (import.Amount is { } amount && (bill.Unpaid == amount || bill.MinimumDue == amount)) score += 2;
        if (import.BillType == bill.BillType) score += 1;
        return score;
    }

    private async Task<string> GetFreshAccessTokenAsync(EmailConnection connection, CancellationToken cancellationToken)
    {
        var tokens = ReadTokens(connection);
        if (connection.AccessTokenExpiresAt > DateTime.UtcNow.AddMinutes(2))
            return tokens.AccessToken;
        if (string.IsNullOrWhiteSpace(tokens.RefreshToken))
            throw new ExternalServiceException("Access has expired. Reconnect the mailbox.");

        var refreshed = await Client(connection.Provider).RefreshAsync(tokens.RefreshToken, cancellationToken);
        StoreTokens(connection, refreshed);
        return refreshed.AccessToken;
    }

    private void StoreTokens(EmailConnection connection, OAuthTokens tokens)
    {
        connection.EncryptedAccessToken = tokenProtector.Protect(tokens.AccessToken);
        connection.EncryptedRefreshToken = tokens.RefreshToken is null ? null : tokenProtector.Protect(tokens.RefreshToken);
        connection.AccessTokenExpiresAt = tokens.ExpiresAt;
    }

    private OAuthTokens ReadTokens(EmailConnection connection) => new(
        tokenProtector.Unprotect(connection.EncryptedAccessToken),
        connection.EncryptedRefreshToken is null ? null : tokenProtector.Unprotect(connection.EncryptedRefreshToken),
        connection.AccessTokenExpiresAt);

    private async Task<EmailImport> FindAsync(Guid id, CancellationToken cancellationToken) =>
        await database.EmailImports.FirstOrDefaultAsync(import => import.Id == id, cancellationToken) ?? throw new NotFoundException("Imported email");

    public static EmailImportResponse ToResponse(EmailImport import) => new(
        import.Id, import.Provider, import.Subject, import.FromAddress, import.ReceivedAt, import.CreatedAt, import.Status,
        import.ProviderName, import.BillType, import.MaskedAccount, import.Amount, import.MinimumDue, import.DueDate,
        import.PeriodStart, import.PeriodEnd, import.AttachmentName, import.Confidence,
        import.Confidence < BillExtraction.LowConfidenceThreshold, import.LooksLikePayment, import.FailureReason,
        import.BillId, import.DuplicateOfBillId);

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
