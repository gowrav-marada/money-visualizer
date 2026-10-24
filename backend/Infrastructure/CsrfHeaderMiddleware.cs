namespace MoneyVisualizer.Api.Infrastructure;

/// <summary>
/// Rejects state-changing API calls that lack the custom header sent by the frontend. Browsers cannot add
/// custom headers to cross-site requests without a CORS preflight, so this blocks CSRF against cookie auth.
/// </summary>
public sealed class CsrfHeaderMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Requested-With";

    public Task InvokeAsync(HttpContext context)
    {
        var method = context.Request.Method;
        var isSafe = HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method);
        if (!isSafe && context.Request.Path.StartsWithSegments("/api") && !context.Request.Headers.ContainsKey(HeaderName))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return context.Response.WriteAsJsonAsync(new { title = "Missing request header", detail = $"Include the {HeaderName} header." });
        }

        return next(context);
    }
}
