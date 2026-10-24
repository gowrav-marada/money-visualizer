using System.Globalization;
using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Settings;

namespace MoneyVisualizer.Api.Modules.Credits;

/// <summary>Money exchanged with other people. Never mixed into personal income/expense totals.</summary>
public sealed class CreditService(MoneyDbContext database, SettingsService settings)
{
    public async Task<IReadOnlyList<CreditResponse>> ListAsync(CreditQuery query, CancellationToken cancellationToken)
    {
        var today = await settings.TodayAsync(cancellationToken);
        var records = await LoadAllAsync(cancellationToken);
        IEnumerable<ReceivablePayable> source = records;
        if (query.PersonId is { } personId) source = source.Where(record => record.PersonId == personId);
        if (query.Direction is { } direction) source = source.Where(record => record.Direction == direction);
        if (query.Status is { } status) source = source.Where(record => FinanceCalculator.StatusOf(record, today) == status);
        if (query.From is { } from) source = source.Where(record => record.TransactionDate >= from);
        if (query.To is { } to) source = source.Where(record => record.TransactionDate <= to);
        if (query.MinAmount is { } min) source = source.Where(record => record.Amount >= min);
        if (query.MaxAmount is { } max) source = source.Where(record => record.Amount <= max);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            source = source.Where(record =>
                (record.Person?.Name.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false) ||
                record.Description.Contains(term, StringComparison.OrdinalIgnoreCase));
        }

        var list = source
            .OrderBy(record => FinanceCalculator.StatusOf(record, today) == ReceivableStatus.Paid)
            .ThenBy(record => record.ExpectedDate ?? DateOnly.MaxValue)
            .ThenByDescending(record => record.TransactionDate)
            .ToList();
        return await ProjectAsync(list, today, cancellationToken);
    }

    public async Task<CreditResponse> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var record = await database.ReceivablePayables.AsNoTracking().Include(candidate => candidate.Person).Include(candidate => candidate.Settlements)
                         .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken) ?? throw new NotFoundException("Record");
        return (await ProjectAsync([record], await settings.TodayAsync(cancellationToken), cancellationToken))[0];
    }

    public async Task<CreditSummary> SummaryAsync(CancellationToken cancellationToken)
    {
        var today = await settings.TodayAsync(cancellationToken);
        var records = await LoadAllAsync(cancellationToken);
        return Summarize(records, today);
    }

    public static CreditSummary Summarize(IReadOnlyCollection<ReceivablePayable> records, DateOnly today)
    {
        var toReceive = records.Where(record => record.Direction == Direction.Receive).Sum(record => record.Remaining);
        var toPay = records.Where(record => record.Direction == Direction.Pay).Sum(record => record.Remaining);
        var overdue = records.Where(record => FinanceCalculator.StatusOf(record, today) == ReceivableStatus.Overdue).Sum(record => record.Remaining);
        var pending = records.Where(record => FinanceCalculator.StatusOf(record, today) is ReceivableStatus.Pending or ReceivableStatus.PartiallyPaid).Sum(record => record.Remaining);
        return new CreditSummary(
            toReceive, toPay, toReceive - toPay,
            records.Sum(record => record.SettledAmount), pending, overdue,
            records.Where(record => record.Direction == Direction.Receive && record.Remaining > 0).Select(record => record.PersonId).Distinct().Count(),
            records.Where(record => record.Direction == Direction.Pay && record.Remaining > 0).Select(record => record.PersonId).Distinct().Count());
    }

    public async Task<IReadOnlyList<PersonBalance>> PeopleAsync(CancellationToken cancellationToken)
    {
        var today = await settings.TodayAsync(cancellationToken);
        var records = await LoadAllAsync(cancellationToken);
        return records
            .GroupBy(record => record.PersonId)
            .Select(group =>
            {
                var toReceive = group.Where(record => record.Direction == Direction.Receive).Sum(record => record.Remaining);
                var toPay = group.Where(record => record.Direction == Direction.Pay).Sum(record => record.Remaining);
                var open = group.Where(record => record.Remaining > 0).ToList();
                return new PersonBalance(
                    group.Key,
                    group.First().Person?.Name ?? "Unknown",
                    toReceive,
                    toPay,
                    group.Sum(record => record.SettledAmount),
                    toReceive - toPay,
                    open.Where(record => record.ExpectedDate is not null).Select(record => record.ExpectedDate).Min(),
                    group.Max(LatestActivity),
                    open.Count,
                    open.Any(record => FinanceCalculator.StatusOf(record, today) == ReceivableStatus.Overdue));
            })
            .OrderByDescending(person => person.OpenRecords > 0)
            .ThenByDescending(person => Math.Abs(person.NetBalance))
            .ToList();
    }

    public async Task<IReadOnlyList<string>> PersonNamesAsync(CancellationToken cancellationToken) =>
        await database.People.AsNoTracking().OrderBy(person => person.Name).Select(person => person.Name).ToListAsync(cancellationToken);

    public async Task<CreditResponse> CreateAsync(CreditRequest request, CancellationToken cancellationToken)
    {
        Validate(request);
        var record = new ReceivablePayable();
        await ApplyAsync(record, request, cancellationToken);
        if (request.SettledAmount > 0)
        {
            record.Settlements.Add(new Settlement
            {
                Amount = decimal.Round(request.SettledAmount, 2),
                Date = request.TransactionDate!.Value,
                PaymentMethod = record.PaymentMethod,
                Notes = "Already settled when the record was created"
            });
            record.SettledAmount = decimal.Round(request.SettledAmount, 2);
        }

        database.ReceivablePayables.Add(record);
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(record.Id, cancellationToken);
    }

    public async Task<CreditResponse> UpdateAsync(Guid id, CreditRequest request, CancellationToken cancellationToken)
    {
        Validate(request);
        var record = await FindAsync(id, cancellationToken);
        if (decimal.Round(request.Amount, 2) < record.SettledAmount)
            throw new BusinessRuleException($"The amount cannot be lower than the {record.SettledAmount:0.00} already settled.");

        await ApplyAsync(record, request, cancellationToken);
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var record = await FindAsync(id, cancellationToken);
        database.ReceivablePayables.Remove(record);
        await database.SaveChangesAsync(cancellationToken);
    }

    public async Task<CreditResponse> SettleAsync(Guid id, SettlementRequest request, CancellationToken cancellationToken)
    {
        var record = await FindAsync(id, cancellationToken);
        var amount = decimal.Round(request.Amount, 2);
        if (record.Remaining <= 0)
            throw new BusinessRuleException("This record is already fully settled.");
        if (amount > record.Remaining)
            throw new BusinessRuleException($"The payment is more than the remaining {record.Remaining.ToString("0.00", CultureInfo.InvariantCulture)}.");

        record.Settlements.Add(new Settlement { Amount = amount, Date = request.Date!.Value, PaymentMethod = request.PaymentMethod, Notes = request.Notes });
        record.SettledAmount += amount;
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<CreditResponse> MarkPaidAsync(Guid id, MarkPaidRequest request, CancellationToken cancellationToken)
    {
        var record = await FindAsync(id, cancellationToken);
        if (record.Remaining <= 0)
            throw new BusinessRuleException("This record is already fully settled.");

        var date = request.Date ?? await settings.TodayAsync(cancellationToken);
        return await SettleAsync(id, new SettlementRequest(record.Remaining, date, request.PaymentMethod ?? record.PaymentMethod, "Marked as fully paid"), cancellationToken);
    }

    public async Task<CreditResponse> DeleteSettlementAsync(Guid id, Guid settlementId, CancellationToken cancellationToken)
    {
        var record = await FindAsync(id, cancellationToken);
        var settlement = record.Settlements.FirstOrDefault(candidate => candidate.Id == settlementId) ?? throw new NotFoundException("Settlement");
        record.Settlements.Remove(settlement);
        database.Settlements.Remove(settlement);
        record.SettledAmount = record.Settlements.Sum(candidate => candidate.Amount);
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<CreditResponse> SetReminderAsync(Guid id, ReminderRequest request, CancellationToken cancellationToken)
    {
        var record = await FindAsync(id, cancellationToken);
        record.ReminderDate = request.ReminderDate;
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<IReadOnlyList<HistoryEntry>> HistoryAsync(Guid id, CancellationToken cancellationToken)
    {
        var record = await database.ReceivablePayables.AsNoTracking().Include(candidate => candidate.Settlements)
                         .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken) ?? throw new NotFoundException("Record");
        var audits = await database.AuditLogs.AsNoTracking()
            .Where(log => log.UserId == record.UserId && log.EntityId == id)
            .OrderBy(log => log.Id)
            .ToListAsync(cancellationToken);

        var entries = new List<HistoryEntry>
        {
            new(record.CreatedAt, "created", $"{(record.Direction == Direction.Receive ? "Money to receive" : "Money to pay")} recorded", record.Amount)
        };
        entries.AddRange(record.Settlements.Select(settlement => new HistoryEntry(
            settlement.CreatedAt, "settlement", DescribeSettlement(settlement), settlement.Amount, settlement.Id)));
        entries.AddRange(audits.Where(log => log.Action == AuditAction.Updated && !log.Changes.Contains("SettledAmount"))
            .Select(log => new HistoryEntry(log.At, "edited", "Details edited", null)));
        return entries.OrderByDescending(entry => entry.At).ToList();
    }

    private async Task<List<ReceivablePayable>> LoadAllAsync(CancellationToken cancellationToken) =>
        await database.ReceivablePayables.AsNoTracking()
            .Include(record => record.Person)
            .Include(record => record.Settlements)
            .ToListAsync(cancellationToken);

    private async Task<ReceivablePayable> FindAsync(Guid id, CancellationToken cancellationToken) =>
        await database.ReceivablePayables.Include(record => record.Settlements)
            .FirstOrDefaultAsync(record => record.Id == id, cancellationToken) ?? throw new NotFoundException("Record");

    private async Task<IReadOnlyList<CreditResponse>> ProjectAsync(IReadOnlyList<ReceivablePayable> records, DateOnly today, CancellationToken cancellationToken)
    {
        var ids = records.Select(record => record.Id).ToList();
        var attachmentCounts = await database.Attachments.AsNoTracking()
            .Where(attachment => attachment.OwnerType == "credit" && ids.Contains(attachment.OwnerId))
            .GroupBy(attachment => attachment.OwnerId)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Key, item => item.Count, cancellationToken);

        return records.Select(record => new CreditResponse(
            record.Id, record.PersonId, record.Person?.Name ?? "Unknown", record.Direction, record.Amount,
            record.SettledAmount, record.Remaining, FinanceCalculator.StatusOf(record, today),
            record.TransactionDate, record.ExpectedDate, record.Description, record.PaymentMethod, record.Category,
            record.Notes, record.ReminderDate, LatestActivity(record), attachmentCounts.GetValueOrDefault(record.Id))).ToList();
    }

    private static string DescribeSettlement(Settlement settlement)
    {
        var text = $"Payment on {settlement.Date:dd MMM yyyy}";
        if (!string.IsNullOrWhiteSpace(settlement.PaymentMethod))
            text += $" via {settlement.PaymentMethod}";
        if (!string.IsNullOrWhiteSpace(settlement.Notes))
            text += $" – {settlement.Notes}";
        return text;
    }

    private static DateTime LatestActivity(ReceivablePayable record) =>
        record.Settlements.Select(settlement => settlement.CreatedAt).Append(record.UpdatedAt).Max();

    private static void Validate(CreditRequest request)
    {
        if (request.SettledAmount > request.Amount)
            throw new BusinessRuleException("The settled amount cannot be more than the total amount.");
        if (request.ExpectedDate is { } expected && expected < request.TransactionDate)
            throw new BusinessRuleException("The expected payment date cannot be before the transaction date.");
    }

    private async Task ApplyAsync(ReceivablePayable record, CreditRequest request, CancellationToken cancellationToken)
    {
        var name = request.PersonName.Trim();
        var person = await database.People.FirstOrDefaultAsync(candidate => candidate.Name.ToLower() == name.ToLower(), cancellationToken);
        if (person is null)
        {
            person = new Person { Name = name };
            database.People.Add(person);
        }

        record.PersonId = person.Id;
        record.Direction = request.Direction!.Value;
        record.Amount = decimal.Round(request.Amount, 2);
        record.TransactionDate = request.TransactionDate!.Value;
        record.ExpectedDate = request.ExpectedDate;
        record.Description = request.Description?.Trim() ?? string.Empty;
        record.PaymentMethod = Clean(request.PaymentMethod);
        record.Category = Clean(request.Category);
        record.Notes = Clean(request.Notes);
        record.ReminderDate = request.ReminderDate;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
