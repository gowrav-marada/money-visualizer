using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Infrastructure;

namespace MoneyVisualizer.Api.Modules.Auth;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(MoneyDbContext database, CurrentUser currentUser, IConfiguration configuration) : ControllerBase
{
    public sealed record MeResponse(Guid Id, string DisplayName, string Email, bool UsesDevelopmentSignIn);

    /// <summary>Returns the signed-in user, or 401 when the user must sign in.</summary>
    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<MeResponse>> Me(CancellationToken cancellationToken)
    {
        var user = await database.Users.AsNoTracking().FirstAsync(candidate => candidate.Id == currentUser.UserId, cancellationToken);
        return new MeResponse(user.Id, user.DisplayName, user.Email, string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientId"]));
    }

    /// <summary>Starts the Google sign-in flow (OpenID Connect).</summary>
    [AllowAnonymous]
    [HttpGet("login")]
    public IActionResult Login([FromQuery] string? returnUrl)
    {
        var target = Url.IsLocalUrl(returnUrl) ? returnUrl : "/";
        // The frontend proxies /api and /signin-oidc, so the redirect stays on the same origin as the SPA.
        if (string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientId"]))
            return Redirect(target!);
        return Challenge(new AuthenticationProperties { RedirectUri = target }, Microsoft.AspNetCore.Authentication.OpenIdConnect.OpenIdConnectDefaults.AuthenticationScheme);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        if (!string.IsNullOrWhiteSpace(configuration["Authentication:Google:ClientId"]))
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return NoContent();
    }
}
