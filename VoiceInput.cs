using System.Diagnostics;
using System.IO;
using System.Text;
namespace HoiClicky;
internal sealed class VoiceInput : IDisposable {
 private Process? process;
 public async Task ListenAsync(Action<string,string> update) {
  var start = new ProcessStartInfo(Path.Combine(AppContext.BaseDirectory,"SpeechHost.exe")) { UseShellExecute=false, CreateNoWindow=true, RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true };
  using var child = Process.Start(start) ?? throw new InvalidOperationException("Windows speech could not start.");
  process=child;
  using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(60));
  using var registration=timeout.Token.Register(()=> { try { child.Kill(); } catch {} });
  try {
   string? line;
   while((line=await child.StandardOutput.ReadLineAsync())!=null) {
    var parts=line.Split(':',2); if(parts.Length!=2) continue;
    update(parts[0].Trim('\uFEFF'),Encoding.UTF8.GetString(Convert.FromBase64String(parts[1])));
   }
   await child.WaitForExitAsync();
  } finally { process=null; }
 }
 public void Stop() { try { process?.StandardInput.WriteLine("stop"); process?.StandardInput.Flush(); } catch {} }
 public void Dispose() { try { if(process is {HasExited:false}) process.Kill(); } catch {} }
}
