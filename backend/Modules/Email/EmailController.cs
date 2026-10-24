using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Bills;

namespace MoneyVisualizer.Api.Modules.Email;

/// <summary>Optional, read-only mailbox integration for detecting bills.</summary>
[ApiController]
[Authorize]
[Route("api/email")]
public sealed class EmailController(EmailImportService service, CurrentUser currentUser, IConfiguration configuration) : ControllerBase
{
    private const string StateCookie = "mv.email.oauth";

    [HttpGet("status")]
    public Task<EmailStatusResponse> Status(CancellationToken cancellationToken) => service.StatusAsync(cancellationToken);

    /// <summary>Redirects the browser to Microsoft or Google to grant read-only mail access.</summary>
    [HttpGet("connect/{provider}")]
    public IActionResult Connect(MailProvider provider)
    {
        var (url, state) = service.BeginConnect(provider, currentUser.UserId, RedirectUri(provider));
        Response.Cookies.Append(StateCookie, state, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = Request.IsHttps,
            MaxAge = TimeSpan.FromMinutes(10),
            Path = "/api/email/callback"
        });
        return Redirect(url);
    }

    [HttpGet("callback/{provider}")]
    public async Task<IActionResult> Callback(MailProvider provider, [FromQuery] string? code, [FromQuery] string? state, [FromQuery] string? error, CancellationToken cancellationToken)
    {
        var frontend = configuration["Frontend:Origin"] ?? string.Empty;
        var expectedState = Request.Cookies[StateCookie];
        Response.Cookies.Delete(StateCookie, new CookieOptions { Path = "/api/email/callback" });
        if (!string.IsNullOrWhiteSpace(error) || string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
            return Redirect($"{frontend}/bills?tab=email&error={Uri.EscapeDataString(error ?? "cancelled")}");

        try
        {
            await service.CompleteConnectAsync(provider, currentUser.UserId, code, state, expectedState, RedirectUri(provider), cancellationToken);
            return Redirect($"{frontend}/bills?tab=email&connected={provider}");
        }
        catch (AppException exception)
        {
            return Redirect($"{frontend}/bills?tab=email&error={Uri.EscapeDataString(exception.Message)}");
        }
    }

    /// <summary>Disconnects the mailbox, revokes the grant where supported and optionally deletes imported email records.</summary>
    [HttpDelete("connections/{provider}")]
    public async Task<IActionResult> Disconnect(MailProvider provider, [FromQuery] bool deleteImports, CancellationToken cancellationToken)
    {
        await service.DisconnectAsync(provider, deleteImports, cancellationToken);
        return NoContent();
    }

    [HttpPost("sync")]
    public Task<SyncResult> Sync(CancellationToken cancellationToken) => service.SyncAsync(cancellationToken);

    [HttpGet("imports")]
    public Task<IReadOnlyList<EmailImportResponse>> Imports([FromQuery] EmailImportStatus? status, CancellationToken cancellationToken) =>
        service.ListAsync(status, cancellationToken);

    /// <summary>Saves a reviewed email as a bill. Returns 409 if a matching bill already exists unless allowDuplicate is set.</summary>
    [HttpPost("imports/{id:guid}/confirm")]
    public Task<BillResponse> Confirm(Guid id, ConfirmImportRequest request, CancellationToken cancellationToken) =>
        service.ConfirmAsync(id, request.Bill, cancellationToken);

    [HttpPost("imports/{id:guid}/ignore")]
    public Task<EmailImportResponse> Ignore(Guid id, CancellationToken cancellationToken) => service.SetIgnoredAsync(id, true, cancellationToken);

    [HttpPost("imports/{id:guid}/restore")]
    public Task<EmailImportResponse> Restore(Guid id, CancellationToken cancellationToken) => service.SetIgnoredAsync(id, false, cancellationToken);

    [HttpGet("imports/{id:guid}/candidates")]
    public Task<IReadOnlyList<BillResponse>> Candidates(Guid id, CancellationToken cancellationToken) => service.PaymentCandidatesAsync(id, cancellationToken);

    /// <summary>Records a payment detected in an email against a bill the user selected.</summary>
    [HttpPost("imports/{id:guid}/apply-payment")]
    public Task<BillResponse> ApplyPayment(Guid id, ApplyPaymentRequest request, CancellationToken cancellationToken) =>
        service.ApplyPaymentAsync(id, request, cancellationToken);

    private string RedirectUri(MailProvider provider)
    {
        var baseUrl = configuration["Email:RedirectBaseUrl"] ?? configuration["Frontend:Origin"] ?? $"{Request.Scheme}://{Request.Host}";
        return $"{baseUrl.TrimEnd('/')}/api/email/callback/{provider}";
    }
}
