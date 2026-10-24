using System.Globalization;
using System.Text;

namespace MoneyVisualizer.Api.Infrastructure;

public static class Csv
{
    /// <summary>Builds RFC 4180 CSV with a UTF-8 BOM so Excel opens ₹ and other symbols correctly.</summary>
    public static byte[] Build(IEnumerable<string> header, IEnumerable<IEnumerable<object?>> rows)
    {
        var builder = new StringBuilder();
        builder.AppendLine(string.Join(',', header.Select(Escape)));
        foreach (var row in rows)
            builder.AppendLine(string.Join(',', row.Select(value => Escape(Format(value)))));
        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(builder.ToString())];
    }

    private static string Format(object? value) => value switch
    {
        null => string.Empty,
        DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        DateTime time => time.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
        decimal number => number.ToString("0.00", CultureInfo.InvariantCulture),
        IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? string.Empty
    };

    private static string Escape(string value)
    {
        // Prevent spreadsheet formula injection from user-entered text.
        if (value.Length > 0 && "=+-@".Contains(value[0]) && !decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out _))
            value = "'" + value;
        return value.IndexOfAny([',', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }
}
