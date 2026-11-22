using System.Runtime.InteropServices;
namespace HoiClicky;
internal sealed class HoldKeyMonitor : IDisposable {
 readonly System.Threading.Timer timer; readonly Action<bool> changed; bool held;
 public HoldKeyMonitor(Action<bool> changed){this.changed=changed;timer=new System.Threading.Timer(_=>Poll(),null,0,8);}
 void Poll(){var s=LocalSettings.Current;var down=s.AllowMicrophone&&(GetAsyncKeyState(s.TalkKey1)&0x8000)!=0&&(GetAsyncKeyState(s.TalkKey2)&0x8000)!=0;if(down==held)return;held=down;changed(down);}
 public void Dispose()=>timer.Dispose();
 [DllImport("user32.dll")]static extern short GetAsyncKeyState(int key);
}
