using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using MoneyVisualizer.Api.Domain;

namespace MoneyVisualizer.Api.Modules.Email;

public sealed record MailMessage(string Id, string Subject, string From, DateTime ReceivedAt, string Body, IReadOnlyList<string> AttachmentNames);

public sealed record BillExtraction(
    bool IsBillRelated,
    bool LooksLikePayment,
    string? ProviderName,
    BillType BillType,
    string? MaskedAccount,
    decimal? Amount,
    decimal? MinimumDue,
    DateOnly? DueDate,
    DateOnly? PeriodStart,
    DateOnly? PeriodEnd,
    string? AttachmentName,
    decimal Confidence,
    IReadOnlyList<string> Missing)
{
    public const decimal LowConfidenceThreshold = 0.6m;
    public bool IsLowConfidence => Confidence < LowConfidenceThreshold;
}

/// <summary>
/// Deterministic, rule-based bill extraction. It runs locally (no email content leaves the server) and
/// reports a confidence score so uncertain results are clearly flagged for review.
/// </summary>
public static partial class BillEmailExtractor
{
    public static readonly string[] Indicators =
    [
        "bill generated", "statement available", "statement is ready", "amount due", "minimum amount due", "payment due",
        "due date", "credit card statement", "card statement", "mobile bill", "telephone bill", "postpaid bill", "internet bill",
        "broadband bill", "utility bill", "electricity bill", "water bill", "subscription renewal", "renewal", "emi due",
        "payment reminder", "premium due", "your bill", "e-bill", "ebill", "invoice"
    ];

    private static readonly string[] PaymentPhrases =
    [
        "payment received", "thank you for your payment", "payment successful", "payment of rs", "we have received your payment",
        "payment has been received", "received your payment", "payment confirmation", "paid successfully"
    ];

    private static readonly (BillType Type, string[] Words)[] TypeKeywords =
    [
        (BillType.CreditCard, ["credit card", "card statement", "card ending", "card no", "card number"]),
        (BillType.Emi, ["emi", "loan account", "loan repayment", "instalment", "installment"]),
        (BillType.Insurance, ["insurance", "premium", "policy"]),
        (BillType.Internet, ["broadband", "internet", "fiber", "fibre", "wi-fi", "wifi"]),
        (BillType.Telephone, ["mobile bill", "postpaid", "telephone", "landline", "mobile number", "airtel", "jio", "vodafone", "vi bill", "bsnl"]),
        (BillType.Electricity, ["electricity", "power bill", "kwh", "units consumed", "discom"]),
        (BillType.Water, ["water bill", "water supply", "jal board", "water charges"]),
        (BillType.Rent, ["rent due", "rental", "monthly rent"]),
        (BillType.Subscription, ["subscription", "renewal", "membership", "plan renews"])
    ];

    private const string Currency = @"(?:₹|rs\.?|inr)";
    private const string Number = @"([0-9][0-9,]*(?:\.[0-9]{1,2})?)";

    public static BillExtraction Extract(MailMessage message)
    {
        var text = Normalize($"{message.Subject}\n{message.Body}");
        var lower = text.ToLowerInvariant();
        var missing = new List<string>();

        var isPayment = PaymentPhrases.Any(lower.Contains);
        var indicatorHits = Indicators.Count(lower.Contains);
        if (indicatorHits == 0 && !isPayment)
            return new BillExtraction(false, false, null, BillType.Other, null, null, null, null, null, null, null, 0, ["Not a bill email"]);

        var billType = DetectType(lower);
        var provider = ReadProvider(message.From);

        var amount = MatchAmount(text, @"(?:total\s+amount\s+due|total\s+due|amount\s+due|bill\s+amount|amount\s+payable|total\s+outstanding|statement\s+balance|outstanding\s+amount|total\s+amount|premium\s+amount|emi\s+amount|payment\s+of)");
        var amountIsLabelled = amount is not null;
        amount ??= FirstCurrencyAmount(text);
        if (amount is null) missing.Add("amount");

        var minimum = MatchAmount(text, @"(?:minimum\s+amount\s+due|min(?:imum)?\.?\s+(?:amt\.?\s+)?due|minimum\s+payment)");
        if (minimum is not null && amount is not null && minimum > amount)
            minimum = null;

        var dueDate = MatchDate(text, @"(?:payment\s+due\s+date|due\s+date|due\s+on|pay\s+by|due\s+by|last\s+date(?:\s+of\s+payment)?|renews\s+on)", message.ReceivedAt);
        if (dueDate is null && !isPayment) missing.Add("due date");

        var (periodStart, periodEnd) = MatchPeriod(text, message.ReceivedAt);
        var masked = MatchAccount(text);

        decimal confidence = 0.15m + Math.Min(indicatorHits, 3) * 0.05m;
        if (amount is not null) confidence += amountIsLabelled ? 0.3m : 0.15m;
        if (dueDate is not null) confidence += 0.25m;
        if (billType != BillType.Other) confidence += 0.1m;
        if (masked is not null || periodStart is not null) confidence += 0.05m;
        if (!string.IsNullOrWhiteSpace(provider)) confidence += 0.05m;

        return new BillExtraction(
            true, isPayment, provider, billType, masked, amount, minimum, dueDate, periodStart, periodEnd,
            message.AttachmentNames.FirstOrDefault(), Math.Min(1m, decimal.Round(confidence, 2)), missing);
    }

    public static BillType DetectType(string lower)
    {
        foreach (var (type, words) in TypeKeywords)
            if (words.Any(word => Regex.IsMatch(lower, $@"\b{Regex.Escape(word)}\b")))
                return type;
        return BillType.Other;
    }

    public static string? ReadProvider(string from)
    {
        if (string.IsNullOrWhiteSpace(from))
            return null;

        var display = from.Contains('<') ? from[..from.IndexOf('<')].Trim().Trim('"', '\'') : string.Empty;
        if (display.Length is > 1 and <= 60 && !display.Contains('@'))
            return display;

        var at = from.LastIndexOf('@');
        if (at < 0)
            return null;
        var domain = from[(at + 1)..].Trim('>', ' ', '"');
        var parts = domain.Split('.', StringSplitOptions.RemoveEmptyEntries);
        var label = parts.Length >= 2 ? parts[^2] : parts.FirstOrDefault();
        if (label is "co" or "com" && parts.Length >= 3)
            label = parts[^3];
        return string.IsNullOrWhiteSpace(label) ? null : char.ToUpperInvariant(label[0]) + label[1..];
    }

    private static decimal? MatchAmount(string text, string labelPattern)
    {
        var match = Regex.Match(text, $@"{labelPattern}[^0-9₹\n]{{0,40}}?{Currency}?\s*{Number}", RegexOptions.IgnoreCase);
        return match.Success ? ParseAmount(match.Groups[1].Value) : null;
    }

    private static decimal? FirstCurrencyAmount(string text)
    {
        var match = Regex.Match(text, $@"{Currency}\s*{Number}", RegexOptions.IgnoreCase);
        return match.Success ? ParseAmount(match.Groups[1].Value) : null;
    }

    private static decimal? ParseAmount(string value) =>
        decimal.TryParse(value.Replace(",", string.Empty), NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) && amount > 0 ? amount : null;

    private const string DatePattern =
        @"(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?[\s\-]+[A-Za-z]{3,9}[\s\-,]+\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})";

    private static DateOnly? MatchDate(string text, string labelPattern, DateTime receivedAt)
    {
        var match = Regex.Match(text, $@"{labelPattern}[\s:\-–is]{{0,15}}{DatePattern}", RegexOptions.IgnoreCase);
        return match.Success ? ParseDate(match.Groups[1].Value, receivedAt) : null;
    }

    private static (DateOnly?, DateOnly?) MatchPeriod(string text, DateTime receivedAt)
    {
        var match = Regex.Match(text, $@"(?:billing\s+period|statement\s+period|bill\s+period|bill\s+cycle|service\s+period)[\s:\-]{{0,10}}(?:from\s+)?{DatePattern}\s*(?:to|-|–|till)\s*{DatePattern}", RegexOptions.IgnoreCase);
        if (!match.Success)
            return (null, null);
        var start = ParseDate(match.Groups[1].Value, receivedAt);
        var end = ParseDate(match.Groups[2].Value, receivedAt);
        return start is not null && end is not null && end >= start ? (start, end) : (null, null);
    }

    private static string? MatchAccount(string text)
    {
        var match = Regex.Match(text,
            @"(?:card|a\/c|acct|account|loan|policy|ending|no\.?)\s*(?:no\.?|number|ending|ending\s+(?:in|with))?\s*[:\-]?\s*(?:[x*X•]{2,}[\s\-]*)*(\d{4})\b",
            RegexOptions.IgnoreCase);
        return match.Success ? $"XXXX{match.Groups[1].Value}" : null;
    }

    /// <summary>Parses Indian-style dates (day first). Two-digit years are treated as 20xx.</summary>
    public static DateOnly? ParseDate(string raw, DateTime receivedAt)
    {
        var value = Regex.Replace(raw.Trim(), @"(\d)(st|nd|rd|th)", "$1", RegexOptions.IgnoreCase).Replace(",", " ");
        value = Regex.Replace(value, @"\s+", " ");
        string[] formats =
        [
            "d/M/yyyy", "d-M-yyyy", "d.M.yyyy", "d/M/yy", "d-M-yy", "d.M.yy", "yyyy-MM-dd",
            "d MMM yyyy", "d-MMM-yyyy", "d MMMM yyyy", "d-MMMM-yyyy", "d MMM yy", "d-MMM-yy",
            "MMM d yyyy", "MMMM d yyyy"
        ];
        if (!DateOnly.TryParseExact(value, formats, CultureInfo.InvariantCulture, DateTimeStyles.AllowWhiteSpaces, out var date))
            return null;

        // Reject implausible dates (likely mis-parsed numbers).
        var received = DateOnly.FromDateTime(receivedAt);
        return date < received.AddYears(-1) || date > received.AddYears(1) ? null : date;
    }

    private static string Normalize(string text)
    {
        var decoded = WebUtility.HtmlDecode(text);
        decoded = decoded.Replace('\u00a0', ' ');
        return Regex.Replace(decoded, @"[ \t\r\f\v]+", " ");
    }

    public static string StripHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
            return string.Empty;
        var withoutNoise = Regex.Replace(html, "<(script|style|head)[^>]*>.*?</\\1>", " ", RegexOptions.Singleline | RegexOptions.IgnoreCase);
        var spaced = Regex.Replace(withoutNoise, "</(td|tr|div|p|br|li|h[1-6])>|<br\\s*/?>", " \n", RegexOptions.IgnoreCase);
        return WebUtility.HtmlDecode(Regex.Replace(spaced, "<[^>]+>", " "));
    }
}
