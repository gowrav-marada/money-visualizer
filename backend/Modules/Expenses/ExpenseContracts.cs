using System.ComponentModel.DataAnnotations;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Modules.Expenses;

public sealed record TransactionRequest(
    [Required] TransactionType? Type,
    [Range(typeof(decimal), "0.01", "999999999999")] decimal Amount,
    [Required] DateOnly? Date,
    [Required] Guid? CategoryId,
    [Required, StringLength(200, MinimumLength = 1)] string Description,
    [StringLength(60)] string? PaymentMethod,
    Guid? AccountId,
    [StringLength(120)] string? Merchant,
    [StringLength(1000)] string? Notes,
    bool IsRecurring,
    RecurrenceFrequency? Frequency);

public sealed record TransactionResponse(
    Guid Id,
    TransactionType Type,
    decimal Amount,
    DateOnly Date,
    Guid CategoryId,
    string CategoryName,
    string Description,
    string? PaymentMethod,
    Guid? AccountId,
    string? AccountName,
    string? Merchant,
    string? Notes,
    bool IsRecurring,
    bool ExcludeFromTotals,
    bool IsBillPayment,
    int AttachmentCount);

public sealed record TransactionQuery(
    TransactionType? Type,
    Guid? CategoryId,
    Guid? AccountId,
    string? PaymentMethod,
    DateOnly? From,
    DateOnly? To,
    string? Search,
    decimal? MinAmount,
    decimal? MaxAmount);

public sealed record CategoryAmount(string Name, decimal Amount);

public sealed record ExpenseSummary(
    decimal TotalIncome,
    decimal TotalExpenses,
    decimal Balance,
    decimal ThisMonthExpenses,
    decimal PreviousMonthExpenses,
    decimal AverageDailySpending,
    CategoryAmount? HighestCategory,
    decimal? MonthlyBudget,
    decimal FilteredIncome,
    decimal FilteredExpenses);

public sealed record PeriodBucket(string Label, DateOnly Start, decimal Income, decimal Expenses);

public sealed record RecurringResponse(
    Guid Id, TransactionType Type, decimal Amount, string CategoryName, string Description,
    RecurrenceFrequency Frequency, DateOnly NextDate, bool IsActive);
