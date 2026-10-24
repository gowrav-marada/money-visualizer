using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MoneyVisualizer.Api.Modules.Credits;

/// <summary>Money to receive from, or pay to, other people.</summary>
[ApiController]
[Authorize]
[Route("api/credits")]
public sealed class CreditsController(CreditService service) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<CreditResponse>> List([FromQuery] CreditQuery query, CancellationToken cancellationToken) =>
        service.ListAsync(query, cancellationToken);

    [HttpGet("summary")]
    public Task<CreditSummary> Summary(CancellationToken cancellationToken) => service.SummaryAsync(cancellationToken);

    /// <summary>Balances grouped by person.</summary>
    [HttpGet("people")]
    public Task<IReadOnlyList<PersonBalance>> People(CancellationToken cancellationToken) => service.PeopleAsync(cancellationToken);

    [HttpGet("people/names")]
    public Task<IReadOnlyList<string>> PersonNames(CancellationToken cancellationToken) => service.PersonNamesAsync(cancellationToken);

    [HttpGet("{id:guid}")]
    public Task<CreditResponse> Get(Guid id, CancellationToken cancellationToken) => service.GetAsync(id, cancellationToken);

    [HttpGet("{id:guid}/history")]
    public Task<IReadOnlyList<HistoryEntry>> History(Guid id, CancellationToken cancellationToken) => service.HistoryAsync(id, cancellationToken);

    [HttpPost]
    public async Task<ActionResult<CreditResponse>> Create(CreditRequest request, CancellationToken cancellationToken)
    {
        var created = await service.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    public Task<CreditResponse> Update(Guid id, CreditRequest request, CancellationToken cancellationToken) =>
        service.UpdateAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await service.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    /// <summary>Records a partial (or full) payment against the record.</summary>
    [HttpPost("{id:guid}/settlements")]
    public Task<CreditResponse> Settle(Guid id, SettlementRequest request, CancellationToken cancellationToken) =>
        service.SettleAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}/settlements/{settlementId:guid}")]
    public Task<CreditResponse> DeleteSettlement(Guid id, Guid settlementId, CancellationToken cancellationToken) =>
        service.DeleteSettlementAsync(id, settlementId, cancellationToken);

    [HttpPost("{id:guid}/mark-paid")]
    public Task<CreditResponse> MarkPaid(Guid id, MarkPaidRequest request, CancellationToken cancellationToken) =>
        service.MarkPaidAsync(id, request, cancellationToken);

    [HttpPut("{id:guid}/reminder")]
    public Task<CreditResponse> Reminder(Guid id, ReminderRequest request, CancellationToken cancellationToken) =>
        service.SetReminderAsync(id, request, cancellationToken);
}
