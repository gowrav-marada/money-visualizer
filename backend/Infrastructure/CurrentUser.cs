namespace MoneyVisualizer.Api.Infrastructure;

/// <summary>Scoped holder for the signed-in user's internal id, populated by <see cref="CurrentUserMiddleware"/>.</summary>
public sealed class CurrentUser
{
    public Guid UserId { get; set; }
    public bool IsResolved => UserId != Guid.Empty;
}
