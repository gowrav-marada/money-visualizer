using System.Text.Json;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Modules.Email;

/// <summary>Outlook / Microsoft 365 via Microsoft Graph. Requests read-only mail access only (Mail.Read).</summary>
public sealed class OutlookMailClient(HttpClient http, IConfiguration configuration) : OAuthMailboxClient(http, configuration, "Outlook")
{
    private readonly string tenant = configuration["Email:Outlook:TenantId"] ?? "common";

    public override MailProvider Provider => MailProvider.Outlook;
    protected override string AuthorizeEndpoint => $"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize";
    protected override string TokenEndpoint => $"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token";
    protected override string Scopes => "offline_access User.Read Mail.Read";
    protected override IEnumerable<KeyValuePair<string, string>> ExtraAuthorizeParameters => [new("response_mode", "query"), new("prompt", "select_account")];

    public override async Task<string> GetEmailAddressAsync(string accessToken, CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", accessToken, cancellationToken);
        var root = document.RootElement;
        return (root.TryGetProperty("mail", out var mail) ? mail.GetString() : null)
               ?? root.GetProperty("userPrincipalName").GetString() ?? "Outlook mailbox";
    }

    public override async Task<IReadOnlyList<MailMessage>> SearchBillEmailsAsync(string accessToken, DateTime since, int max, CancellationToken cancellationToken)
    {
        var messages = new List<MailMessage>();
        var filter = Uri.EscapeDataString($"receivedDateTime ge {since:yyyy-MM-ddTHH:mm:ssZ}");
        string? url = $"https://graph.microsoft.com/v1.0/me/messages?$filter={filter}&$orderby=receivedDateTime desc&$top=50&$select=id,subject,from,receivedDateTime,body,hasAttachments";
        while (url is not null && messages.Count < max)
        {
            using var page = await GetJsonAsync(url, accessToken, cancellationToken,
                request => request.Headers.Add("Prefer", "outlook.body-content-type=\"text\""));
            foreach (var item in page.RootElement.GetProperty("value").EnumerateArray())
            {
                var subject = item.TryGetProperty("subject", out var subjectElement) ? subjectElement.GetString() ?? string.Empty : string.Empty;
                var body = item.TryGetProperty("body", out var bodyElement) && bodyElement.TryGetProperty("content", out var content) ? content.GetString() ?? string.Empty : string.Empty;
                // Cheap local keyword pre-filter so only likely bill emails are examined further.
                var probe = $"{subject} {(body.Length > 3000 ? body[..3000] : body)}".ToLowerInvariant();
                if (!BillEmailExtractor.Indicators.Any(probe.Contains) && !probe.Contains("payment"))
                    continue;

                var id = item.GetProperty("id").GetString()!;
                var attachments = item.TryGetProperty("hasAttachments", out var has) && has.GetBoolean()
                    ? await GetAttachmentNamesAsync(id, accessToken, cancellationToken)
                    : [];
                messages.Add(new MailMessage(id, subject, ReadFrom(item),
                    item.GetProperty("receivedDateTime").GetDateTime().ToUniversalTime(), Truncate(body), attachments));
                if (messages.Count >= max)
                    break;
            }

            url = page.RootElement.TryGetProperty("@odata.nextLink", out var next) ? next.GetString() : null;
        }

        return messages;
    }

    private async Task<IReadOnlyList<string>> GetAttachmentNamesAsync(string id, string accessToken, CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync($"https://graph.microsoft.com/v1.0/me/messages/{Uri.EscapeDataString(id)}/attachments?$select=name", accessToken, cancellationToken);
        return document.RootElement.GetProperty("value").EnumerateArray()
            .Select(attachment => attachment.TryGetProperty("name", out var name) ? name.GetString() : null)
            .OfType<string>().ToList();
    }

    private static string ReadFrom(JsonElement item)
    {
        if (!item.TryGetProperty("from", out var from) || !from.TryGetProperty("emailAddress", out var address))
            return string.Empty;
        var name = address.TryGetProperty("name", out var nameElement) ? nameElement.GetString() : null;
        var email = address.TryGetProperty("address", out var emailElement) ? emailElement.GetString() : null;
        return string.IsNullOrWhiteSpace(name) ? email ?? string.Empty : $"{name} <{email}>";
    }

    private static string Truncate(string body) => body.Length > 8000 ? body[..8000] : body;
}
