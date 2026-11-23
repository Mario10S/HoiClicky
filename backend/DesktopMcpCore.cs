using System.IO;
using System.Text.Json;
namespace HoiClicky;

// Where the last agent screenshot came from, so clicks in screenshot pixels map back to the real screen.
internal sealed record ScreenMapping(int Left,int Top,int Width,int Height,int ImageWidth,int ImageHeight);
// Monitors are numbered 1..n: the primary monitor first, the rest from left to right.
internal sealed record MonitorInfo(int Number,bool Primary,int Left,int Top,int Width,int Height);
// One visible top-level window; Tabs lists browser tab titles when they could be read.
internal sealed record WindowInfo(long Id,string Title,string Process,int Monitor,bool Minimized,string[] Tabs,int ActiveTab);

// Platform-independent parts of the desktop MCP server: tool list, coordinate mapping and key parsing.
internal static class DesktopMcpCore {
 public const int MaxImageWidth=1280;
 public const int MaxAllMonitorsWidth=1568;
 public static readonly string StatePath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"HoiClicky","agent-screen.json");

 public static object Tools()=>new{tools=new object[]{
  Tool("screenshot","Capture the screen. By default the monitor under the mouse pointer; pass monitor as a number from list_windows, or \"all\" for every monitor at once (smaller detail). Always call this before clicking, and again after an action to check the result. Coordinates for other tools are pixels in the latest screenshot.",new{monitor=new{type="string",description="Monitor number such as 1 or 2, or all. Default: monitor under the pointer"}}),
  Tool("list_windows","List all open windows with their monitor, and the tab titles of open browser windows. Use the window id with focus_window, activate_tab and close_window.",new{}),
  Tool("focus_window","Bring a window to the front (restores it when minimized).",new{id=Num("Window id from list_windows")},"id"),
  Tool("activate_tab","Switch a browser window to one of its tabs and bring it to the front.",new{id=Num("Window id from list_windows"),tab=new{type="string",description="Tab title (or part of it) or its 1-based position"}},"id","tab"),
  Tool("close_window","Ask a window to close, as if its close button was pressed. Apps may still ask to save.",new{id=Num("Window id from list_windows")},"id"),
  Tool("click","Click at a point in the latest screenshot.",new{x=Num("X in screenshot pixels"),y=Num("Y in screenshot pixels"),button=new{type="string",@enum=new[]{"left","right"},description="Mouse button, default left"},@double=new{type="boolean",description="Double-click"}},"x","y"),
  Tool("type_text","Type text into the focused window.",new{text=new{type="string",description="Text to type"}},"text"),
  Tool("press_keys","Press a key or shortcut, for example enter, ctrl+s or alt+tab.",new{keys=new{type="string",description="Keys joined with +"}},"keys"),
  Tool("scroll","Scroll the mouse wheel at a point in the latest screenshot. Positive amount scrolls up.",new{x=Num("X in screenshot pixels"),y=Num("Y in screenshot pixels"),amount=Num("Wheel notches, positive up, negative down")},"x","y","amount"),
 }};
 static object Num(string description)=>new{type="number",description};
 static object Tool(string name,string description,object properties,params string[] required)=>new{name,description,inputSchema=new{type="object",properties,required}};

 public static (int Width,int Height) ImageSize(int width,int height,int max=MaxImageWidth){var longest=Math.Max(width,height);if(longest<=max)return (width,height);var scale=(double)max/longest;return (Math.Max(1,(int)Math.Round(width*scale)),Math.Max(1,(int)Math.Round(height*scale)));}

 public static List<MonitorInfo> Number(IEnumerable<(bool Primary,int Left,int Top,int Width,int Height)> screens)=>screens.OrderByDescending(s=>s.Primary).ThenBy(s=>s.Left).ThenBy(s=>s.Top).Select((s,i)=>new MonitorInfo(i+1,s.Primary,s.Left,s.Top,s.Width,s.Height)).ToList();
 public static string Describe(MonitorInfo m)=>$"monitor {m.Number}{(m.Primary?" (primary)":"")}: {m.Width}x{m.Height}{(m.Height>m.Width?" portrait":"")} at {m.Left},{m.Top}";

 // Compact text for Claude: monitors, then each window with its tabs.
 public static string Format(IReadOnlyList<MonitorInfo> monitors,IReadOnlyList<WindowInfo> windows,int maxTabs=40){
  var text=new System.Text.StringBuilder();
  text.AppendLine("Monitors: "+string.Join("; ",monitors.Select(Describe)));
  if(windows.Count==0){text.Append("No open windows were found.");return text.ToString();}
  text.AppendLine("Open windows:");
  foreach(var w in windows){
   text.Append($"- [id {w.Id}] {Clip(w.Title,120)} ({w.Process}, monitor {w.Monitor}{(w.Minimized?", minimized":"")})");
   if(w.Tabs.Length>0){text.AppendLine($" with {w.Tabs.Length} tab{(w.Tabs.Length==1?"":"s")}:");for(var i=0;i<Math.Min(w.Tabs.Length,maxTabs);i++)text.AppendLine($"    {i+1}. {Clip(w.Tabs[i],100)}{(i==w.ActiveTab?" (active)":"")}");if(w.Tabs.Length>maxTabs)text.AppendLine($"    … {w.Tabs.Length-maxTabs} more");}
   else text.AppendLine();
  }
  return text.ToString().TrimEnd();
 }
 static string Clip(string value,int max){value=value.Replace("\r","").Replace("\n"," ").Trim();return value.Length>max?value[..(max-1)]+"…":value;}

 // Pick a tab by 1-based position or by (partial) title; exact title wins over partial matches.
 public static int MatchTab(IReadOnlyList<string> tabs,string query){
  query=query.Trim();if(query.Length==0)throw new InvalidOperationException("Name the tab to open.");
  if(int.TryParse(query,out var position)){if(position<1||position>tabs.Count)throw new InvalidOperationException($"This window has {tabs.Count} tabs.");return position-1;}
  var exact=tabs.Select((t,i)=>(t,i)).Where(x=>x.t.Equals(query,StringComparison.OrdinalIgnoreCase)).Select(x=>x.i).ToList();if(exact.Count>0)return exact[0];
  var partial=tabs.Select((t,i)=>(t,i)).Where(x=>x.t.Contains(query,StringComparison.OrdinalIgnoreCase)).Select(x=>x.i).ToList();
  if(partial.Count==1)return partial[0];
  throw new InvalidOperationException(partial.Count==0?$"No tab matches “{query}”.":$"{partial.Count} tabs match “{query}”; be more specific or use the tab number.");
 }

 public static (int X,int Y) ToScreen(double x,double y,ScreenMapping map){
  if(double.IsNaN(x)||double.IsNaN(y)||x<0||y<0||x>=map.ImageWidth||y>=map.ImageHeight)throw new InvalidOperationException($"The point {x},{y} is outside the latest screenshot ({map.ImageWidth}x{map.ImageHeight}). Take a new screenshot.");
  return (map.Left+(int)Math.Round(x*map.Width/map.ImageWidth),map.Top+(int)Math.Round(y*map.Height/map.ImageHeight));
 }

 public static void SaveMapping(ScreenMapping map){Directory.CreateDirectory(Path.GetDirectoryName(StatePath)!);File.WriteAllText(StatePath,JsonSerializer.Serialize(map));}
 public static ScreenMapping? LoadMapping(){try{return File.Exists(StatePath)?JsonSerializer.Deserialize<ScreenMapping>(File.ReadAllText(StatePath)):null;}catch{return null;}}

 static readonly Dictionary<string,ushort> Named=new(StringComparer.OrdinalIgnoreCase){
  ["ctrl"]=0x11,["control"]=0x11,["shift"]=0x10,["alt"]=0x12,["win"]=0x5B,["windows"]=0x5B,["enter"]=0x0D,["return"]=0x0D,["tab"]=0x09,["esc"]=0x1B,["escape"]=0x1B,["backspace"]=0x08,["delete"]=0x2E,["del"]=0x2E,
  ["space"]=0x20,["up"]=0x26,["down"]=0x28,["left"]=0x25,["right"]=0x27,["home"]=0x24,["end"]=0x23,["pageup"]=0x21,["pagedown"]=0x22,["insert"]=0x2D};
 public static ushort[] ParseKeys(string keys){
  var parts=keys.Split('+',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);
  if(parts.Length is 0 or >5)throw new InvalidOperationException("Name one to five keys joined with +, for example ctrl+s.");
  return parts.Select(part=>{
   if(Named.TryGetValue(part,out var vk))return vk;
   if(part.Length==1&&char.IsAsciiLetterOrDigit(part[0]))return (ushort)char.ToUpperInvariant(part[0]);
   if((part[0]=='f'||part[0]=='F')&&int.TryParse(part[1..],out var f)&&f is >=1 and <=12)return (ushort)(0x6F+f);
   throw new InvalidOperationException($"Unknown key \"{part}\".");
  }).ToArray();
 }
}
