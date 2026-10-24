using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Infrastructure;

public sealed class UserProvisioner(MoneyDbContext database, CurrentUser currentUser, IServiceProvider services)
{
    public const string CreditCardPaymentCategory = "Credit-card payment";

    public static readonly string[] ExpenseCategories =
    [
        "Food", "Groceries", "Rent", "Travel", "Fuel", "Shopping", "Medical", "Entertainment", "Education",
        "Telephone", "Internet", "Electricity", CreditCardPaymentCategory, "EMI or loan", "Subscription", "Family", "Other"
    ];

    public static readonly string[] IncomeCategories =
        ["Salary", "Bonus", "Freelance", "Refund", "Interest", "Investment", "Gift", "Other"];

    private static readonly SemaphoreSlim CreationLock = new(1, 1);

    public async Task<User> CreateAsync(string externalId, string email, string displayName, CancellationToken cancellationToken)
    {
        await CreationLock.WaitAsync(cancellationToken);
        try
        {
            var existing = await database.Users.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.ExternalId == externalId, cancellationToken);
            if (existing is not null)
                return existing;
            return await CreateCoreAsync(externalId, email, displayName, cancellationToken);
        }
        finally
        {
            CreationLock.Release();
        }
    }

    private async Task<User> CreateCoreAsync(string externalId, string email, string displayName, CancellationToken cancellationToken)
    {
        var user = new User { ExternalId = externalId, Email = email, DisplayName = displayName, CreatedAt = DateTime.UtcNow };
        database.Users.Add(user);
        currentUser.UserId = user.Id;
        AddDefaults(database, user.Id);

        try
        {
            await database.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A parallel first request created the user; use that one.
            database.ChangeTracker.Clear();
            return await database.Users.AsNoTracking().FirstAsync(candidate => candidate.ExternalId == externalId, cancellationToken);
        }

        return user;
    }

    public static void AddDefaults(MoneyDbContext database, Guid userId)
    {
        foreach (var name in ExpenseCategories)
            database.Categories.Add(new Category
            {
                UserId = userId, Name = name, Kind = CategoryKind.Expense, IsSystem = true,
                ExcludeFromTotals = name == CreditCardPaymentCategory
            });
        foreach (var name in IncomeCategories)
            database.Categories.Add(new Category { UserId = userId, Name = name, Kind = CategoryKind.Income, IsSystem = true });

        database.ApplicationSettings.Add(new ApplicationSetting { UserId = userId });
    }
}
