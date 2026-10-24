using System.ComponentModel.DataAnnotations;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Modules.Bills;

public sealed record BillRequest(
    [Required, StringLength(100, MinimumLength = 1)] string Provider,
    [Required] BillType? BillType,
    [StringLength(60)] string? AccountIdentifier,
    [Range(typeof(decimal), "0.01", "999999999999")] decimal Amount,
    [Range(typeof(decimal), "0", "999999999999")] decimal? MinimumDue,
    [Required] DateOnly? DueDate,
    DateOnly? PeriodStart,
    DateOnly? PeriodEnd,
    bool IsRecurring,
    [StringLength(60)] string? PaymentMethod,
    [StringLength(200)] string? EmailSource,
    [StringLength(1000)] string? Notes,
    /// <summary>Save even when a matching bill already exists.</summary>
    bool AllowDuplicate = false);

public sealed record BillPaymentRequest(
    [Range(typeof(decimal), "0.01", "999999999999")] decimal Amount,
    [Required] DateOnly? Date,
    [StringLength(60)] string? PaymentMethod,
    /// <summary>
    /// Also add an expense in the Expenses tab. For credit-card bills the expense is recorded as a
    /// "Credit-card payment" transfer, which is excluded from totals so card spends aren't counted twice.
    /// </summary>
    bool RecordAsExpense,
    Guid? CategoryId,
    Guid? AccountId);

public sealed record IgnoreRequest(bool Ignored);

public sealed record BillResponse(
    Guid Id,
    string Provider,
    BillType BillType,
    string? AccountIdentifier,
    decimal Amount,
    decimal? MinimumDue,
    decimal PaidAmount,
    decimal Unpaid,
    DateOnly DueDate,
    DateOnly? PeriodStart,
    DateOnly? PeriodEnd,
    BillStatus Status,
    bool IsRecurring,
    DateOnly? PaymentDate,
    string? PaymentMethod,
    string? EmailSource,
    bool FromEmail,
    string? Notes,
    int DaysUntilDue,
    int AttachmentCount,
    IReadOnlyList<BillPaymentResponse> Payments);

public sealed record BillPaymentResponse(Guid Id, decimal Amount, DateOnly Date, string? PaymentMethod, Guid? PersonalTransactionId);

public sealed record BillQuery(BillStatus? Status, BillType? BillType, string? Provider, DateOnly? From, DateOnly? To, string? Search, bool? Recurring);

public sealed record AmountCount(int Count, decimal Amount);

public sealed record BillSummary(
    AmountCount Unpaid,
    AmountCount DueThisWeek,
    AmountCount DueThisMonth,
    AmountCount Overdue,
    AmountCount PaidThisMonth,
    int Recurring);

public sealed record ProviderGroup(string Provider, int Count, decimal Unpaid, DateOnly? NextDue, BillType BillType);
