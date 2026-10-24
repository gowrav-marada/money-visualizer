using System.ComponentModel.DataAnnotations;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Modules.Settings;

public sealed record SettingsResponse(
    string Currency,
    string Locale,
    string DateFormat,
    string TimeZone,
    decimal? MonthlyBudget,
    ThemePreference Theme,
    bool NotificationsEnabled,
    int BillReminderDays,
    int DueSoonDays,
    IReadOnlyList<string> PaymentMethods,
    bool AppLockEnabled);

public sealed record UpdateSettingsRequest(
    [Required, RegularExpression("^[A-Z]{3}$", ErrorMessage = "Use a 3-letter ISO currency code such as INR.")] string Currency,
    [Required, StringLength(10)] string Locale,
    [Required, StringLength(20)] string DateFormat,
    [Required, StringLength(60)] string TimeZone,
    [Range(typeof(decimal), "0", "999999999999")] decimal? MonthlyBudget,
    ThemePreference Theme,
    bool NotificationsEnabled,
    [Range(0, 30)] int BillReminderDays,
    [Range(1, 30)] int DueSoonDays,
    [Required, MinLength(1)] List<string> PaymentMethods);

public sealed record CategoryRequest(
    [Required, StringLength(40, MinimumLength = 1)] string Name,
    [Required] CategoryKind? Kind,
    bool ExcludeFromTotals);

public sealed record CategoryResponse(Guid Id, string Name, CategoryKind Kind, bool IsSystem, bool ExcludeFromTotals, int UsageCount);

public sealed record AccountRequest(
    [Required, StringLength(60, MinimumLength = 1)] string Name,
    [Required] AccountKind? Kind,
    [StringLength(30)] string? Number,
    bool IsArchived);

public sealed record AccountResponse(Guid Id, string Name, AccountKind Kind, string? MaskedNumber, bool IsArchived);

public sealed record PinRequest([Required, RegularExpression("^[0-9]{4,8}$", ErrorMessage = "The PIN must be 4 to 8 digits.")] string Pin);

public sealed record SetPinRequest(
    [Required, RegularExpression("^[0-9]{4,8}$", ErrorMessage = "The PIN must be 4 to 8 digits.")] string Pin,
    string? CurrentPin);

public sealed record DeleteAccountRequest([Required] string Confirmation);
