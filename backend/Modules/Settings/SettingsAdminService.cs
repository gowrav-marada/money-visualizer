using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;

namespace MoneyVisualizer.Api.Modules.Settings;

public sealed class SettingsAdminService(MoneyDbContext database, SettingsService settings, CurrentUser currentUser, AttachmentStore attachments)
{
    public async Task<SettingsResponse> GetAsync(CancellationToken cancellationToken) => ToResponse(await settings.GetAsync(cancellationToken));

    public async Task<SettingsResponse> UpdateAsync(UpdateSettingsRequest request, CancellationToken cancellationToken)
    {
        try
        {
            TimeZoneInfo.FindSystemTimeZoneById(request.TimeZone);
        }
        catch (TimeZoneNotFoundException)
        {
            throw new BusinessRuleException("Unknown time zone.");
        }

        var methods = request.PaymentMethods.Select(method => method.Trim()).Where(method => method.Length is > 0 and <= 60)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (methods.Count == 0)
            throw new BusinessRuleException("Add at least one payment method.");

        var setting = await settings.GetAsync(cancellationToken);
        setting.Currency = request.Currency;
        setting.Locale = request.Locale;
        setting.DateFormat = request.DateFormat;
        setting.TimeZone = request.TimeZone;
        setting.MonthlyBudget = request.MonthlyBudget;
        setting.Theme = request.Theme;
        setting.NotificationsEnabled = request.NotificationsEnabled;
        setting.BillReminderDays = request.BillReminderDays;
        setting.DueSoonDays = request.DueSoonDays;
        setting.PaymentMethods = JsonSerializer.Serialize(methods);
        await database.SaveChangesAsync(cancellationToken);
        return ToResponse(setting);
    }

    public async Task<IReadOnlyList<CategoryResponse>> CategoriesAsync(CancellationToken cancellationToken)
    {
        var usage = await database.PersonalTransactions.AsNoTracking()
            .GroupBy(transaction => transaction.CategoryId)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Key, item => item.Count, cancellationToken);
        var categories = await database.Categories.AsNoTracking().ToListAsync(cancellationToken);
        return categories
            .OrderBy(category => category.Kind).ThenBy(category => category.Name == "Other").ThenBy(category => category.Name)
            .Select(category => new CategoryResponse(category.Id, category.Name, category.Kind, category.IsSystem, category.ExcludeFromTotals, usage.GetValueOrDefault(category.Id)))
            .ToList();
    }

    public async Task<CategoryResponse> SaveCategoryAsync(Guid? id, CategoryRequest request, CancellationToken cancellationToken)
    {
        var name = request.Name.Trim();
        if (await database.Categories.AnyAsync(category => category.Id != id && category.Kind == request.Kind && category.Name.ToLower() == name.ToLower(), cancellationToken))
            throw new ConflictException($"A category named \"{name}\" already exists.");

        Category category;
        if (id is { } existingId)
        {
            category = await database.Categories.FirstOrDefaultAsync(candidate => candidate.Id == existingId, cancellationToken) ?? throw new NotFoundException("Category");
            if (category.Kind != request.Kind && await database.PersonalTransactions.AnyAsync(transaction => transaction.CategoryId == existingId, cancellationToken))
                throw new BusinessRuleException("A category in use cannot switch between income and expense.");
        }
        else
        {
            category = new Category();
            database.Categories.Add(category);
        }

        category.Name = name;
        category.Kind = request.Kind!.Value;
        category.ExcludeFromTotals = request.Kind == CategoryKind.Expense && request.ExcludeFromTotals;
        await database.SaveChangesAsync(cancellationToken);

        // Keep historical transactions consistent with the category's counting rule.
        await database.PersonalTransactions.Where(transaction => transaction.CategoryId == category.Id && transaction.ExcludeFromTotals != category.ExcludeFromTotals)
            .ExecuteUpdateAsync(setters => setters.SetProperty(transaction => transaction.ExcludeFromTotals, category.ExcludeFromTotals), cancellationToken);
        return new CategoryResponse(category.Id, category.Name, category.Kind, category.IsSystem, category.ExcludeFromTotals, 0);
    }

    public async Task DeleteCategoryAsync(Guid id, CancellationToken cancellationToken)
    {
        var category = await database.Categories.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken) ?? throw new NotFoundException("Category");
        if (await database.PersonalTransactions.AnyAsync(transaction => transaction.CategoryId == id, cancellationToken) ||
            await database.RecurringTransactions.AnyAsync(transaction => transaction.CategoryId == id, cancellationToken))
            throw new BusinessRuleException("This category is used by transactions. Move them to another category first.");
        database.Categories.Remove(category);
        await database.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<AccountResponse>> AccountsAsync(CancellationToken cancellationToken) =>
        await database.Accounts.AsNoTracking().OrderBy(account => account.IsArchived).ThenBy(account => account.Name)
            .Select(account => new AccountResponse(account.Id, account.Name, account.Kind, account.MaskedNumber, account.IsArchived))
            .ToListAsync(cancellationToken);

    public async Task<AccountResponse> SaveAccountAsync(Guid? id, AccountRequest request, CancellationToken cancellationToken)
    {
        Account account;
        if (id is { } existingId)
        {
            account = await database.Accounts.FirstOrDefaultAsync(candidate => candidate.Id == existingId, cancellationToken) ?? throw new NotFoundException("Account");
        }
        else
        {
            account = new Account();
            database.Accounts.Add(account);
        }

        account.Name = request.Name.Trim();
        account.Kind = request.Kind!.Value;
        if (!string.IsNullOrWhiteSpace(request.Number))
            account.MaskedNumber = FinanceCalculator.Mask(request.Number);
        account.IsArchived = request.IsArchived;
        await database.SaveChangesAsync(cancellationToken);
        return new AccountResponse(account.Id, account.Name, account.Kind, account.MaskedNumber, account.IsArchived);
    }

    public async Task DeleteAccountRecordAsync(Guid id, CancellationToken cancellationToken)
    {
        var account = await database.Accounts.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken) ?? throw new NotFoundException("Account");
        if (await database.PersonalTransactions.AnyAsync(transaction => transaction.AccountId == id, cancellationToken))
            throw new BusinessRuleException("This account is used by transactions. Archive it instead.");
        database.Accounts.Remove(account);
        await database.SaveChangesAsync(cancellationToken);
    }

    public async Task SetPinAsync(SetPinRequest request, CancellationToken cancellationToken)
    {
        var setting = await settings.GetAsync(cancellationToken);
        if (setting.AppLockEnabled && !VerifyPin(setting.AppLockPinHash, request.CurrentPin))
            throw new BusinessRuleException("The current PIN is incorrect.");
        setting.AppLockPinHash = HashPin(request.Pin);
        setting.AppLockEnabled = true;
        await database.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> VerifyPinAsync(string pin, CancellationToken cancellationToken)
    {
        var setting = await settings.GetAsync(cancellationToken);
        return !setting.AppLockEnabled || VerifyPin(setting.AppLockPinHash, pin);
    }

    public async Task DisableLockAsync(string pin, CancellationToken cancellationToken)
    {
        var setting = await settings.GetAsync(cancellationToken);
        if (setting.AppLockEnabled && !VerifyPin(setting.AppLockPinHash, pin))
            throw new BusinessRuleException("The PIN is incorrect.");
        setting.AppLockEnabled = false;
        setting.AppLockPinHash = null;
        await database.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Full JSON backup of the user's data. Mailbox tokens are never included.</summary>
    public async Task<object> BackupAsync(CancellationToken cancellationToken) => new
    {
        exportedAt = DateTime.UtcNow,
        version = 1,
        settings = await GetAsync(cancellationToken),
        categories = await database.Categories.AsNoTracking().ToListAsync(cancellationToken),
        accounts = await database.Accounts.AsNoTracking().ToListAsync(cancellationToken),
        people = await database.People.AsNoTracking().ToListAsync(cancellationToken),
        transactions = await database.PersonalTransactions.AsNoTracking().ToListAsync(cancellationToken),
        recurring = await database.RecurringTransactions.AsNoTracking().ToListAsync(cancellationToken),
        credits = await database.ReceivablePayables.AsNoTracking().Include(record => record.Settlements).ToListAsync(cancellationToken),
        bills = await database.Bills.AsNoTracking().Include(bill => bill.Payments).ToListAsync(cancellationToken),
        emailImports = await database.EmailImports.AsNoTracking().ToListAsync(cancellationToken)
    };

    /// <summary>Permanently deletes every record that belongs to the signed-in user.</summary>
    public async Task DeleteEverythingAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        await using var transaction = await database.Database.BeginTransactionAsync(cancellationToken);
        await database.Attachments.ExecuteDeleteAsync(cancellationToken);
        await database.BillPayments.ExecuteDeleteAsync(cancellationToken);
        await database.Bills.ExecuteDeleteAsync(cancellationToken);
        await database.Settlements.ExecuteDeleteAsync(cancellationToken);
        await database.ReceivablePayables.ExecuteDeleteAsync(cancellationToken);
        await database.PersonalTransactions.ExecuteDeleteAsync(cancellationToken);
        await database.RecurringTransactions.ExecuteDeleteAsync(cancellationToken);
        await database.People.ExecuteDeleteAsync(cancellationToken);
        await database.Accounts.ExecuteDeleteAsync(cancellationToken);
        await database.Categories.ExecuteDeleteAsync(cancellationToken);
        await database.EmailImports.ExecuteDeleteAsync(cancellationToken);
        await database.EmailConnections.ExecuteDeleteAsync(cancellationToken);
        await database.Notifications.ExecuteDeleteAsync(cancellationToken);
        await database.ApplicationSettings.ExecuteDeleteAsync(cancellationToken);
        await database.AuditLogs.Where(log => log.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        await database.Users.Where(user => user.Id == userId).ExecuteDeleteAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        attachments.DeleteAllFor(userId);
    }

    public static SettingsResponse ToResponse(ApplicationSetting setting) => new(
        setting.Currency, setting.Locale, setting.DateFormat, setting.TimeZone, setting.MonthlyBudget, setting.Theme,
        setting.NotificationsEnabled, setting.BillReminderDays, setting.DueSoonDays,
        JsonSerializer.Deserialize<List<string>>(setting.PaymentMethods) ?? [], setting.AppLockEnabled);

    public static string HashPin(string pin)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(pin, salt, 100_000, HashAlgorithmName.SHA256, 32);
        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool VerifyPin(string? stored, string? pin)
    {
        if (string.IsNullOrWhiteSpace(stored) || string.IsNullOrWhiteSpace(pin))
            return false;
        var parts = stored.Split('.');
        if (parts.Length != 2)
            return false;
        var expected = Convert.FromBase64String(parts[1]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(pin, Convert.FromBase64String(parts[0]), 100_000, HashAlgorithmName.SHA256, 32);
        return CryptographicOperations.FixedTimeEquals(expected, actual);
    }
}
