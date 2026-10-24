using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MoneyVisualizer.Api.Modules.Bills;

/// <summary>Bill obligations entered manually or confirmed from email.</summary>
[ApiController]
[Authorize]
[Route("api/bills")]
public sealed class BillsController(BillService service) : ControllerBase
{
    [HttpGet]
    public Task<IReadOnlyList<BillResponse>> List([FromQuery] BillQuery query, CancellationToken cancellationToken) =>
        service.ListAsync(query, cancellationToken);

    [HttpGet("summary")]
    public Task<BillSummary> Summary(CancellationToken cancellationToken) => service.SummaryAsync(cancellationToken);

    [HttpGet("providers")]
    public Task<IReadOnlyList<ProviderGroup>> Providers(CancellationToken cancellationToken) => service.ProvidersAsync(cancellationToken);

    [HttpGet("{id:guid}")]
    public Task<BillResponse> Get(Guid id, CancellationToken cancellationToken) => service.GetAsync(id, cancellationToken);

    /// <summary>Creates a bill manually. Returns 409 when an identical bill exists unless allowDuplicate is set.</summary>
    [HttpPost]
    public async Task<ActionResult<BillResponse>> Create(BillRequest request, CancellationToken cancellationToken)
    {
        var created = await service.CreateAsync(request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    public Task<BillResponse> Update(Guid id, BillRequest request, CancellationToken cancellationToken) =>
        service.UpdateAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await service.DeleteAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/payments")]
    public Task<BillResponse> Pay(Guid id, BillPaymentRequest request, CancellationToken cancellationToken) =>
        service.PayAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}/payments/{paymentId:guid}")]
    public Task<BillResponse> DeletePayment(Guid id, Guid paymentId, CancellationToken cancellationToken) =>
        service.DeletePaymentAsync(id, paymentId, cancellationToken);

    [HttpPut("{id:guid}/ignore")]
    public Task<BillResponse> Ignore(Guid id, IgnoreRequest request, CancellationToken cancellationToken) =>
        service.SetIgnoredAsync(id, request.Ignored, cancellationToken);

    [HttpPost("{id:guid}/next")]
    public Task<BillResponse> CreateNext(Guid id, CancellationToken cancellationToken) => service.CreateNextAsync(id, cancellationToken);
}
