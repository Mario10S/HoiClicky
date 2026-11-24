using System.Diagnostics;
using System.IO;
using System.Text;
namespace HoiClicky;
internal sealed class VoiceInput : IDisposable {
 private Process? process;
 public async Task ListenAsync(Action<string,string> update) {
  var project = new DirectoryInfo(AppContext.BaseDirectory);
  while(project is not null && !Directory.Exists(Path.Combine(project.FullName,"speech"))) project=project.Parent;
  var speechRoot=project is null ? "" : Path.Combine(project.FullName,"speech");
  var python=Path.Combine(speechRoot,".venv","Scripts","python.exe");
  var useWhisper=File.Exists(python)&&Directory.Exists(Path.Combine(speechRoot,"model"));
  var start = new ProcessStartInfo(useWhisper?python:Path.Combine(AppContext.BaseDirectory,"SpeechHost.exe")) { UseShellExecute=false, CreateNoWindow=true, RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true };
  if(useWhisper) { start.ArgumentList.Add("-u");start.ArgumentList.Add(Path.Combine(speechRoot,"recognize.py"));start.Environment["HOICLICKY_SPEECH_LANGUAGES"]=string.Join(",",LocalSettings.Current.SpeechLanguages);start.Environment["HOICLICKY_MIC_GAIN"]=LocalSettings.Current.MicGain.ToString("0.##",System.Globalization.CultureInfo.InvariantCulture); }
  else update("loading","Using legacy Windows recognition. Run speech/setup.ps1 for improved local Whisper recognition.");
  using var child = Process.Start(start) ?? throw new InvalidOperationException("Windows speech could not start.");
  process=child;
  using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(4));
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
