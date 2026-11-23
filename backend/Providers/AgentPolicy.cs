using System.IO;
using System.Text.Json;
namespace HoiClicky.Providers;

internal enum AgentDecision{Allow,Ask,Deny}
// Approval: "ask" (confirm every change), "files" (workspace file edits run freely), "auto" (no confirmations).
internal sealed record AgentSettings(string Approval,IReadOnlyCollection<string> Tools,string Workspace,bool ScreenAllowed);

// Decides what happens when Claude Code asks to use a tool. Pure so it can be tested without a live agent.
internal static class AgentPolicy {
 public static readonly string[] Groups=["files","commands","desktop","web"];
 public static readonly string[] Approvals=["ask","files","auto"];
 public const string DesktopPrefix="mcp__desktop__";

 public static string? Group(string tool)=>tool switch{
  "Read" or "Glob" or "Grep" or "Edit" or "Write" or "NotebookEdit"=>"files",
  "Bash" or "PowerShell"=>"commands",
  "WebSearch" or "WebFetch"=>"web",
  _ when tool.StartsWith(DesktopPrefix,StringComparison.Ordinal)=>"desktop",
  _=>null};

 // Built-in Claude Code tools to enable for the chosen groups. Desktop tools come from HoiClicky's MCP server.
 public static string CliTools(IReadOnlyCollection<string> groups){
  var tools=new List<string>();
  if(groups.Contains("files"))tools.AddRange(["Read","Glob","Grep","Edit","Write"]);
  if(groups.Contains("commands"))tools.AddRange(["PowerShell","Bash"]);
  if(groups.Contains("web"))tools.AddRange(["WebSearch","WebFetch"]);
  return string.Join(",",tools);
 }

 public static (AgentDecision Decision,string? Reason) Decide(string tool,JsonElement input,AgentSettings settings){
  var group=Group(tool);
  if(group is null)return (AgentDecision.Deny,"HoiClicky does not allow this tool.");
  if(!settings.Tools.Contains(group))return (AgentDecision.Deny,GroupLabel(group)+" are turned off in HoiClicky settings.");
  if(tool==DesktopPrefix+"screenshot")return settings.ScreenAllowed?(AgentDecision.Allow,null):(AgentDecision.Deny,"Screen access is turned off in HoiClicky settings.");
  if(settings.Approval=="auto")return (AgentDecision.Allow,null);
  var path=PathOf(input);
  var inside=path is null||Inside(path,settings.Workspace);
  if(tool is "Read" or "Glob" or "Grep" or "WebSearch" or "WebFetch")return inside?(AgentDecision.Allow,null):(AgentDecision.Ask,null);
  if(settings.Approval=="files"&&tool is "Edit" or "Write" or "NotebookEdit"&&path is not null&&inside)return (AgentDecision.Allow,null);
  return (AgentDecision.Ask,null);
 }

 public static string GroupLabel(string group)=>group switch{"files"=>"File tools","commands"=>"Commands","desktop"=>"Mouse and keyboard tools","web"=>"Web tools",_=>"These tools"};

 public static string? PathOf(JsonElement input){
  if(input.ValueKind!=JsonValueKind.Object)return null;
  foreach(var name in new[]{"file_path","notebook_path","path"})if(input.TryGetProperty(name,out var value)&&value.ValueKind==JsonValueKind.String&&!string.IsNullOrWhiteSpace(value.GetString()))return value.GetString();
  return null;
 }

 public static bool Inside(string path,string workspace){
  if(string.IsNullOrWhiteSpace(workspace))return false;
  try{
   var root=Path.GetFullPath(workspace).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);
   var full=Path.GetFullPath(Path.IsPathRooted(path)?path:Path.Combine(root,path)).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);
   return full.Equals(root,StringComparison.OrdinalIgnoreCase)||full.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);
  }catch(Exception ex) when(ex is ArgumentException or NotSupportedException or PathTooLongException){return false;}
 }
}
