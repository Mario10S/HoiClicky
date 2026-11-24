using System.Diagnostics;
using System.IO;
using System.Text;
namespace HoiClicky;

// Runs speech/wake.py while the user has the "Hey Clicky" wake word turned on.
// The Python process keeps audio in memory and only reports the wake word and the transcribed question.
internal sealed class WakeListener:IDisposable {
 readonly Action<string,string> onEvent;readonly object sync=new();Process? process;
 public WakeListener(Action<string,string> onEvent){this.onEvent=onEvent;}
 public bool Running{get{lock(sync)return process is {HasExited:false};}}

 public static (string Python,string Script)? Locate(){
  var dir=new DirectoryInfo(AppContext.BaseDirectory);
  while(dir is not null&&!Directory.Exists(Path.Combine(dir.FullName,"speech")))dir=dir.Parent;
  if(dir is null)return null;
  var speech=Path.Combine(dir.FullName,"speech");var python=Path.Combine(speech,".venv","Scripts","python.exe");var script=Path.Combine(speech,"wake.py");
  return File.Exists(python)&&File.Exists(script)&&Directory.Exists(Path.Combine(speech,"model"))?(python,script):null;
 }
 public static bool Available=>Locate() is not null;

 // Starts or stops the listener so it matches the settings.
 public void Sync(bool wanted){if(wanted)Start();else Stop();}

 void Start(){
  lock(sync){
   if(process is {HasExited:false})return;
   var found=Locate();if(found is null){onEvent("error","Hands-free listening needs local Whisper. Run speech/setup.ps1 first.");return;}
   var start=new ProcessStartInfo(found.Value.Python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
   start.ArgumentList.Add("-u");start.ArgumentList.Add(found.Value.Script);
   start.Environment["HOICLICKY_SPEECH_LANGUAGES"]=string.Join(",",LocalSettings.Current.SpeechLanguages);
   start.Environment["HOICLICKY_MIC_GAIN"]=MicTest.Gain(LocalSettings.Current.MicGain);
   start.Environment["HOICLICKY_WAKE_WORDS"]=string.Join(",",LocalSettings.Current.WakeWords);
   var child=Process.Start(start);if(child is null){onEvent("error","Hands-free listening could not start.");return;}
   process=child;_=child.StandardError.ReadToEndAsync();
   _=Task.Run(async()=>{
    try{string? line;while((line=await child.StandardOutput.ReadLineAsync())!=null){var parts=line.Split(':',2);if(parts.Length!=2)continue;try{onEvent(parts[0].Trim('﻿'),Encoding.UTF8.GetString(Convert.FromBase64String(parts[1])));}catch(FormatException){}}}
    catch{}finally{lock(sync){if(process==child)process=null;}onEvent("stopped","");}
   });
  }
 }
 void Send(string command){lock(sync){try{if(process is {HasExited:false}){process.StandardInput.WriteLine(command);process.StandardInput.Flush();}}catch{}}}
 public void Pause()=>Send("pause");
 public void Resume()=>Send("resume");
 public void SetGain(double gain)=>Send("gain "+MicTest.Gain(gain));
 public void Stop(){
  Process? child;lock(sync){child=process;process=null;}
  if(child is null)return;
  try{child.StandardInput.WriteLine("quit");child.StandardInput.Flush();if(!child.WaitForExit(1500))child.Kill(true);}catch{try{child.Kill(true);}catch{}}
  child.Dispose();
 }
 public void Dispose()=>Stop();
}
