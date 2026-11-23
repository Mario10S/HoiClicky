using System.Text.RegularExpressions;
using System.Windows.Automation;

internal static class NamedWindow {
 internal static object Close(string name) {
  if (!Regex.IsMatch(name, @"^[\w][\w.\-]{1,39}$")) throw new InvalidOperationException("Specify one application name.");
  var match = new Regex(@"(?<![\p{L}\p{N}])" + Regex.Escape(name) + @"(?![\p{L}\p{N}])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
  var candidates = AutomationElement.RootElement.FindAll(TreeScope.Children, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window))
   .Cast<AutomationElement>().Where(e => !e.Current.IsOffscreen && e.Current.IsEnabled && match.IsMatch(e.Current.Name ?? "")).ToArray();
  if (candidates.Length != 1) throw new InvalidOperationException(candidates.Length == 0 ? "No visible window with that name was found." : "More than one visible window matches that name; be more specific.");
  var window = candidates[0]; var title = window.Current.Name;
  if (!window.TryGetCurrentPattern(WindowPattern.Pattern, out var pattern)) throw new InvalidOperationException("This window cannot be closed through accessibility.");
  ((WindowPattern)pattern).Close();
  return new { name = title };
 }
}
