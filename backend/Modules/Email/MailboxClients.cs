using System.Net.Http.Headers;
using System.Text.Json;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;

namespace MoneyVisualizer.Api.Modules.Email;

public sealed record OAuthTokens(string AccessToken, string? RefreshToken, DateTime ExpiresAt);

public interface IMailboxClient
{
    MailProvider Provider { get; }
    bool IsConfigured { get; }
    string BuildAuthorizeUrl(string state, string codeChallenge, string redirectUri);
    Task<OAuthTokens> ExchangeCodeAsync(string code, string codeVerifier, string redirectUri, CancellationToken cancellationToken);
    Task<OAuthTokens> RefreshAsync(string refreshToken, CancellationToken cancellationToken);
    Task<string> GetEmailAddressAsync(string accessToken, CancellationToken cancellationToken);
    Task<IReadOnlyList<MailMessage>> SearchBillEmailsAsync(string accessToken, DateTime since, int max, CancellationToken cancellationToken);
    Task RevokeAsync(OAuthTokens tokens, CancellationToken cancellationToken);
}

/// <summary>Shared OAuth 2.0 authorization-code + PKCE plumbing.</summary>
public abstract class OAuthMailboxClient(HttpClient http, IConfiguration configuration, string section) : IMailboxClient
{
    protected HttpClient Http { get; } = http;
    protected string? ClientId => configuration[$"Email:{section}:ClientId"];
    protected string? ClientSecret => configuration[$"Email:{section}:ClientSecret"];

    public abstract MailProvider Provider { get; }
    public bool IsConfigured => !string.IsNullOrWhiteSpace(ClientId);
    protected abstract string AuthorizeEndpoint { get; }
    protected abstract string TokenEndpoint { get; }
    protected abstract string Scopes { get; }
    protected virtual IEnumerable<KeyValuePair<string, string>> ExtraAuthorizeParameters => [];

    public string BuildAuthorizeUrl(string state, string codeChallenge, string redirectUri)
    {
        var parameters = new Dictionary<string, string>
        {
            ["client_id"] = ClientId!,
            ["response_type"] = "code",
            ["redirect_uri"] = redirectUri,
            ["scope"] = Scopes,
            ["state"] = state,
            ["code_challenge"] = codeChallenge,
            ["code_challenge_method"] = "S256"
        };
        foreach (var (key, value) in ExtraAuthorizeParameters)
            parameters[key] = value;
        return $"{AuthorizeEndpoint}?{string.Join('&', parameters.Select(pair => $"{pair.Key}={Uri.EscapeDataString(pair.Value)}"))}";
    }

    public Task<OAuthTokens> ExchangeCodeAsync(string code, string codeVerifier, string redirectUri, CancellationToken cancellationToken) =>
        RequestTokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
            ["code_verifier"] = codeVerifier,
            ["scope"] = Scopes
        }, null, cancellationToken);

    public Task<OAuthTokens> RefreshAsync(string refreshToken, CancellationToken cancellationToken) =>
        RequestTokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
            ["scope"] = Scopes
        }, refreshToken, cancellationToken);

    private async Task<OAuthTokens> RequestTokenAsync(Dictionary<string, string> form, string? previousRefresh, CancellationToken cancellationToken)
    {
        form["client_id"] = ClientId!;
        if (!string.IsNullOrWhiteSpace(ClientSecret))
            form["client_secret"] = ClientSecret;

        using var response = await Http.PostAsync(TokenEndpoint, new FormUrlEncodedContent(form), cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new ExternalServiceException($"{Provider} sign-in failed (HTTP {(int)response.StatusCode}). Reconnect the mailbox.");

        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        var expiresIn = root.TryGetProperty("expires_in", out var expires) ? expires.GetInt32() : 3600;
        return new OAuthTokens(
            root.GetProperty("access_token").GetString()!,
            root.TryGetProperty("refresh_token", out var refresh) ? refresh.GetString() : previousRefresh,
            DateTime.UtcNow.AddSeconds(expiresIn));
    }

    protected async Task<JsonDocument> GetJsonAsync(string url, string accessToken, CancellationToken cancellationToken, Action<HttpRequestMessage>? configure = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        configure?.Invoke(request);
        using var response = await Http.SendAsync(request, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            throw new ExternalServiceException($"{Provider} access has expired or was revoked. Reconnect the mailbox.");
        if (!response.IsSuccessStatusCode)
            throw new ExternalServiceException($"{Provider} returned HTTP {(int)response.StatusCode} while reading mail.");
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
    }

    public abstract Task<string> GetEmailAddressAsync(string accessToken, CancellationToken cancellationToken);
    public abstract Task<IReadOnlyList<MailMessage>> SearchBillEmailsAsync(string accessToken, DateTime since, int max, CancellationToken cancellationToken);
    public virtual Task RevokeAsync(OAuthTokens tokens, CancellationToken cancellationToken) => Task.CompletedTask;
}
