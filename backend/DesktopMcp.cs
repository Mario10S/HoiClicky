using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;
namespace HoiClicky;

// Minimal MCP stdio server started by Claude Code in agent mode (HoiClicky.Service --mcp-desktop).
// Every call reaches this process only after HoiClicky's approval rules allowed it.
internal static class DesktopMcp {
 public static async Task RunAsync(){
  SetProcessDPIAware();
  var stdout=Console.OpenStandardOutput();
  string? line;
  while((line=await Console.In.ReadLineAsync())is not null){
   if(string.IsNullOrWhiteSpace(line))continue;
   JsonElement msg;try{msg=JsonDocument.Parse(line).RootElement.Clone();}catch{continue;}
   if(!msg.TryGetProperty("id",out var id))continue; // notifications need no reply
   var method=msg.TryGetProperty("method",out var m)?m.GetString():null;
   object reply;
   try{
    object result=method switch{
     "initialize"=>new{protocolVersion=msg.GetProperty("params").TryGetProperty("protocolVersion",out var v)?v.GetString():"2025-06-18",capabilities=new{tools=new{}},serverInfo=new{name="hoiclicky-desktop",version="1.0"}},
     "tools/list"=>DesktopMcpCore.Tools(),
     "tools/call"=>Call(msg.GetProperty("params")),
     "ping"=>new{},
     _=>throw new MissingMethodException(method)};
    reply=new{jsonrpc="2.0",id,result};
   }catch(MissingMethodException){reply=new{jsonrpc="2.0",id,error=new{code=-32601,message="Method not found"}};}
   var bytes=JsonSerializer.SerializeToUtf8Bytes(reply);await stdout.WriteAsync(bytes);await stdout.WriteAsync("\n"u8.ToArray());await stdout.FlushAsync();
  }
 }

 static object Call(JsonElement p){
  var name=p.GetProperty("name").GetString();var args=p.TryGetProperty("arguments",out var a)?a:default;
  try{
   switch(name){
    case "screenshot":{var which=args.ValueKind==JsonValueKind.Object&&args.TryGetProperty("monitor",out var mon)?(mon.ValueKind==JsonValueKind.Number?mon.GetInt32().ToString():mon.GetString()):null;var (jpeg,map,label)=Capture(which);return new{content=new object[]{new{type="image",data=Convert.ToBase64String(jpeg),mimeType="image/jpeg"},new{type="text",text=$"Screenshot of {label}, {map.ImageWidth}x{map.ImageHeight} pixels. Use these pixel coordinates for click and scroll. Monitors: {string.Join("; ",OpenWindows.Monitors().Select(DesktopMcpCore.Describe))}."}}};}
    case "list_windows":return Text(OpenWindows.Summary());
    case "focus_window":return Text(OpenWindows.Focus(Id(args)));
    case "activate_tab":{var tab=args.GetProperty("tab");return Text(OpenWindows.ActivateTab(Id(args),tab.ValueKind==JsonValueKind.Number?tab.GetInt32().ToString():tab.GetString()??""));}
    case "close_window":return Text(OpenWindows.Close(Id(args)));
    case "click":{var (x,y)=Target(args);var right=args.TryGetProperty("button",out var b)&&b.GetString()=="right";var twice=args.TryGetProperty("double",out var d)&&d.ValueKind==JsonValueKind.True;Click(x,y,right,twice);return Text($"{(twice?"Double-clicked":right?"Right-clicked":"Clicked")} at screen {x},{y}. Take a screenshot to check the result.");}
    case "scroll":{var (x,y)=Target(args);var amount=(int)Math.Clamp(args.GetProperty("amount").GetDouble(),-20,20);SetCursorPos(x,y);Send(Mouse(0x0800,amount*120));return Text($"Scrolled {amount} at screen {x},{y}.");}
    case "type_text":{var text=args.GetProperty("text").GetString()??"";if(text.Length>5000)throw new InvalidOperationException("Type at most 5000 characters at once.");TypeText(text);return Text($"Typed {text.Length} characters.");}
    case "press_keys":{var keys=args.GetProperty("keys").GetString()??"";var codes=DesktopMcpCore.ParseKeys(keys);var inputs=codes.Select(c=>Key(c,false)).Concat(codes.Reverse().Select(c=>Key(c,true))).ToArray();Send(inputs);return Text($"Pressed {keys}.");}
    default:throw new InvalidOperationException("Unknown tool "+name+".");
   }
  }catch(Exception ex) when(ex is InvalidOperationException or KeyNotFoundException or FormatException){return new{content=new object[]{new{type="text",text=ex.Message}},isError=true};}
 }
 static object Text(string text)=>new{content=new object[]{new{type="text",text}}};
 static long Id(JsonElement args)=>(long)args.GetProperty("id").GetDouble();

 static (int X,int Y) Target(JsonElement args){
  var map=DesktopMcpCore.LoadMapping()??throw new InvalidOperationException("Take a screenshot first so HoiClicky knows where to click.");
  return DesktopMcpCore.ToScreen(args.GetProperty("x").GetDouble(),args.GetProperty("y").GetDouble(),map);
 }

 // which: null = monitor under the pointer, "all" = every monitor, "2" = monitor number from list_windows.
 static (byte[] Jpeg,ScreenMapping Map,string Label) Capture(string? which){
  Rectangle bounds;string label;var max=DesktopMcpCore.MaxImageWidth;
  if(string.Equals(which,"all",StringComparison.OrdinalIgnoreCase)){bounds=SystemInformation.VirtualScreen;label="all monitors";max=DesktopMcpCore.MaxAllMonitorsWidth;}
  else if(!string.IsNullOrWhiteSpace(which)){
   var monitors=OpenWindows.Monitors();
   if(!int.TryParse(which,out var number)||number<1||number>monitors.Count)throw new InvalidOperationException($"Choose a monitor from 1 to {monitors.Count}, or all.");
   var m=monitors[number-1];bounds=new Rectangle(m.Left,m.Top,m.Width,m.Height);label=DesktopMcpCore.Describe(m);
  }
  else{GetCursorPos(out var cursor);bounds=Screen.FromPoint(new Point(cursor.X,cursor.Y)).Bounds;var monitors=OpenWindows.Monitors();label=monitors.FirstOrDefault(m=>m.Left==bounds.Left&&m.Top==bounds.Top) is {} m?DesktopMcpCore.Describe(m):"the monitor under the pointer";}
  var (w,h)=DesktopMcpCore.ImageSize(bounds.Width,bounds.Height,max);
  using var full=new Bitmap(bounds.Width,bounds.Height,PixelFormat.Format24bppRgb);
  using(var g=Graphics.FromImage(full))g.CopyFromScreen(bounds.Left,bounds.Top,0,0,bounds.Size,CopyPixelOperation.SourceCopy);
  using var scaled=new Bitmap(w,h,PixelFormat.Format24bppRgb);
  using(var g=Graphics.FromImage(scaled)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(full,0,0,w,h);}
  using var output=new MemoryStream();var encoder=ImageCodecInfo.GetImageEncoders().First(x=>x.MimeType=="image/jpeg");
  using var parameters=new EncoderParameters(1);parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,80L);
  scaled.Save(output,encoder,parameters);
  var map=new ScreenMapping(bounds.Left,bounds.Top,bounds.Width,bounds.Height,w,h);DesktopMcpCore.SaveMapping(map);
  return (output.ToArray(),map,label);
 }

 static void Click(int x,int y,bool right,bool twice){
  SetCursorPos(x,y);Thread.Sleep(40);
  uint down=right?0x0008u:0x0002u,up=right?0x0010u:0x0004u;
  for(var i=0;i<(twice?2:1);i++){Send(Mouse(down,0),Mouse(up,0));Thread.Sleep(60);}
 }
 static void TypeText(string text){
  foreach(var ch in text.Replace("\r\n","\n")){
   if(ch=='\n'){Send(Key(0x0D,false),Key(0x0D,true));continue;}
   Send(Unicode(ch,false),Unicode(ch,true));
  }
 }

 static void Send(params INPUT[] inputs){if(SendInput((uint)inputs.Length,inputs,Marshal.SizeOf<INPUT>())!=inputs.Length)throw new InvalidOperationException("Windows blocked the input. The target window may be running as administrator.");}
 static INPUT Mouse(uint flags,int data)=>new(){type=0,u=new InputUnion{mi=new MOUSEINPUT{dwFlags=flags,mouseData=data}}};
 static INPUT Key(ushort vk,bool up)=>new(){type=1,u=new InputUnion{ki=new KEYBDINPUT{wVk=vk,dwFlags=up?0x0002u:0}}};
 static INPUT Unicode(char ch,bool up)=>new(){type=1,u=new InputUnion{ki=new KEYBDINPUT{wScan=ch,dwFlags=0x0004u|(up?0x0002u:0)}}};

 [StructLayout(LayoutKind.Sequential)] struct INPUT{public uint type;public InputUnion u;}
 [StructLayout(LayoutKind.Explicit)] struct InputUnion{[FieldOffset(0)]public MOUSEINPUT mi;[FieldOffset(0)]public KEYBDINPUT ki;}
 [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT{public int dx;public int dy;public int mouseData;public uint dwFlags;public uint time;public IntPtr dwExtraInfo;}
 [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT{public ushort wVk;public ushort wScan;public uint dwFlags;public uint time;public IntPtr dwExtraInfo;}
 [StructLayout(LayoutKind.Sequential)] struct POINT{public int X;public int Y;}
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count,INPUT[] inputs,int size);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
}
