using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;

namespace MoneyVisualizer.Api.Modules.Attachments;

[ApiController]
[Authorize]
[Route("api/attachments")]
public sealed class AttachmentsController(MoneyDbContext database, AttachmentStore store, CurrentUser currentUser) : ControllerBase
{
    private static readonly HashSet<string> OwnerTypes = ["transaction", "credit", "bill"];

    public sealed record AttachmentResponse(Guid Id, string FileName, string ContentType, long Size, DateTime CreatedAt);

    [HttpGet]
    public async Task<IReadOnlyList<AttachmentResponse>> List([FromQuery] string ownerType, [FromQuery] Guid ownerId, CancellationToken cancellationToken) =>
        await database.Attachments.AsNoTracking()
            .Where(attachment => attachment.OwnerType == ownerType && attachment.OwnerId == ownerId)
            .OrderByDescending(attachment => attachment.CreatedAt)
            .Select(attachment => new AttachmentResponse(attachment.Id, attachment.FileName, attachment.ContentType, attachment.Size, attachment.CreatedAt))
            .ToListAsync(cancellationToken);

    [HttpPost]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<ActionResult<AttachmentResponse>> Upload([FromForm] string ownerType, [FromForm] Guid ownerId, IFormFile file, CancellationToken cancellationToken)
    {
        if (!OwnerTypes.Contains(ownerType))
            throw new BusinessRuleException("Unknown attachment owner type.");
        await EnsureOwnerExistsAsync(ownerType, ownerId, cancellationToken);

        var contentType = store.ValidateAndGetContentType(file);
        var path = await store.SaveAsync(currentUser.UserId, file, cancellationToken);
        var attachment = new Attachment
        {
            OwnerType = ownerType,
            OwnerId = ownerId,
            FileName = Path.GetFileName(file.FileName),
            ContentType = contentType,
            Size = file.Length,
            StoragePath = path
        };
        database.Attachments.Add(attachment);
        await database.SaveChangesAsync(cancellationToken);
        return new AttachmentResponse(attachment.Id, attachment.FileName, attachment.ContentType, attachment.Size, attachment.CreatedAt);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Download(Guid id, CancellationToken cancellationToken)
    {
        var attachment = await database.Attachments.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken)
                         ?? throw new NotFoundException("Attachment");
        return PhysicalFile(store.ResolvePath(attachment.StoragePath), attachment.ContentType, attachment.FileName);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var attachment = await database.Attachments.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken)
                         ?? throw new NotFoundException("Attachment");
        database.Attachments.Remove(attachment);
        await database.SaveChangesAsync(cancellationToken);
        store.Delete(attachment.StoragePath);
        return NoContent();
    }

    private async Task EnsureOwnerExistsAsync(string ownerType, Guid ownerId, CancellationToken cancellationToken)
    {
        var exists = ownerType switch
        {
            "transaction" => await database.PersonalTransactions.AnyAsync(entity => entity.Id == ownerId, cancellationToken),
            "credit" => await database.ReceivablePayables.AnyAsync(entity => entity.Id == ownerId, cancellationToken),
            _ => await database.Bills.AnyAsync(entity => entity.Id == ownerId, cancellationToken)
        };
        if (!exists)
            throw new NotFoundException("Record");
    }
}
