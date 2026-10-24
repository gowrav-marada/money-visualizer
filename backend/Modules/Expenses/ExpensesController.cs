using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MoneyVisualizer.Api.Modules.Expenses;

/// <summary>Personal income and expenses.</summary>
[ApiController]
[Authorize]
[Route("api/expenses")]
public sealed class ExpensesController(ExpenseService service) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<TransactionResponse>> List([FromQuery] TransactionQuery query, CancellationToken cancellationToken) =>
        service.ListAsync(query, cancellationToken);

    [HttpGet("summary")]
    public Task<ExpenseSummary> Summary([FromQuery] TransactionQuery query, CancellationToken cancellationToken) =>
        service.SummaryAsync(query, cancellationToken);

    /// <summary>Income and expense totals per day, week, month or year.</summary>
    [HttpGet("periods")]
    public Task<IReadOnlyList<PeriodBucket>> Periods([FromQuery] string granularity = "month", [FromQuery] int count = 6, CancellationToken cancellationToken = default) =>
        service.PeriodsAsync(granularity, count, cancellationToken);

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] TransactionQuery query, CancellationToken cancellationToken) =>
        File(await service.ExportCsvAsync(query, cancellationToken), "text/csv", $"transactions-{DateTime.UtcNow:yyyyMMdd}.csv");

    [HttpGet("{id:guid}")]
    public Task<TransactionResponse> Get(Guid id, CancellationToken cancellationToken) => service.GetAsync(id, cancellationToken);

    [HttpPost]
    public async Task<ActionResult<TransactionResponse>> Create(TransactionRequest request, CancellationToken cancellationToken)
    {
        var created = await service.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    public Task<TransactionResponse> Update(Guid id, TransactionRequest request, CancellationToken cancellationToken) =>
        service.UpdateAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await service.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpGet("recurring")]
    public Task<IReadOnlyList<RecurringResponse>> Recurring(CancellationToken cancellationToken) => service.RecurringAsync(cancellationToken);

    [HttpPost("recurring/{id:guid}/stop")]
    public async Task<IActionResult> StopRecurring(Guid id, CancellationToken cancellationToken)
    {
        await service.StopRecurringAsync(id, cancellationToken);
        return NoContent();
    }
}
