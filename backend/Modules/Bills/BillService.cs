using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Settings;

namespace MoneyVisualizer.Api.Modules.Bills;

/// <summary>Bill obligations. A bill only reaches the expense totals when a payment is explicitly recorded as an expense.</summary>
public sealed class BillService(MoneyDbContext database, SettingsService settings)
{
    public async Task<IReadOnlyList<BillResponse>> ListAsync(BillQuery query, CancellationToken cancellationToken)
    {
        var (today, dueSoon) = await ContextAsync(cancellationToken);
        IEnumerable<Bill> source = await LoadAllAsync(cancellationToken);
        if (query.Status is { } status) source = source.Where(bill => FinanceCalculator.StatusOf(bill, today, dueSoon) == status);
        if (query.BillType is { } type) source = source.Where(bill => bill.BillType == type);
        if (!string.IsNullOrWhiteSpace(query.Provider)) source = source.Where(bill => bill.Provider.Equals(query.Provider.Trim(), StringComparison.OrdinalIgnoreCase));
        if (query.From is { } from) source = source.Where(bill => bill.DueDate >= from);
        if (query.To is { } to) source = source.Where(bill => bill.DueDate <= to);
        if (query.Recurring is { } recurring) source = source.Where(bill => bill.IsRecurring == recurring);
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            source = source.Where(bill => bill.Provider.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                                          (bill.Notes?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false));
        }

        var ordered = source
            .OrderBy(bill => StatusRank(FinanceCalculator.StatusOf(bill, today, dueSoon)))
            .ThenBy(bill => bill.DueDate)
            .ToList();
        return await ProjectAsync(ordered, today, dueSoon, cancellationToken);
    }

    public async Task<BillResponse> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var (today, dueSoon) = await ContextAsync(cancellationToken);
        var bill = await database.Bills.AsNoTracking().Include(candidate => candidate.Payments)
                       .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken) ?? throw new NotFoundException("Bill");
        return (await ProjectAsync([bill], today, dueSoon, cancellationToken))[0];
    }

    public async Task<BillSummary> SummaryAsync(CancellationToken cancellationToken)
    {
        var (today, dueSoon) = await ContextAsync(cancellationToken);
        return Summarize(await LoadAllAsync(cancellationToken), today, dueSoon);
    }

    public static BillSummary Summarize(IReadOnlyCollection<Bill> bills, DateOnly today, int dueSoon)
    {
        var open = bills.Where(bill => bill.Unpaid > 0).ToList();
        var weekEnd = today.AddDays(7);
        var monthStart = DateHelper.StartOfMonth(today);
        var monthEnd = monthStart.AddMonths(1).AddDays(-1);
        AmountCount Of(IEnumerable<Bill> items, Func<Bill, decimal> amount)
        {
            var list = items.ToList();
            return new AmountCount(list.Count, list.Sum(amount));
        }

        return new BillSummary(
            Of(open, bill => bill.Unpaid),
            Of(open.Where(bill => bill.DueDate >= today && bill.DueDate <= weekEnd), bill => bill.Unpaid),
            Of(open.Where(bill => bill.DueDate >= today && bill.DueDate <= monthEnd), bill => bill.Unpaid),
            Of(open.Where(bill => FinanceCalculator.StatusOf(bill, today, dueSoon) == BillStatus.Overdue), bill => bill.Unpaid),
            Of(bills.Where(bill => !bill.IsIgnored && bill.PaymentDate is { } paid && paid >= monthStart && paid <= monthEnd), bill => bill.PaidAmount),
            bills.Where(bill => bill.IsRecurring).Select(bill => bill.Provider.ToLowerInvariant()).Distinct().Count());
    }

    public async Task<IReadOnlyList<ProviderGroup>> ProvidersAsync(CancellationToken cancellationToken)
    {
        var bills = await LoadAllAsync(cancellationToken);
        return bills.GroupBy(bill => bill.Provider.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new ProviderGroup(
                group.First().Provider,
                group.Count(),
                group.Sum(bill => bill.Unpaid),
                group.Where(bill => bill.Unpaid > 0).Select(bill => (DateOnly?)bill.DueDate).Min(),
                group.OrderByDescending(bill => bill.DueDate).First().BillType))
            .OrderByDescending(group => group.Unpaid)
            .ThenBy(group => group.Provider)
            .ToList();
    }

    /// <summary>Finds an existing bill with the same provider, account, period, amount and due date.</summary>
    public async Task<Bill?> FindDuplicateAsync(string provider, string? account, DateOnly? periodStart, DateOnly? periodEnd, decimal amount, DateOnly dueDate, Guid? excludeId, CancellationToken cancellationToken)
    {
        var key = FinanceCalculator.BillDedupKey(provider, account, periodStart, periodEnd, amount, dueDate);
        var candidates = await database.Bills.AsNoTracking()
            .Where(bill => bill.DueDate == dueDate && bill.Id != excludeId)
            .ToListAsync(cancellationToken);
        return candidates.FirstOrDefault(bill =>
            FinanceCalculator.BillDedupKey(bill.Provider, bill.AccountIdentifier, bill.PeriodStart, bill.PeriodEnd, bill.Amount, bill.DueDate) == key);
    }

    public async Task<BillResponse> CreateAsync(BillRequest request, CancellationToken cancellationToken, Guid? emailImportId = null)
    {
        Validate(request);
        if (!request.AllowDuplicate && await FindDuplicateAsync(request.Provider, request.AccountIdentifier, request.PeriodStart, request.PeriodEnd, request.Amount, request.DueDate!.Value, null, cancellationToken) is { } duplicate)
            throw new ConflictException($"A matching {duplicate.Provider} bill due on {duplicate.DueDate:dd MMM yyyy} already exists.");

        var bill = new Bill { EmailImportId = emailImportId };
        Apply(bill, request);
        database.Bills.Add(bill);
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(bill.Id, cancellationToken);
    }

    public async Task<BillResponse> UpdateAsync(Guid id, BillRequest request, CancellationToken cancellationToken)
    {
        Validate(request);
        var bill = await FindAsync(id, cancellationToken);
        if (decimal.Round(request.Amount, 2) < bill.PaidAmount)
            throw new BusinessRuleException("The bill amount cannot be lower than what has already been paid.");
        if (!request.AllowDuplicate && await FindDuplicateAsync(request.Provider, request.AccountIdentifier, request.PeriodStart, request.PeriodEnd, request.Amount, request.DueDate!.Value, id, cancellationToken) is not null)
            throw new ConflictException("Another bill with the same details already exists.");

        Apply(bill, request);
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var bill = await FindAsync(id, cancellationToken);
        var linked = bill.Payments.Where(payment => payment.PersonalTransactionId is not null).Select(payment => payment.PersonalTransactionId).ToList();
        // Expenses created from the bill's payments remain (money was really spent) but are unlinked.
        await foreach (var transaction in database.PersonalTransactions.Where(transaction => linked.Contains(transaction.Id)).AsAsyncEnumerable().WithCancellation(cancellationToken))
            transaction.BillPaymentId = null;

        database.Bills.Remove(bill);
        await database.SaveChangesAsync(cancellationToken);
    }

    public async Task<BillResponse> PayAsync(Guid id, BillPaymentRequest request, CancellationToken cancellationToken)
    {
        var bill = await FindAsync(id, cancellationToken);
        if (bill.IsIgnored)
            throw new BusinessRuleException("This bill is ignored. Restore it before recording a payment.");
        var amount = decimal.Round(request.Amount, 2);
        if (bill.Unpaid <= 0)
            throw new BusinessRuleException("This bill is already fully paid.");
        if (amount > bill.Unpaid)
            throw new BusinessRuleException($"The payment is more than the unpaid {bill.Unpaid:0.00}.");

        var payment = new BillPayment { BillId = bill.Id, Amount = amount, Date = request.Date!.Value, PaymentMethod = request.PaymentMethod };
        if (request.RecordAsExpense)
        {
            var category = await ResolveCategoryAsync(bill.BillType, request.CategoryId, cancellationToken);
            var transaction = new PersonalTransaction
            {
                Type = TransactionType.Expense,
                Amount = amount,
                Date = payment.Date,
                CategoryId = category.Id,
                Description = $"{bill.Provider} bill payment",
                Merchant = bill.Provider,
                PaymentMethod = request.PaymentMethod,
                AccountId = request.AccountId,
                ExcludeFromTotals = category.ExcludeFromTotals,
                BillPaymentId = payment.Id
            };
            database.PersonalTransactions.Add(transaction);
            payment.PersonalTransactionId = transaction.Id;
        }

        database.BillPayments.Add(payment);
        bill.PaidAmount += amount;
        bill.PaymentDate = payment.Date;
        bill.PaymentMethod = request.PaymentMethod ?? bill.PaymentMethod;
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<BillResponse> DeletePaymentAsync(Guid id, Guid paymentId, CancellationToken cancellationToken)
    {
        var bill = await FindAsync(id, cancellationToken);
        var payment = bill.Payments.FirstOrDefault(candidate => candidate.Id == paymentId) ?? throw new NotFoundException("Payment");
        if (payment.PersonalTransactionId is { } transactionId &&
            await database.PersonalTransactions.FirstOrDefaultAsync(transaction => transaction.Id == transactionId, cancellationToken) is { } transaction)
            database.PersonalTransactions.Remove(transaction);

        bill.Payments.Remove(payment);
        database.BillPayments.Remove(payment);
        bill.PaidAmount = bill.Payments.Sum(candidate => candidate.Amount);
        bill.PaymentDate = bill.Payments.Select(candidate => (DateOnly?)candidate.Date).Max();
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<BillResponse> SetIgnoredAsync(Guid id, bool ignored, CancellationToken cancellationToken)
    {
        var bill = await FindAsync(id, cancellationToken);
        bill.IsIgnored = ignored;
        await database.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    /// <summary>Creates the next cycle of a recurring bill using the last amount as an estimate.</summary>
    public async Task<BillResponse> CreateNextAsync(Guid id, CancellationToken cancellationToken)
    {
        var bill = await FindAsync(id, cancellationToken);
        var request = new BillRequest(
            bill.Provider, bill.BillType, bill.AccountIdentifier, bill.Amount, bill.MinimumDue,
            bill.DueDate.AddMonths(1), bill.PeriodStart?.AddMonths(1), bill.PeriodEnd?.AddMonths(1),
            true, bill.PaymentMethod, null, "Estimated from the previous bill – update when the actual bill arrives.");
        return await CreateAsync(request, cancellationToken);
    }

    private async Task<Category> ResolveCategoryAsync(BillType type, Guid? categoryId, CancellationToken cancellationToken)
    {
        if (categoryId is { } explicitId)
            return await database.Categories.AsNoTracking().FirstOrDefaultAsync(category => category.Id == explicitId && category.Kind == CategoryKind.Expense, cancellationToken)
                   ?? throw new BusinessRuleException("Choose a valid expense category.");

        var name = DefaultCategoryFor(type);
        return await database.Categories.AsNoTracking().FirstOrDefaultAsync(category => category.Kind == CategoryKind.Expense && category.Name == name, cancellationToken)
               ?? await database.Categories.AsNoTracking().FirstAsync(category => category.Kind == CategoryKind.Expense, cancellationToken);
    }

    public static string DefaultCategoryFor(BillType type) => type switch
    {
        BillType.CreditCard => UserProvisioner.CreditCardPaymentCategory,
        BillType.Telephone => "Telephone",
        BillType.Internet => "Internet",
        BillType.Electricity => "Electricity",
        BillType.Rent => "Rent",
        BillType.Emi => "EMI or loan",
        BillType.Subscription => "Subscription",
        _ => "Other"
    };

    private async Task<(DateOnly Today, int DueSoon)> ContextAsync(CancellationToken cancellationToken)
    {
        var setting = await settings.GetAsync(cancellationToken);
        return (DateHelper.TodayIn(setting.TimeZone), setting.DueSoonDays);
    }

    private async Task<List<Bill>> LoadAllAsync(CancellationToken cancellationToken) =>
        await database.Bills.AsNoTracking().Include(bill => bill.Payments).ToListAsync(cancellationToken);

    private async Task<Bill> FindAsync(Guid id, CancellationToken cancellationToken) =>
        await database.Bills.Include(bill => bill.Payments).FirstOrDefaultAsync(bill => bill.Id == id, cancellationToken)
        ?? throw new NotFoundException("Bill");

    private async Task<IReadOnlyList<BillResponse>> ProjectAsync(IReadOnlyList<Bill> bills, DateOnly today, int dueSoon, CancellationToken cancellationToken)
    {
        var ids = bills.Select(bill => bill.Id).ToList();
        var attachmentCounts = await database.Attachments.AsNoTracking()
            .Where(attachment => attachment.OwnerType == "bill" && ids.Contains(attachment.OwnerId))
            .GroupBy(attachment => attachment.OwnerId)
            .Select(group => new { group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Key, item => item.Count, cancellationToken);

        return bills.Select(bill => new BillResponse(
            bill.Id, bill.Provider, bill.BillType, bill.AccountIdentifier, bill.Amount, bill.MinimumDue, bill.PaidAmount,
            bill.Unpaid, bill.DueDate, bill.PeriodStart, bill.PeriodEnd, FinanceCalculator.StatusOf(bill, today, dueSoon),
            bill.IsRecurring, bill.PaymentDate, bill.PaymentMethod, bill.EmailSource, bill.EmailImportId is not null, bill.Notes,
            bill.DueDate.DayNumber - today.DayNumber, attachmentCounts.GetValueOrDefault(bill.Id),
            bill.Payments.OrderByDescending(payment => payment.Date)
                .Select(payment => new BillPaymentResponse(payment.Id, payment.Amount, payment.Date, payment.PaymentMethod, payment.PersonalTransactionId))
                .ToList())).ToList();
    }

    private static int StatusRank(BillStatus status) => status switch
    {
        BillStatus.Overdue => 0,
        BillStatus.DueSoon => 1,
        BillStatus.Upcoming => 2,
        BillStatus.Paid => 3,
        _ => 4
    };

    private static void Validate(BillRequest request)
    {
        if (request.MinimumDue is { } minimum && minimum > request.Amount)
            throw new BusinessRuleException("The minimum amount due cannot be more than the bill amount.");
        if (request.PeriodStart is { } start && request.PeriodEnd is { } end && end < start)
            throw new BusinessRuleException("The billing period end must be after its start.");
    }

    private static void Apply(Bill bill, BillRequest request)
    {
        bill.Provider = request.Provider.Trim();
        bill.BillType = request.BillType!.Value;
        bill.AccountIdentifier = FinanceCalculator.Mask(request.AccountIdentifier);
        bill.Amount = decimal.Round(request.Amount, 2);
        bill.MinimumDue = request.MinimumDue is { } minimum ? decimal.Round(minimum, 2) : null;
        bill.DueDate = request.DueDate!.Value;
        bill.PeriodStart = request.PeriodStart;
        bill.PeriodEnd = request.PeriodEnd;
        bill.IsRecurring = request.IsRecurring;
        bill.PaymentMethod = string.IsNullOrWhiteSpace(request.PaymentMethod) ? bill.PaymentMethod : request.PaymentMethod.Trim();
        bill.EmailSource = string.IsNullOrWhiteSpace(request.EmailSource) ? bill.EmailSource : request.EmailSource.Trim();
        bill.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
    }
}
