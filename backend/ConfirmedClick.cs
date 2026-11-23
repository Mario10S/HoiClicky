using System.Windows.Automation;

internal static class ConfirmedClick
{
    private static int[]? runtimeId;
    private static int targetX, targetY;
    private static string? targetName;
    private static DateTime expires;

    internal static object Prepare(int x, int y)
    {
        runtimeId = null;
        var element = AutomationElement.FromPoint(new System.Windows.Point(x, y));
        if (element == null || !element.Current.IsEnabled || element.Current.IsOffscreen ||
            !element.TryGetCurrentPattern(InvokePattern.Pattern, out _))
            throw new InvalidOperationException("This target cannot be clicked safely. Please click it yourself.");
        var name = element.Current.Name;
        if (string.IsNullOrWhiteSpace(name))
            throw new InvalidOperationException("The target has no accessible name. Please click it yourself.");
        runtimeId = element.GetRuntimeId();
        targetX = x; targetY = y; targetName = name;
        expires = DateTime.UtcNow.AddSeconds(30);
        return new { name, type = element.Current.LocalizedControlType };
    }

    internal static bool Invoke()
    {
        var expected = runtimeId;
        runtimeId = null;
        if (expected == null || DateTime.UtcNow > expires)
            throw new InvalidOperationException("The click request expired. Ask again.");
        var element = AutomationElement.FromPoint(new System.Windows.Point(targetX, targetY));
        if (element == null || !element.GetRuntimeId().SequenceEqual(expected) ||
            element.Current.Name != targetName || !element.Current.IsEnabled || element.Current.IsOffscreen ||
            !element.TryGetCurrentPattern(InvokePattern.Pattern, out var pattern))
            throw new InvalidOperationException("The target changed. Ask again before clicking.");
        ((InvokePattern)pattern).Invoke();
        return true;
    }

    internal static void Cancel() => runtimeId = null;
}
