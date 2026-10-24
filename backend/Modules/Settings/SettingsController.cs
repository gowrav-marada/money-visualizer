using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MoneyVisualizer.Api.Infrastructure;

namespace MoneyVisualizer.Api.Modules.Settings;

[ApiController]
[Authorize]
[Route("api/settings")]
public sealed class SettingsController(SettingsAdminService service) : ControllerBase
{
    [HttpGet]
    public Task<SettingsResponse> Get(CancellationToken cancellationToken) => service.GetAsync(cancellationToken);

    [HttpPut]
    public Task<SettingsResponse> Update(UpdateSettingsRequest request, CancellationToken cancellationToken) => service.UpdateAsync(request, cancellationToken);

    [HttpGet("categories")]
    public Task<IReadOnlyList<CategoryResponse>> Categories(CancellationToken cancellationToken) => service.CategoriesAsync(cancellationToken);

    [HttpPost("categories")]
    public Task<CategoryResponse> CreateCategory(CategoryRequest request, CancellationToken cancellationToken) => service.SaveCategoryAsync(null, request, cancellationToken);

    [HttpPut("categories/{id:guid}")]
    public Task<CategoryResponse> UpdateCategory(Guid id, CategoryRequest request, CancellationToken cancellationToken) => service.SaveCategoryAsync(id, request, cancellationToken);

    [HttpDelete("categories/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id, CancellationToken cancellationToken)
    {
        await service.DeleteCategoryAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpGet("accounts")]
    public Task<IReadOnlyList<AccountResponse>> Accounts(CancellationToken cancellationToken) => service.AccountsAsync(cancellationToken);

    [HttpPost("accounts")]
    public Task<AccountResponse> CreateAccount(AccountRequest request, CancellationToken cancellationToken) => service.SaveAccountAsync(null, request, cancellationToken);

    [HttpPut("accounts/{id:guid}")]
    public Task<AccountResponse> UpdateAccount(Guid id, AccountRequest request, CancellationToken cancellationToken) => service.SaveAccountAsync(id, request, cancellationToken);

    [HttpDelete("accounts/{id:guid}")]
    public async Task<IActionResult> DeleteAccount(Guid id, CancellationToken cancellationToken)
    {
        await service.DeleteAccountRecordAsync(id, cancellationToken);
        return NoContent();
    }

    [HttpPost("lock")]
    public async Task<IActionResult> SetPin(SetPinRequest request, CancellationToken cancellationToken)
    {
        await service.SetPinAsync(request, cancellationToken);
        return NoContent();
    }

    [HttpPost("lock/verify")]
    public async Task<IActionResult> VerifyPin(PinRequest request, CancellationToken cancellationToken) =>
        await service.VerifyPinAsync(request.Pin, cancellationToken) ? NoContent() : throw new BusinessRuleException("Incorrect PIN.");

    [HttpPost("lock/disable")]
    public async Task<IActionResult> DisableLock(PinRequest request, CancellationToken cancellationToken)
    {
        await service.DisableLockAsync(request.Pin, cancellationToken);
        return NoContent();
    }

    /// <summary>Downloads a JSON backup of all data (mailbox tokens excluded).</summary>
    [HttpGet("backup")]
    public async Task<IActionResult> Backup(CancellationToken cancellationToken) =>
        new JsonResult(await service.BackupAsync(cancellationToken))
        {
            ContentType = "application/json"
        };

    /// <summary>Permanently deletes the user's account and all data. Requires the confirmation text "DELETE".</summary>
    [HttpPost("delete-account")]
    public async Task<IActionResult> DeleteUserAccount(DeleteAccountRequest request, CancellationToken cancellationToken)
    {
        if (request.Confirmation != "DELETE")
            throw new BusinessRuleException("Type DELETE to confirm.");
        await service.DeleteEverythingAsync(cancellationToken);
        return NoContent();
    }
}
