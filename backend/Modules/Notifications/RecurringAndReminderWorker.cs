using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Settings;

namespace MoneyVisualizer.Api.Modules.Notifications;

/// <summary>Periodically materializes due recurring transactions and generates reminders for every user.</summary>
public sealed class RecurringAndReminderWorker(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<RecurringAndReminderWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, configuration.GetValue("BackgroundJobs:IntervalMinutes", 60)));
        // Small delay so startup migrations finish first.
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(exception, "Background job run failed");
            }

            await Task.Delay(interval, stoppingToken);
        }
    }

    public async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        List<Guid> userIds;
        using (var scope = scopes.CreateScope())
            userIds = await scope.ServiceProvider.GetRequiredService<MoneyDbContext>().Users.AsNoTracking().Select(user => user.Id).ToListAsync(cancellationToken);

        foreach (var userId in userIds)
        {
            using var scope = scopes.CreateScope();
            scope.ServiceProvider.GetRequiredService<CurrentUser>().UserId = userId;
            var created = await MaterializeRecurringAsync(scope.ServiceProvider, cancellationToken);
            var notified = await scope.ServiceProvider.GetRequiredService<NotificationService>().GenerateAsync(cancellationToken);
            if (created + notified > 0)
                logger.LogInformation("User {UserId}: {Created} recurring transactions, {Notified} notifications", userId, created, notified);
        }
    }

    public static async Task<int> MaterializeRecurringAsync(IServiceProvider services, CancellationToken cancellationToken)
    {
        var database = services.GetRequiredService<MoneyDbContext>();
        var today = await services.GetRequiredService<SettingsService>().TodayAsync(cancellationToken);
        var due = await database.RecurringTransactions.Where(item => item.IsActive && item.NextDate <= today).ToListAsync(cancellationToken);
        var excluded = await database.Categories.AsNoTracking().Where(category => category.ExcludeFromTotals).Select(category => category.Id).ToListAsync(cancellationToken);
        var created = 0;
        foreach (var item in due)
        {
            // Catch up on missed occurrences but never create future-dated entries.
            while (item.IsActive && item.NextDate <= today)
            {
                if (item.EndDate is { } end && item.NextDate > end)
                {
                    item.IsActive = false;
                    break;
                }

                database.PersonalTransactions.Add(new PersonalTransaction
                {
                    Type = item.Type,
                    Amount = item.Amount,
                    Date = item.NextDate,
                    CategoryId = item.CategoryId,
                    Description = item.Description,
                    Merchant = item.Merchant,
                    PaymentMethod = item.PaymentMethod,
                    AccountId = item.AccountId,
                    IsRecurring = true,
                    RecurringTransactionId = item.Id,
                    ExcludeFromTotals = excluded.Contains(item.CategoryId)
                });
                item.NextDate = FinanceCalculator.Advance(item.NextDate, item.Frequency);
                created++;
            }
        }

        await database.SaveChangesAsync(cancellationToken);
        return created;
    }
}
