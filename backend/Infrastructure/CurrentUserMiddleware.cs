using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Infrastructure;

/// <summary>Maps the authenticated principal to an internal <see cref="User"/>, creating it with defaults on first sign-in.</summary>
public sealed class CurrentUserMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, CurrentUser currentUser, MoneyDbContext database, UserProvisioner provisioner)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var externalId = context.User.FindFirstValue("http://schemas.microsoft.com/identity/claims/objectidentifier")
                             ?? context.User.FindFirstValue("oid")
                             ?? context.User.FindFirstValue("sub")
                             ?? context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (!string.IsNullOrWhiteSpace(externalId))
            {
                var user = await database.Users.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.ExternalId == externalId, context.RequestAborted);
                user ??= await provisioner.CreateAsync(
                    externalId,
                    context.User.FindFirstValue(ClaimTypes.Email) ?? context.User.FindFirstValue("email") ?? context.User.FindFirstValue("preferred_username") ?? string.Empty,
                    context.User.FindFirstValue(ClaimTypes.Name) ?? context.User.FindFirstValue("name") ?? "User",
                    context.RequestAborted);
                currentUser.UserId = user.Id;
            }
        }

        await next(context);
    }
}
