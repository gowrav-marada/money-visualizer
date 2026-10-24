using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Settings;

namespace MoneyVisualizer.Api.Modules.Notifications;

public sealed record NotificationResponse(Guid Id, string Title, string Message, string? Link, DateTime CreatedAt, bool IsRead);

public sealed class NotificationService(MoneyDbContext database, SettingsService settings)
{
    public async Task<IReadOnlyList<NotificationResponse>> ListAsync(CancellationToken cancellationToken)
    {
        await GenerateAsync(cancellationToken);
        return await database.Notifications.AsNoTracking()
            .OrderByDescending(notification => notification.CreatedAt)
            .Take(50)
            .Select(notification => new NotificationResponse(notification.Id, notification.Title, notification.Message, notification.Link, notification.CreatedAt, notification.ReadAt != null))
            .ToListAsync(cancellationToken);
    }

    public async Task MarkReadAsync(Guid? id, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var query = database.Notifications.Where(notification => notification.ReadAt == null);
        if (id is { } single)
            query = query.Where(notification => notification.Id == single);
        await query.ExecuteUpdateAsync(setters => setters.SetProperty(notification => notification.ReadAt, now), cancellationToken);
    }

    /// <summary>Creates due-date and reminder notifications for the current user. Safe to call repeatedly.</summary>
    public async Task<int> GenerateAsync(CancellationToken cancellationToken)
    {
        var setting = await settings.GetAsync(cancellationToken);
        if (!setting.NotificationsEnabled)
            return 0;

        var today = DateHelper.TodayIn(setting.TimeZone);
        var candidates = new List<Notification>();

        var bills = await database.Bills.AsNoTracking().Where(bill => !bill.IsIgnored && bill.DueDate <= today.AddDays(setting.BillReminderDays)).ToListAsync(cancellationToken);
        foreach (var bill in bills.Where(bill => bill.Unpaid > 0))
        {
            if (bill.DueDate < today)
                candidates.Add(Build($"bill-overdue:{bill.Id}:{bill.DueDate:yyyyMMdd}", "Bill overdue",
                    $"{bill.Provider} bill was due on {bill.DueDate:dd MMM}.", $"/bills?status=Overdue"));
            else
                candidates.Add(Build($"bill-due:{bill.Id}:{bill.DueDate:yyyyMMdd}", "Bill due soon",
                    bill.DueDate == today ? $"{bill.Provider} bill is due today." : $"{bill.Provider} bill is due on {bill.DueDate:dd MMM}.", "/bills"));
        }

        var credits = await database.ReceivablePayables.AsNoTracking().Include(record => record.Person)
            .Where(record => (record.ReminderDate != null && record.ReminderDate <= today) || (record.ExpectedDate != null && record.ExpectedDate < today))
            .ToListAsync(cancellationToken);
        foreach (var record in credits.Where(record => record.Remaining > 0))
        {
            var name = record.Person?.Name ?? "Someone";
            var text = record.Direction == Direction.Receive ? $"{name} still owes you money." : $"You still need to pay {name}.";
            if (record.ReminderDate is { } reminder && reminder <= today)
                candidates.Add(Build($"credit-reminder:{record.Id}:{reminder:yyyyMMdd}", "Payment reminder", text, $"/credits?person={record.PersonId}"));
            if (record.ExpectedDate is { } expected && expected < today)
                candidates.Add(Build($"credit-overdue:{record.Id}:{expected:yyyyMMdd}", "Payment overdue", $"{text} It was expected on {expected:dd MMM}.", $"/credits?status=Overdue"));
        }

        if (candidates.Count == 0)
            return 0;

        var keys = candidates.Select(candidate => candidate.DedupKey).ToList();
        var existing = await database.Notifications.AsNoTracking().Where(notification => keys.Contains(notification.DedupKey))
            .Select(notification => notification.DedupKey).ToListAsync(cancellationToken);
        var fresh = candidates.Where(candidate => !existing.Contains(candidate.DedupKey)).DistinctBy(candidate => candidate.DedupKey).ToList();
        database.Notifications.AddRange(fresh);
        await database.SaveChangesAsync(cancellationToken);
        return fresh.Count;
    }

    private static Notification Build(string key, string title, string message, string link) =>
        new() { DedupKey = key, Title = title, Message = message, Link = link };
}
