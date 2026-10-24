using System.Text;
using System.Text.Json;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Modules.Email;

/// <summary>Gmail via the Gmail API. Requests the read-only scope (gmail.readonly) only.</summary>
public sealed class GmailMailClient(HttpClient http, IConfiguration configuration) : OAuthMailboxClient(http, configuration, "Gmail")
{
    private const string Query =
        "-in:spam -in:trash -in:drafts {\"bill generated\" \"statement\" \"amount due\" \"minimum amount due\" \"payment due\" \"due date\" " +
        "\"mobile bill\" \"telephone bill\" \"internet bill\" \"broadband\" \"electricity bill\" \"utility bill\" \"subscription renewal\" " +
        "\"emi due\" \"payment reminder\" \"premium due\" \"payment received\"}";

    public override MailProvider Provider => MailProvider.Gmail;
    protected override string AuthorizeEndpoint => "https://accounts.google.com/o/oauth2/v2/auth";
    protected override string TokenEndpoint => "https://oauth2.googleapis.com/token";
    protected override string Scopes => "https://www.googleapis.com/auth/gmail.readonly";
    protected override IEnumerable<KeyValuePair<string, string>> ExtraAuthorizeParameters =>
        [new("access_type", "offline"), new("prompt", "consent"), new("include_granted_scopes", "false")];

    public override async Task<string> GetEmailAddressAsync(string accessToken, CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync("https://gmail.googleapis.com/gmail/v1/users/me/profile", accessToken, cancellationToken);
        return document.RootElement.GetProperty("emailAddress").GetString() ?? "Gmail mailbox";
    }

    public override async Task<IReadOnlyList<MailMessage>> SearchBillEmailsAsync(string accessToken, DateTime since, int max, CancellationToken cancellationToken)
    {
        var query = $"{Query} after:{new DateTimeOffset(since).ToUnixTimeSeconds()}";
        var messages = new List<MailMessage>();
        string? pageToken = null;
        do
        {
            var url = $"https://gmail.googleapis.com/gmail/v1/users/me/messages?q={Uri.EscapeDataString(query)}&maxResults=100";
            if (pageToken is not null)
                url += $"&pageToken={Uri.EscapeDataString(pageToken)}";
            using var list = await GetJsonAsync(url, accessToken, cancellationToken);
            if (list.RootElement.TryGetProperty("messages", out var ids))
            {
                foreach (var id in ids.EnumerateArray().Select(message => message.GetProperty("id").GetString()).OfType<string>())
                {
                    messages.Add(await GetMessageAsync(id, accessToken, cancellationToken));
                    if (messages.Count >= max)
                        return messages;
                }
            }

            pageToken = list.RootElement.TryGetProperty("nextPageToken", out var next) ? next.GetString() : null;
        } while (pageToken is not null);

        return messages;
    }

    public override async Task RevokeAsync(OAuthTokens tokens, CancellationToken cancellationToken)
    {
        var token = tokens.RefreshToken ?? tokens.AccessToken;
        using var response = await Http.PostAsync("https://oauth2.googleapis.com/revoke",
            new FormUrlEncodedContent([new("token", token)]), cancellationToken);
    }

    private async Task<MailMessage> GetMessageAsync(string id, string accessToken, CancellationToken cancellationToken)
    {
        using var document = await GetJsonAsync($"https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=full", accessToken, cancellationToken);
        var root = document.RootElement;
        var received = root.TryGetProperty("internalDate", out var internalDate) && long.TryParse(internalDate.GetString(), out var milliseconds)
            ? DateTimeOffset.FromUnixTimeMilliseconds(milliseconds).UtcDateTime
            : DateTime.UtcNow;
        var plain = new StringBuilder();
        var html = new StringBuilder();
        var attachments = new List<string>();
        if (root.TryGetProperty("payload", out var payload))
            CollectParts(payload, plain, html, attachments);
        var body = plain.Length > 0 ? plain.ToString() : BillEmailExtractor.StripHtml(html.ToString());
        if (body.Length > 8000)
            body = body[..8000];
        return new MailMessage(id, ReadHeader(root, "Subject"), ReadHeader(root, "From"), received, body, attachments);
    }

    private static void CollectParts(JsonElement part, StringBuilder plain, StringBuilder html, List<string> attachments)
    {
        var mimeType = part.TryGetProperty("mimeType", out var mime) ? mime.GetString() ?? string.Empty : string.Empty;
        if (part.TryGetProperty("filename", out var filename) && !string.IsNullOrWhiteSpace(filename.GetString()))
            attachments.Add(filename.GetString()!);
        else if (part.TryGetProperty("body", out var body) && body.TryGetProperty("data", out var data))
        {
            var decoded = DecodeBase64Url(data.GetString());
            if (mimeType.Contains("text/plain", StringComparison.OrdinalIgnoreCase))
                plain.Append(decoded).Append('\n');
            else if (mimeType.Contains("text/html", StringComparison.OrdinalIgnoreCase))
                html.Append(decoded).Append('\n');
        }

        if (part.TryGetProperty("parts", out var parts) && parts.ValueKind == JsonValueKind.Array)
            foreach (var child in parts.EnumerateArray())
                CollectParts(child, plain, html, attachments);
    }

    private static string DecodeBase64Url(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;
        var normalized = value.Replace('-', '+').Replace('_', '/');
        normalized = normalized.PadRight(normalized.Length + (4 - normalized.Length % 4) % 4, '=');
        try
        {
            return Encoding.UTF8.GetString(Convert.FromBase64String(normalized));
        }
        catch (FormatException)
        {
            return string.Empty;
        }
    }

    private static string ReadHeader(JsonElement message, string headerName)
    {
        if (!message.TryGetProperty("payload", out var payload) || !payload.TryGetProperty("headers", out var headers))
            return string.Empty;
        foreach (var header in headers.EnumerateArray())
            if (string.Equals(header.GetProperty("name").GetString(), headerName, StringComparison.OrdinalIgnoreCase))
                return header.GetProperty("value").GetString() ?? string.Empty;
        return string.Empty;
    }
}
