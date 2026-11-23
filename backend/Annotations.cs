using System.Text.RegularExpressions;

internal static class Annotations
{
    private static readonly Regex Marker = new(@"\[\[(POINT|ARROW):\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d{1,3})\s*,\s*(\d{1,3}))?\s*\]\]", RegexOptions.IgnoreCase);
    internal record Mark(string Kind, int[] Coordinates);
    internal static Mark? Parse(string text)
    {
        var match = Marker.Match(text);
        if (!match.Success) return null;
        var kind = match.Groups[1].Value.ToUpperInvariant();
        var count = kind == "POINT" ? 2 : 4;
        if (match.Groups[4].Success != (count == 4)) return null;
        var coordinates = Enumerable.Range(2, count).Select(i => int.Parse(match.Groups[i].Value)).ToArray();
        return coordinates.Any(value => value > 100) ? null : new(kind, coordinates);
    }
    internal static string Clean(string text)
    {
        // Withhold an incomplete trailing marker during streaming as well as completed markers.
        var i = text.LastIndexOf("[[", StringComparison.Ordinal);
        if (i < 0) return text;
        var suffix = text[i..];
        return new[] { "[[POINT:", "[[ARROW:" }.Any(prefix => prefix.StartsWith(suffix, StringComparison.OrdinalIgnoreCase) || suffix.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) ? text[..i].TrimEnd() : text;
    }
}
