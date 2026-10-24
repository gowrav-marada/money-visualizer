using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MoneyVisualizer.Api.Modules.Dashboard;

[ApiController]
[Authorize]
[Route("api/dashboard")]
public sealed class DashboardController(DashboardService service) : ControllerBase
{
    /// <summary>Totals, net position, lists, charts and alerts for the dashboard in a single call.</summary>
    [HttpGet]
    public Task<DashboardResponse> Get(CancellationToken cancellationToken) => service.GetAsync(cancellationToken);
}
