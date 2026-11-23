using System.Diagnostics;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using Accessibility;
using System.Windows.Forms;
namespace HoiClicky;

// Reads the open windows (and browser tabs through MSAA, which Chromium browsers and Firefox expose even when
// their UI Automation tree is asleep) and focuses, switches tabs or closes them.
internal static class OpenWindows {
 static readonly HashSet<string> Browsers=new(StringComparer.OrdinalIgnoreCase){"chrome","msedge","firefox","brave","opera","vivaldi","arc"};

 public static List<MonitorInfo> Monitors()=>DesktopMcpCore.Number(Screen.AllScreens.Select(s=>(s.Primary,s.Bounds.Left,s.Bounds.Top,s.Bounds.Width,s.Bounds.Height)));

 public static int MonitorOf(Rectangle bounds,IReadOnlyList<MonitorInfo> monitors){
  var screen=Screen.FromRectangle(bounds).Bounds;
  return monitors.FirstOrDefault(m=>m.Left==screen.Left&&m.Top==screen.Top)?.Number??1;
 }

 public static List<WindowInfo> List(bool tabs=true){
  var monitors=Monitors();var handles=new List<IntPtr>();
  EnumWindows((hwnd,_)=>{if(IsCandidate(hwnd))handles.Add(hwnd);return true;},IntPtr.Zero);
  var result=new List<WindowInfo>();
  foreach(var hwnd in handles){
   var title=Title(hwnd);var process=ProcessName(hwnd);
   if(process.Equals("electron",StringComparison.OrdinalIgnoreCase)&&title.StartsWith("HoiClicky",StringComparison.OrdinalIgnoreCase))continue; // HoiClicky itself
   GetWindowRect(hwnd,out var r);var minimized=IsIconic(hwnd);
   var (tabTitles,active)=tabs&&Browsers.Contains(process)?ReadTabs(hwnd):([],-1);
   result.Add(new WindowInfo(hwnd.ToInt64(),title,process,MonitorOf(Rectangle.FromLTRB(r.Left,r.Top,r.Right,r.Bottom),monitors),minimized,tabTitles,active));
  }
  return result;
 }

 public static string Summary()=>DesktopMcpCore.Format(Monitors(),List());

 const int RolePageTab=0x25,StateSelected=0x2;
 static (string[] Tabs,int Active) ReadTabs(IntPtr hwnd){
  // Accessibility trees can be slow on busy windows; give each browser window a short budget.
  var work=Task.Run(()=>{var tabs=FindTabs(hwnd);var active=tabs.FindIndex(t=>t.Selected);return (tabs.Select(t=>t.Name).ToArray(),active);});
  try{return work.Wait(TimeSpan.FromSeconds(2))?work.Result:([],-1);}catch{return ([],-1);}
 }
 sealed record Tab(string Name,bool Selected,IAccessible Node);
 static List<Tab> FindTabs(IntPtr hwnd){
  var iid=typeof(IAccessible).GUID;var tabs=new List<Tab>();
  if(AccessibleObjectFromWindow(hwnd,0,ref iid,out var root)!=0||root is null)return tabs;
  var visited=0;Walk(root,0);return tabs;
  void Walk(IAccessible node,int depth){
   if(depth>14||visited>4000)return;
   int count;try{count=node.accChildCount;}catch{return;}if(count<=0)return;
   var children=new object[count];if(AccessibleChildren(node,0,count,children,out var got)!=0)return;
   for(var i=0;i<got;i++){
    if(children[i] is not IAccessible child)continue;visited++;
    try{if(child.get_accRole(0) is int role&&role==RolePageTab){var name=child.get_accName(0);if(!string.IsNullOrWhiteSpace(name)){var state=child.get_accState(0) is int s?s:0;tabs.Add(new Tab(name.Trim(),(state&StateSelected)!=0,child));}continue;}}catch{}
    Walk(child,depth+1);
   }
  }
 }

 static IntPtr Handle(long id){var hwnd=new IntPtr(id);if(!IsWindow(hwnd)||!IsCandidate(hwnd))throw new InvalidOperationException("That window is gone. Call list_windows again.");return hwnd;}

 public static string Focus(long id){
  var hwnd=Handle(id);
  if(IsIconic(hwnd))ShowWindow(hwnd,9);
  // Windows only lets the foreground app hand over focus; a synthetic Alt press unlocks SetForegroundWindow.
  keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);
  SetForegroundWindow(hwnd);
  return "Brought “"+Title(hwnd)+"” to the front.";
 }

 public static string ActivateTab(long id,string query){
  var hwnd=Handle(id);
  var tabs=FindTabs(hwnd);
  if(tabs.Count==0)throw new InvalidOperationException("No tabs could be read in this window.");
  var tab=tabs[DesktopMcpCore.MatchTab(tabs.Select(t=>t.Name).ToArray(),query)];
  Focus(id);
  try{tab.Node.accDoDefaultAction(0);}catch(COMException){throw new InvalidOperationException("This tab cannot be switched through accessibility. Click it instead.");}
  return "Switched to the tab “"+tab.Name+"”.";
 }

 public static string Close(long id){var hwnd=Handle(id);var title=Title(hwnd);PostMessage(hwnd,0x0010,IntPtr.Zero,IntPtr.Zero);return "Asked “"+title+"” to close. It may still ask to save.";}

 static bool IsCandidate(IntPtr hwnd){
  if(!IsWindowVisible(hwnd)||GetWindowTextLength(hwnd)==0||GetWindow(hwnd,4)!=IntPtr.Zero)return false; // owned windows are dialogs of another window
  var ex=GetWindowLong(hwnd,-20);if((ex&0x80)!=0)return false; // tool windows
  return DwmGetWindowAttribute(hwnd,14,out int cloaked,sizeof(int))!=0||cloaked==0; // cloaked = hidden UWP or other virtual desktop
 }
 static string Title(IntPtr hwnd){var text=new StringBuilder(GetWindowTextLength(hwnd)+1);GetWindowText(hwnd,text,text.Capacity);return text.ToString();}
 static string ProcessName(IntPtr hwnd){GetWindowThreadProcessId(hwnd,out var pid);try{using var p=Process.GetProcessById((int)pid);return p.ProcessName;}catch{return "unknown";}}

 delegate bool EnumProc(IntPtr hwnd,IntPtr lParam);
 [StructLayout(LayoutKind.Sequential)] struct RECT{public int Left,Top,Right,Bottom;}
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback,IntPtr lParam);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd,uint cmd);
 [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd,int index);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int max);
 [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hwnd);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int cmd);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
 [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hwnd,int attribute,out int value,int size);
 [DllImport("oleacc.dll")] static extern int AccessibleObjectFromWindow(IntPtr hwnd,uint objectId,ref Guid iid,[MarshalAs(UnmanagedType.Interface)] out IAccessible? accessible);
 [DllImport("oleacc.dll")] static extern int AccessibleChildren(IAccessible parent,int start,int count,[Out] object[] children,out int obtained);
}
