using Microsoft.EntityFrameworkCore;
using MoneyVisualizer.Api.Data;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Infrastructure;
using MoneyVisualizer.Api.Modules.Bills;
using MoneyVisualizer.Api.Modules.Credits;
using MoneyVisualizer.Api.Modules.Expenses;
using MoneyVisualizer.Api.Modules.Settings;

namespace MoneyVisualizer.Api.Modules.Dashboard;

public sealed record DashboardAlert(string Severity, string Message, string Link);

public sealed record DashboardBill(Guid Id, string Provider, BillType BillType, decimal Unpaid, DateOnly DueDate, BillStatus Status, int DaysUntilDue);

public sealed record DashboardTransaction(Guid Id, TransactionType Type, decimal Amount, DateOnly Date, string Category, string Description, string? Merchant);

public sealed record DashboardResponse(
    FinancialPosition Position,
    AmountCount OverdueBills,
    AmountCount UnpaidBills,
    CreditSummary Credits,
    IReadOnlyList<PersonBalance> PeopleOweMe,
    IReadOnlyList<PersonBalance> PeopleIOwe,
    IReadOnlyList<DashboardBill> UpcomingBills,
    IReadOnlyList<DashboardBill> OverdueBillList,
    IReadOnlyList<DashboardTransaction> RecentExpenses,
    IReadOnlyList<DashboardTransaction> RecentIncome,
    IReadOnlyList<PeriodBucket> MonthlyTrend,
    IReadOnlyList<CategoryAmount> SpendingByCategory,
    decimal ThisMonthExpenses,
    decimal PreviousMonthExpenses,
    decimal? MonthlyBudget,
    IReadOnlyList<DashboardAlert> Alerts);

public sealed class DashboardService(
    MoneyDbContext database,
    SettingsService settings,
    CreditService credits,
    ExpenseService expenses)
{
    public async Task<DashboardResponse> GetAsync(CancellationToken cancellationToken)
    {
        var setting = await settings.GetAsync(cancellationToken);
        var today = DateHelper.TodayIn(setting.TimeZone);
        var monthStart = DateHelper.StartOfMonth(today);

        var transactions = await database.PersonalTransactions.AsNoTracking().Include(transaction => transaction.Category).ToListAsync(cancellationToken);
        var creditRecords = await database.ReceivablePayables.AsNoTracking().Include(record => record.Person).ToListAsync(cancellationToken);
        var bills = await database.Bills.AsNoTracking().ToListAsync(cancellationToken);

        var position = FinanceCalculator.Position(transactions, creditRecords, bills);
        var billSummary = BillService.Summarize(bills, today, setting.DueSoonDays);
        var creditSummary = CreditService.Summarize(creditRecords, today);
        var people = await credits.PeopleAsync(cancellationToken);

        var open = bills.Where(bill => bill.Unpaid > 0).ToList();
        DashboardBill ToBill(Bill bill) => new(bill.Id, bill.Provider, bill.BillType, bill.Unpaid, bill.DueDate,
            FinanceCalculator.StatusOf(bill, today, setting.DueSoonDays), bill.DueDate.DayNumber - today.DayNumber);
        DashboardTransaction ToTransaction(PersonalTransaction transaction) => new(transaction.Id, transaction.Type, transaction.Amount,
            transaction.Date, transaction.Category?.Name ?? "Other", transaction.Description, transaction.Merchant);

        var counted = transactions.Where(transaction => !transaction.ExcludeFromTotals).ToList();
        var thisMonthExpenses = FinanceCalculator.Totals(counted.Where(transaction => transaction.Date >= monthStart && transaction.Date <= today)).Expenses;
        var previousMonthStart = monthStart.AddMonths(-1);
        var previousMonthExpenses = FinanceCalculator.Totals(counted.Where(transaction => transaction.Date >= previousMonthStart && transaction.Date < monthStart)).Expenses;
        // Compare like-for-like: the same number of days into each month.
        var previousSamePeriod = FinanceCalculator.Totals(counted.Where(transaction =>
            transaction.Date >= previousMonthStart && transaction.Date <= previousMonthStart.AddDays(Math.Min(today.Day, DateTime.DaysInMonth(previousMonthStart.Year, previousMonthStart.Month)) - 1))).Expenses;

        var spendingByCategory = counted
            .Where(transaction => transaction.Type == TransactionType.Expense && transaction.Date >= monthStart && transaction.Date <= today)
            .GroupBy(transaction => transaction.Category?.Name ?? "Other")
            .Select(group => new CategoryAmount(group.Key, group.Sum(transaction => transaction.Amount)))
            .OrderByDescending(category => category.Amount)
            .ToList();

        var alerts = BuildAlerts(creditSummary, billSummary, thisMonthExpenses, previousSamePeriod, setting.MonthlyBudget,
            creditRecords.Count(record => record.Direction == Direction.Pay && FinanceCalculator.StatusOf(record, today) == ReceivableStatus.Overdue));

        return new DashboardResponse(
            position,
            billSummary.Overdue,
            billSummary.Unpaid,
            creditSummary,
            people.Where(person => person.ToReceive > 0).OrderByDescending(person => person.ToReceive).Take(5).ToList(),
            people.Where(person => person.ToPay > 0).OrderByDescending(person => person.ToPay).Take(5).ToList(),
            open.Where(bill => bill.DueDate >= today).OrderBy(bill => bill.DueDate).Take(5).Select(ToBill).ToList(),
            open.Where(bill => bill.DueDate < today).OrderBy(bill => bill.DueDate).Take(5).Select(ToBill).ToList(),
            transactions.Where(transaction => transaction.Type == TransactionType.Expense).OrderByDescending(transaction => transaction.Date).ThenByDescending(transaction => transaction.CreatedAt).Take(5).Select(ToTransaction).ToList(),
            transactions.Where(transaction => transaction.Type == TransactionType.Income).OrderByDescending(transaction => transaction.Date).ThenByDescending(transaction => transaction.CreatedAt).Take(5).Select(ToTransaction).ToList(),
            await expenses.PeriodsAsync("month", 6, cancellationToken),
            spendingByCategory,
            thisMonthExpenses,
            previousMonthExpenses,
            setting.MonthlyBudget,
            alerts);
    }

    public static IReadOnlyList<DashboardAlert> BuildAlerts(CreditSummary credits, BillSummary bills, decimal thisMonth, decimal previousSamePeriod, decimal? budget, int overduePayables)
    {
        var alerts = new List<DashboardAlert>();
        if (bills.Overdue.Count > 0)
            alerts.Add(new("danger", $"{bills.Overdue.Count} {Plural(bills.Overdue.Count, "bill is", "bills are")} overdue", "/bills?status=Overdue"));
        if (overduePayables > 0)
            alerts.Add(new("danger", $"{overduePayables} {Plural(overduePayables, "payment", "payments")} you owe {Plural(overduePayables, "is", "are")} overdue", "/credits?direction=Pay&status=Overdue"));
        var dueThisWeek = bills.DueThisWeek.Count;
        if (dueThisWeek > 0)
            alerts.Add(new("warning", $"{dueThisWeek} {Plural(dueThisWeek, "bill is", "bills are")} due this week", "/bills?view=week"));
        if (budget is > 0 && thisMonth > budget)
            alerts.Add(new("warning", "You have exceeded this month's budget", "/expenses?type=Expense&period=month"));
        else if (budget is > 0 && thisMonth >= budget * 0.8m)
            alerts.Add(new("warning", $"You have used {thisMonth / budget.Value:P0} of this month's budget", "/expenses?type=Expense&period=month"));
        if (previousSamePeriod > 0 && thisMonth > previousSamePeriod)
            alerts.Add(new("info", $"Your expenses increased {(thisMonth - previousSamePeriod) / previousSamePeriod:P0} compared with the same point last month", "/expenses?type=Expense&period=month"));
        if (credits.PeopleOweMe > 0)
            alerts.Add(new("info", $"{credits.PeopleOweMe} {Plural(credits.PeopleOweMe, "person owes", "people owe")} you money", "/credits?direction=Receive"));
        return alerts;
    }

    private static string Plural(int count, string singular, string plural) => count == 1 ? singular : plural;
}
