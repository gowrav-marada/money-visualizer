using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Settings;

namespace MoneyVisualizer.Api.Modules.Expenses;

/// <summary>Personal income and expenses only. Person-to-person money lives in the credits module.</summary>
public sealed class ExpenseService(MoneyDbContext database, SettingsService settings)
{
    public async Task<IReadOnlyList<TransactionResponse>> ListAsync(TransactionQuery query, CancellationToken cancellationToken)
    {
        var transactions = await LoadAsync(query, cancellationToken);
        return await ProjectAsync(transactions, cancellationToken);
    }

    public async Task<TransactionResponse> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var transaction = await database.PersonalTransactions.AsNoTracking()
            .Include(candidate => candidate.Category).Include(candidate => candidate.Account)
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken) ?? throw new NotFoundException("Transaction");
        return (await ProjectAsync([transaction], cancellationToken))[0];
    }

    public async Task<ExpenseSummary> SummaryAsync(TransactionQuery query, CancellationToken cancellationToken)
    {
        var all = await database.PersonalTransactions.AsNoTracking().Include(transaction => transaction.Category).ToListAsync(cancellationToken);
        var filtered = Filter(all, query).ToList();
        var setting = await settings.GetAsync(cancellationToken);
        var today = DateHelper.TodayIn(setting.TimeZone);
        var monthStart = DateHelper.StartOfMonth(today);
        var previousStart = monthStart.AddMonths(-1);

        var (income, expenses) = FinanceCalculator.Totals(all);
        var (filteredIncome, filteredExpenses) = FinanceCalculator.Totals(filtered);
        var thisMonth = all.Where(transaction => transaction.Date >= monthStart && transaction.Date <= today).ToList();
        var thisMonthExpenses = FinanceCalculator.Totals(thisMonth).Expenses;
        var previousMonthExpenses = FinanceCalculator.Totals(all.Where(transaction => transaction.Date >= previousStart && transaction.Date < monthStart)).Expenses;
        var highest = thisMonth
            .Where(transaction => transaction.Type == TransactionType.Expense && !transaction.ExcludeFromTotals)
            .GroupBy(transaction => transaction.Category?.Name ?? "Other")
            .Select(group => new CategoryAmount(group.Key, group.Sum(transaction => transaction.Amount)))
            .OrderByDescending(category => category.Amount)
            .FirstOrDefault();

        return new ExpenseSummary(
            income, expenses, income - expenses,
            thisMonthExpenses, previousMonthExpenses,
            decimal.Round(thisMonthExpenses / today.Day, 2),
            highest, setting.MonthlyBudget, filteredIncome, filteredExpenses);
    }

    public async Task<IReadOnlyList<PeriodBucket>> PeriodsAsync(string granularity, int count, CancellationToken cancellationToken)
    {
        count = Math.Clamp(count, 1, 36);
        var today = await settings.TodayAsync(cancellationToken);
        var starts = new List<DateOnly>();
        Func<DateOnly, DateOnly> next;
        Func<DateOnly, string> label;
        switch (granularity.ToLowerInvariant())
        {
            case "day":
                for (var i = count - 1; i >= 0; i--) starts.Add(today.AddDays(-i));
                next = date => date.AddDays(1);
                label = date => date.ToString("dd MMM");
                break;
            case "week":
                var week = DateHelper.StartOfWeek(today);
                for (var i = count - 1; i >= 0; i--) starts.Add(week.AddDays(-7 * i));
                next = date => date.AddDays(7);
                label = date => date.ToString("dd MMM");
                break;
            case "year":
                for (var i = count - 1; i >= 0; i--) starts.Add(new DateOnly(today.Year - i, 1, 1));
                next = date => date.AddYears(1);
                label = date => date.Year.ToString();
                break;
            default:
                var month = DateHelper.StartOfMonth(today);
                for (var i = count - 1; i >= 0; i--) starts.Add(month.AddMonths(-i));
                next = date => date.AddMonths(1);
                label = date => date.ToString("MMM yy");
                break;
        }

        var from = starts[0];
        var transactions = await database.PersonalTransactions.AsNoTracking()
            .Where(transaction => transaction.Date >= from && !transaction.ExcludeFromTotals)
            .ToListAsync(cancellationToken);
        return starts.Select(start =>
        {
            var end = next(start);
            var (income, expenses) = FinanceCalculator.Totals(transactions.Where(transaction => transaction.Date >= start && transaction.Date < end));
            return new PeriodBucket(label(start), start, income, expenses);
        }).ToList();
    }

    public async Task<TransactionResponse> CreateAsync(TransactionRequest request, CancellationToken cancellationToken)
    {
        var category = await ValidateAsync(request, cancellationToken);
        var transaction = new PersonalTransaction();
        Apply(transaction, request, category);

        if (request.IsRecurring)
        {
            var frequency = request.Frequency ?? RecurrenceFrequency.Monthly;
            var recurring = new RecurringTransaction
            {
                Type = transaction.Type,
                Amount = transaction.Amount,
                CategoryId = transaction.CategoryId,
                Description = transaction.Description,
                Merchant = transaction.Merchant,
                PaymentMethod = transaction.PaymentMethod,
                AccountId = transaction.AccountId,
                Frequency = frequency,
                NextDate = FinanceCalculator.Advance(transaction.Date, frequency)
            };
            database.RecurringTransactions.Add(recurring);
            transaction.RecurringTransactionId = recurring.Id;
        }

        database.PersonalTransactions.Add(transaction);
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(transaction.Id, cancellationToken);
    }

    public async Task<TransactionResponse> UpdateAsync(Guid id, TransactionRequest request, CancellationToken cancellationToken)
    {
        var transaction = await database.PersonalTransactions.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken)
                          ?? throw new NotFoundException("Transaction");
        var category = await ValidateAsync(request, cancellationToken);
        if (transaction.BillPaymentId is not null && transaction.Amount != request.Amount)
            throw new BusinessRuleException("This expense was created from a bill payment. Change the amount from the Bills tab.");

        Apply(transaction, request, category);
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var transaction = await database.PersonalTransactions.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken)
                          ?? throw new NotFoundException("Transaction");
        if (transaction.BillPaymentId is { } paymentId)
        {
            // Keep the bill consistent: the payment stays, it just no longer has an expense linked.
            var payment = await database.BillPayments.FirstOrDefaultAsync(candidate => candidate.Id == paymentId, cancellationToken);
            if (payment is not null)
                payment.PersonalTransactionId = null;
        }

        database.PersonalTransactions.Remove(transaction);
        await database.SaveChangesAsync(cancellationToken);
    }

    public async Task<byte[]> ExportCsvAsync(TransactionQuery query, CancellationToken cancellationToken)
    {
        var rows = await ListAsync(query, cancellationToken);
        return Csv.Build(
            ["Date", "Type", "Amount", "Category", "Description", "Merchant", "Payment method", "Account", "Recurring", "Counted in totals", "Notes"],
            rows.Select(row => new object?[]
            {
                row.Date, row.Type, row.Amount, row.CategoryName, row.Description, row.Merchant, row.PaymentMethod,
                row.AccountName, row.IsRecurring ? "Yes" : "No", row.ExcludeFromTotals ? "No (transfer)" : "Yes", row.Notes
            }));
    }

    public async Task<IReadOnlyList<RecurringResponse>> RecurringAsync(CancellationToken cancellationToken)
    {
        var categories = await database.Categories.AsNoTracking().ToDictionaryAsync(category => category.Id, category => category.Name, cancellationToken);
        var items = await database.RecurringTransactions.AsNoTracking().OrderBy(item => item.NextDate).ToListAsync(cancellationToken);
        return items.Select(item => new RecurringResponse(item.Id, item.Type, item.Amount,
            categories.GetValueOrDefault(item.CategoryId, "Other"), item.Description, item.Frequency, item.NextDate, item.IsActive)).ToList();
    }

    public async Task StopRecurringAsync(Guid id, CancellationToken cancellationToken)
    {
        var item = await database.RecurringTransactions.FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken)
                   ?? throw new NotFoundException("Recurring transaction");
        item.IsActive = false;
        await database.SaveChangesAsync(cancellationToken);
    }

    private async Task<List<PersonalTransaction>> LoadAsync(TransactionQuery query, CancellationToken cancellationToken)
    {
        var source = database.PersonalTransactions.AsNoTracking()
            .Include(transaction => transaction.Category)
            .Include(transaction => transaction.Account)
            .AsQueryable();
        if (query.From is { } from)
            source = source.Where(transaction => transaction.Date >= from);
        if (query.To is { } to)
            source = source.Where(transaction => transaction.Date <= to);

        // Amount filters and sorting happen in memory because SQLite cannot compare decimals natively.
        var list = await source.ToListAsync(cancellationToken);
        return Filter(list, query).OrderByDescending(transaction => transaction.Date).ThenByDescending(transaction => transaction.CreatedAt).ToList();
    }

    private static IEnumerable<PersonalTransaction> Filter(IEnumerable<PersonalTransaction> source, TransactionQuery query)
    {
        if (query.Type is { } type) source = source.Where(transaction => transaction.Type == type);
        if (query.CategoryId is { } categoryId) source = source.Where(transaction => transaction.CategoryId == categoryId);
        if (query.AccountId is { } accountId) source = source.Where(transaction => transaction.AccountId == accountId);
        if (!string.IsNullOrWhiteSpace(query.PaymentMethod))
            source = source.Where(transaction => string.Equals(transaction.PaymentMethod, query.PaymentMethod, StringComparison.OrdinalIgnoreCase));
        if (query.From is { } from) source = source.Where(transaction => transaction.Date >= from);
        if (query.To is { } to) source = source.Where(transaction => transaction.Date <= to);
        if (query.MinAmount is { } min) source = source.Where(transaction => transaction.Amount >= min);
        if (query.MaxAmount is { } max) source = source.Where(transaction => transaction.Amount <= max);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            source = source.Where(transaction =>
                transaction.Description.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                (transaction.Merchant?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (transaction.Notes?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false));
        }

        return source;
    }

    private async Task<IReadOnlyList<TransactionResponse>> ProjectAsync(IReadOnlyList<PersonalTransaction> transactions, CancellationToken cancellationToken)
    {
        var ids = transactions.Select(transaction => transaction.Id).ToList();
        var attachmentCounts = await database.Attachments.AsNoTracking()
            .Where(attachment => attachment.OwnerType == "transaction" && ids.Contains(attachment.OwnerId))
            .GroupBy(attachment => attachment.OwnerId)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Key, item => item.Count, cancellationToken);

        return transactions.Select(transaction => new TransactionResponse(
            transaction.Id, transaction.Type, transaction.Amount, transaction.Date, transaction.CategoryId,
            transaction.Category?.Name ?? "Other", transaction.Description, transaction.PaymentMethod,
            transaction.AccountId, transaction.Account?.Name, transaction.Merchant, transaction.Notes,
            transaction.IsRecurring || transaction.RecurringTransactionId is not null, transaction.ExcludeFromTotals,
            transaction.BillPaymentId is not null, attachmentCounts.GetValueOrDefault(transaction.Id))).ToList();
    }

    private async Task<Category> ValidateAsync(TransactionRequest request, CancellationToken cancellationToken)
    {
        var category = await database.Categories.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.Id == request.CategoryId, cancellationToken)
                       ?? throw new BusinessRuleException("Choose a valid category.");
        var expectedKind = request.Type == TransactionType.Income ? CategoryKind.Income : CategoryKind.Expense;
        if (category.Kind != expectedKind)
            throw new BusinessRuleException($"\"{category.Name}\" is not an {request.Type?.ToString().ToLowerInvariant()} category.");
        if (request.AccountId is { } accountId && !await database.Accounts.AnyAsync(account => account.Id == accountId, cancellationToken))
            throw new BusinessRuleException("Choose a valid account.");
        return category;
    }

    private static void Apply(PersonalTransaction transaction, TransactionRequest request, Category category)
    {
        transaction.Type = request.Type!.Value;
        transaction.Amount = decimal.Round(request.Amount, 2);
        transaction.Date = request.Date!.Value;
        transaction.CategoryId = category.Id;
        transaction.Description = request.Description.Trim();
        transaction.PaymentMethod = Clean(request.PaymentMethod);
        transaction.AccountId = request.AccountId;
        transaction.Merchant = Clean(request.Merchant);
        transaction.Notes = Clean(request.Notes);
        transaction.IsRecurring = request.IsRecurring;
        // Credit-card payments settle card spends that were already recorded, so they are transfers, not new expenses.
        transaction.ExcludeFromTotals = category.ExcludeFromTotals;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
