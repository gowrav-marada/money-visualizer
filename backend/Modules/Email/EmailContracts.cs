using System.ComponentModel.DataAnnotations;
using MoneyVisualizer.Api.Domain;
using MoneyVisualizer.Api.Modules.Bills;

namespace MoneyVisualizer.Api.Modules.Email;

public sealed record ConnectionResponse(MailProvider Provider, string EmailAddress, DateTime ConnectedAt, DateTime? LastSyncedAt);

public sealed record EmailStatusResponse(
    bool OutlookConfigured,
    bool GmailConfigured,
    IReadOnlyList<ConnectionResponse> Connections,
    IReadOnlyDictionary<EmailImportStatus, int> Counts);

public sealed record SyncResult(int Fetched, int Detected, int Duplicates, int Failed, int AlreadyImported, int PaymentEmails, DateTime SyncedAt, IReadOnlyList<string> Errors);

public sealed record EmailImportResponse(
    Guid Id,
    MailProvider Provider,
    string Subject,
    string FromAddress,
    DateTime ReceivedAt,
    DateTime ImportedAt,
    EmailImportStatus Status,
    string? ProviderName,
    BillType? BillType,
    string? MaskedAccount,
    decimal? Amount,
    decimal? MinimumDue,
    DateOnly? DueDate,
    DateOnly? PeriodStart,
    DateOnly? PeriodEnd,
    string? AttachmentName,
    decimal Confidence,
    bool IsLowConfidence,
    bool LooksLikePayment,
    string? FailureReason,
    Guid? BillId,
    Guid? DuplicateOfBillId);

public sealed record ApplyPaymentRequest(
    [Required] Guid? BillId,
    [Range(typeof(decimal), "0.01", "999999999999")] decimal Amount,
    [Required] DateOnly? Date,
    string? PaymentMethod,
    bool RecordAsExpense);

public sealed record ConfirmImportRequest([Required] BillRequest Bill);
