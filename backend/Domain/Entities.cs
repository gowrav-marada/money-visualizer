namespace MoneyVisualizer.Api.Domain;

/// <summary>Base for all records that belong to a single signed-in user.</summary>
public abstract class OwnedEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>Stable identifier from the identity provider (Entra "oid" or OIDC "sub").</summary>
    public string ExternalId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public sealed class Person : OwnedEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Notes { get; set; }
}

public sealed class Account : OwnedEntity
{
    public string Name { get; set; } = string.Empty;
    public AccountKind Kind { get; set; }
    /// <summary>Only the last four digits are ever stored, e.g. "XXXX1234".</summary>
    public string? MaskedNumber { get; set; }
    public bool IsArchived { get; set; }
}

public sealed class Category : OwnedEntity
{
    public string Name { get; set; } = string.Empty;
    public CategoryKind Kind { get; set; }
    public bool IsSystem { get; set; }
    /// <summary>Transfers such as credit-card payments are excluded from expense totals to prevent double counting.</summary>
    public bool ExcludeFromTotals { get; set; }
}

public sealed class PersonalTransaction : OwnedEntity
{
    public TransactionType Type { get; set; }
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }
    public Guid CategoryId { get; set; }
    public Category? Category { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? PaymentMethod { get; set; }
    public Guid? AccountId { get; set; }
    public Account? Account { get; set; }
    public string? Merchant { get; set; }
    public string? Notes { get; set; }
    public bool IsRecurring { get; set; }
    public Guid? RecurringTransactionId { get; set; }
    /// <summary>When true the amount is a transfer and is not counted in income/expense totals.</summary>
    public bool ExcludeFromTotals { get; set; }
    public Guid? BillPaymentId { get; set; }
}

public sealed class RecurringTransaction : OwnedEntity
{
    public TransactionType Type { get; set; }
    public decimal Amount { get; set; }
    public Guid CategoryId { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? Merchant { get; set; }
    public string? PaymentMethod { get; set; }
    public Guid? AccountId { get; set; }
    public RecurrenceFrequency Frequency { get; set; }
    public DateOnly NextDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class ReceivablePayable : OwnedEntity
{
    public Guid PersonId { get; set; }
    public Person? Person { get; set; }
    public Direction Direction { get; set; }
    public decimal Amount { get; set; }
    /// <summary>Denormalized sum of <see cref="Settlements"/>; maintained by the credits service.</summary>
    public decimal SettledAmount { get; set; }
    public DateOnly TransactionDate { get; set; }
    public DateOnly? ExpectedDate { get; set; }
    public string Description { get; set; } = string.Empty;
    public string? PaymentMethod { get; set; }
    public string? Category { get; set; }
    public string? Notes { get; set; }
    public DateOnly? ReminderDate { get; set; }
    public List<Settlement> Settlements { get; set; } = [];

    public decimal Remaining => Math.Max(0, Amount - SettledAmount);
}

public sealed class Settlement : OwnedEntity
{
    public Guid ReceivablePayableId { get; set; }
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }
    public string? PaymentMethod { get; set; }
    public string? Notes { get; set; }
}

public sealed class Bill : OwnedEntity
{
    public string Provider { get; set; } = string.Empty;
    public BillType BillType { get; set; }
    public string? AccountIdentifier { get; set; }
    public decimal Amount { get; set; }
    public decimal? MinimumDue { get; set; }
    public DateOnly DueDate { get; set; }
    public DateOnly? PeriodStart { get; set; }
    public DateOnly? PeriodEnd { get; set; }
    public bool IsIgnored { get; set; }
    public bool IsRecurring { get; set; }
    /// <summary>Denormalized sum of <see cref="Payments"/>.</summary>
    public decimal PaidAmount { get; set; }
    public DateOnly? PaymentDate { get; set; }
    public string? PaymentMethod { get; set; }
    public string? EmailSource { get; set; }
    public Guid? EmailImportId { get; set; }
    public string? Notes { get; set; }
    public List<BillPayment> Payments { get; set; } = [];

    public decimal Unpaid => IsIgnored ? 0 : Math.Max(0, Amount - PaidAmount);
}

public sealed class BillPayment : OwnedEntity
{
    public Guid BillId { get; set; }
    public decimal Amount { get; set; }
    public DateOnly Date { get; set; }
    public string? PaymentMethod { get; set; }
    /// <summary>The expense created from this payment, if the user chose to record one.</summary>
    public Guid? PersonalTransactionId { get; set; }
}

public sealed class EmailConnection : OwnedEntity
{
    public MailProvider Provider { get; set; }
    public string EmailAddress { get; set; } = string.Empty;
    /// <summary>Protected with ASP.NET Core Data Protection; never stored in clear text.</summary>
    public string EncryptedAccessToken { get; set; } = string.Empty;
    public string? EncryptedRefreshToken { get; set; }
    public DateTime AccessTokenExpiresAt { get; set; }
    public DateTime? LastSyncedAt { get; set; }
}

public sealed class EmailImport : OwnedEntity
{
    public MailProvider Provider { get; set; }
    public string MessageId { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string FromAddress { get; set; } = string.Empty;
    public DateTime ReceivedAt { get; set; }
    public EmailImportStatus Status { get; set; }
    public string? ProviderName { get; set; }
    public BillType? BillType { get; set; }
    public string? MaskedAccount { get; set; }
    public decimal? Amount { get; set; }
    public decimal? MinimumDue { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateOnly? PeriodStart { get; set; }
    public DateOnly? PeriodEnd { get; set; }
    public string? AttachmentName { get; set; }
    public decimal Confidence { get; set; }
    public bool LooksLikePayment { get; set; }
    public string? FailureReason { get; set; }
    public Guid? BillId { get; set; }
    public Guid? DuplicateOfBillId { get; set; }
}

public sealed class Attachment : OwnedEntity
{
    /// <summary>One of "transaction", "credit", "bill".</summary>
    public string OwnerType { get; set; } = string.Empty;
    public Guid OwnerId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long Size { get; set; }
    public string StoragePath { get; set; } = string.Empty;
}

public sealed class Notification : OwnedEntity
{
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? Link { get; set; }
    /// <summary>Prevents the same reminder being generated twice.</summary>
    public string DedupKey { get; set; } = string.Empty;
    public DateTime? ReadAt { get; set; }
}

public sealed class ApplicationSetting : OwnedEntity
{
    public string Currency { get; set; } = "INR";
    public string Locale { get; set; } = "en-IN";
    public string DateFormat { get; set; } = "dd MMM yyyy";
    public string TimeZone { get; set; } = "Asia/Kolkata";
    public decimal? MonthlyBudget { get; set; }
    public ThemePreference Theme { get; set; } = ThemePreference.System;
    public bool NotificationsEnabled { get; set; } = true;
    public int BillReminderDays { get; set; } = 3;
    public int DueSoonDays { get; set; } = 7;
    /// <summary>JSON array of payment method names.</summary>
    public string PaymentMethods { get; set; } = "[\"Cash\",\"UPI\",\"Debit card\",\"Credit card\",\"Net banking\",\"Bank transfer\"]";
    public bool AppLockEnabled { get; set; }
    public string? AppLockPinHash { get; set; }
}

public sealed class AuditLog
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public Guid EntityId { get; set; }
    public AuditAction Action { get; set; }
    public string Changes { get; set; } = "{}";
    public DateTime At { get; set; }
}
