namespace MoneyVisualizer.Api.Infrastructure;

public static class DateHelper
{
    /// <summary>Returns "today" in the user's configured time zone so due-date logic matches what the user sees.</summary>
    public static DateOnly TodayIn(string? timeZoneId, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        try
        {
            var zone = TimeZoneInfo.FindSystemTimeZoneById(string.IsNullOrWhiteSpace(timeZoneId) ? "Asia/Kolkata" : timeZoneId);
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(now, zone));
        }
        catch (TimeZoneNotFoundException)
        {
            return DateOnly.FromDateTime(now);
        }
    }

    public static DateOnly StartOfMonth(DateOnly date) => new(date.Year, date.Month, 1);

    public static DateOnly StartOfWeek(DateOnly date) => date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
}
