using System.ComponentModel.DataAnnotations;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Modules.Credits;

public sealed record CreditRequest(
    [Required, StringLength(100, MinimumLength = 1)] string PersonName,
    [Required] Direction? Direction,
    [Range(typeof(decimal), "0.01", "999999999999")] decimal Amount,
    [Required] DateOnly? TransactionDate,
    DateOnly? ExpectedDate,
    [StringLength(200)] string? Description,
    [StringLength(60)] string? PaymentMethod,
    [StringLength(60)] string? Category,
    [StringLength(1000)] string? Notes,
    DateOnly? ReminderDate,
    [Range(typeof(decimal), "0", "999999999999")] decimal SettledAmount = 0);

public sealed record SettlementRequest(
    [Range(typeof(decimal), "0.01", "999999999999")] decimal Amount,
    [Required] DateOnly? Date,
    [StringLength(60)] string? PaymentMethod,
    [StringLength(500)] string? Notes);

public sealed record MarkPaidRequest(DateOnly? Date, string? PaymentMethod);

public sealed record ReminderRequest(DateOnly? ReminderDate);

public sealed record CreditResponse(
    Guid Id,
    Guid PersonId,
    string PersonName,
    Direction Direction,
    decimal Amount,
    decimal SettledAmount,
    decimal Remaining,
    ReceivableStatus Status,
    DateOnly TransactionDate,
    DateOnly? ExpectedDate,
    string Description,
    string? PaymentMethod,
    string? Category,
    string? Notes,
    DateOnly? ReminderDate,
    DateTime LatestActivity,
    int AttachmentCount);

public sealed record CreditQuery(
    Guid? PersonId,
    Direction? Direction,
    ReceivableStatus? Status,
    DateOnly? From,
    DateOnly? To,
    decimal? MinAmount,
    decimal? MaxAmount,
    string? Search);

public sealed record CreditSummary(
    decimal TotalToReceive,
    decimal TotalToPay,
    decimal NetReceivable,
    decimal TotalSettled,
    decimal TotalPending,
    decimal TotalOverdue,
    int PeopleOweMe,
    int PeopleIOwe);

public sealed record PersonBalance(
    Guid PersonId,
    string Name,
    decimal ToReceive,
    decimal ToPay,
    decimal Settled,
    decimal NetBalance,
    DateOnly? NextDueDate,
    DateTime LatestActivity,
    int OpenRecords,
    bool HasOverdue);

public sealed record HistoryEntry(DateTime At, string Kind, string Description, decimal? Amount, Guid? SettlementId = null);
