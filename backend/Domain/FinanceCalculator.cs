using System.Text.RegularExpressions;

namespace MoneyVisualizer.Api.Domain;

/// <summary>
/// Pure calculation rules shared by every module. Keeping them here (and free of EF) makes the
/// no-double-counting guarantees easy to unit test.
/// </summary>
public static partial class FinanceCalculator
{
    public static ReceivableStatus StatusOf(ReceivablePayable record, DateOnly today)
    {
        if (record.Remaining <= 0)
            return ReceivableStatus.Paid;
        if (record.ExpectedDate is { } expected && expected < today)
            return ReceivableStatus.Overdue;
        return record.SettledAmount > 0 ? ReceivableStatus.PartiallyPaid : ReceivableStatus.Pending;
    }

    public static BillStatus StatusOf(Bill bill, DateOnly today, int dueSoonDays)
    {
        if (bill.IsIgnored)
            return BillStatus.Ignored;
        if (bill.Unpaid <= 0)
            return BillStatus.Paid;
        if (bill.DueDate < today)
            return BillStatus.Overdue;
        return bill.DueDate <= today.AddDays(dueSoonDays) ? BillStatus.DueSoon : BillStatus.Upcoming;
    }

    /// <summary>Transfers (e.g. credit-card bill payments) are excluded so card spends are not counted twice.</summary>
    public static (decimal Income, decimal Expenses) Totals(IEnumerable<PersonalTransaction> transactions)
    {
        decimal income = 0, expenses = 0;
        foreach (var transaction in transactions)
        {
            if (transaction.ExcludeFromTotals)
                continue;
            if (transaction.Type == TransactionType.Income)
                income += transaction.Amount;
            else
                expenses += transaction.Amount;
        }

        return (income, expenses);
    }

    public static FinancialPosition Position(
        IReadOnlyCollection<PersonalTransaction> transactions,
        IReadOnlyCollection<ReceivablePayable> credits,
        IReadOnlyCollection<Bill> bills)
    {
        var (income, expenses) = Totals(transactions);
        var toReceive = credits.Where(credit => credit.Direction == Direction.Receive).Sum(credit => credit.Remaining);
        var toPay = credits.Where(credit => credit.Direction == Direction.Pay).Sum(credit => credit.Remaining);
        // Paid portions of bills are already in expenses (when recorded), so only the unpaid part is an obligation.
        var unpaidBills = bills.Sum(bill => bill.Unpaid);
        var balance = income - expenses;
        var netReceivables = toReceive - toPay;
        return new FinancialPosition(income, expenses, balance, toReceive, toPay, netReceivables, unpaidBills,
            balance + netReceivables - unpaidBills);
    }

    /// <summary>Keeps only the last four digits of a card or account number, e.g. "XXXX1234".</summary>
    public static string? Mask(string? identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier))
            return null;

        var digits = NonDigits().Replace(identifier, string.Empty);
        if (digits.Length >= 4)
            return $"XXXX{digits[^4..]}";

        // Non-numeric identifiers (e.g. a phone plan name) are kept but truncated; short digit strings are fully masked.
        return digits.Length > 0 ? "XXXX" : identifier.Trim()[..Math.Min(identifier.Trim().Length, 40)];
    }

    public static string BillDedupKey(string provider, string? account, DateOnly? periodStart, DateOnly? periodEnd, decimal amount, DateOnly dueDate) =>
        string.Join('|',
            provider.Trim().ToLowerInvariant(),
            (Mask(account) ?? string.Empty).ToLowerInvariant(),
            periodStart?.ToString("yyyy-MM-dd") ?? string.Empty,
            periodEnd?.ToString("yyyy-MM-dd") ?? string.Empty,
            decimal.Round(amount, 2).ToString(System.Globalization.CultureInfo.InvariantCulture),
            dueDate.ToString("yyyy-MM-dd"));

    public static DateOnly Advance(DateOnly date, RecurrenceFrequency frequency) => frequency switch
    {
        RecurrenceFrequency.Weekly => date.AddDays(7),
        RecurrenceFrequency.Yearly => date.AddYears(1),
        _ => date.AddMonths(1)
    };

    [GeneratedRegex("[^0-9]")]
    private static partial Regex NonDigits();
}

public sealed record FinancialPosition(
    decimal TotalIncome,
    decimal TotalExpenses,
    decimal CurrentBalance,
    decimal ToReceive,
    decimal ToPay,
    decimal NetReceivables,
    decimal UnpaidBills,
    decimal NetPosition);
