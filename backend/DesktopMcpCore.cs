using System.IO;
using System.Text.Json;
namespace HoiClicky;

// Where the last agent screenshot came from, so clicks in screenshot pixels map back to the real screen.
internal sealed record ScreenMapping(int Left,int Top,int Width,int Height,int ImageWidth,int ImageHeight);

// Platform-independent parts of the desktop MCP server: tool list, coordinate mapping and key parsing.
internal static class DesktopMcpCore {
 public const int MaxImageWidth=1280;
 public static readonly string StatePath=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"HoiClicky","agent-screen.json");

 public static object Tools()=>new{tools=new object[]{
  Tool("screenshot","Capture the monitor under the mouse pointer. Always call this before clicking, and again after an action to check the result. Coordinates for other tools are pixels in the latest screenshot.",new{}),
  Tool("click","Click at a point in the latest screenshot.",new{x=Num("X in screenshot pixels"),y=Num("Y in screenshot pixels"),button=new{type="string",@enum=new[]{"left","right"},description="Mouse button, default left"},@double=new{type="boolean",description="Double-click"}},"x","y"),
  Tool("type_text","Type text into the focused window.",new{text=new{type="string",description="Text to type"}},"text"),
  Tool("press_keys","Press a key or shortcut, for example enter, ctrl+s or alt+tab.",new{keys=new{type="string",description="Keys joined with +"}},"keys"),
  Tool("scroll","Scroll the mouse wheel at a point in the latest screenshot. Positive amount scrolls up.",new{x=Num("X in screenshot pixels"),y=Num("Y in screenshot pixels"),amount=Num("Wheel notches, positive up, negative down")},"x","y","amount"),
 }};
 static object Num(string description)=>new{type="number",description};
 static object Tool(string name,string description,object properties,params string[] required)=>new{name,description,inputSchema=new{type="object",properties,required}};

 public static (int Width,int Height) ImageSize(int width,int height){if(width<=MaxImageWidth)return (width,height);var scale=(double)MaxImageWidth/width;return (MaxImageWidth,Math.Max(1,(int)Math.Round(height*scale)));}

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
