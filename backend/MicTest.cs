using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
namespace HoiClicky;

// Runs speech/mictest.py while the user tests the microphone in Settings: live level,
// optional monitoring through the speakers or headphones, and live transcription. Nothing is stored.
internal sealed class MicTest:IDisposable {
 readonly Action<string,string> onEvent;readonly object sync=new();Process? process;
 public MicTest(Action<string,string> onEvent){this.onEvent=onEvent;}
 public bool Running{get{lock(sync)return process is {HasExited:false};}}
 public static string Gain(double gain)=>gain.ToString("0.##",CultureInfo.InvariantCulture);

 public void Start(bool monitor){
  lock(sync){
   if(process is {HasExited:false}){Send(monitor?"monitor on":"monitor off");return;}
   var found=WakeListener.Locate();if(found is null){onEvent("error","The microphone test needs local Whisper. Run speech/setup.ps1 first.");return;}
   var script=Path.Combine(Path.GetDirectoryName(found.Value.Script)!,"mictest.py");
   var start=new ProcessStartInfo(found.Value.Python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
   start.ArgumentList.Add("-u");start.ArgumentList.Add(script);
   start.Environment["HOICLICKY_SPEECH_LANGUAGES"]=string.Join(",",LocalSettings.Current.SpeechLanguages);
   start.Environment["HOICLICKY_MIC_GAIN"]=Gain(LocalSettings.Current.MicGain);
   start.Environment["HOICLICKY_MIC_MONITOR"]=monitor?"1":"0";
   var child=Process.Start(start);if(child is null){onEvent("error","The microphone test could not start.");return;}
   process=child;_=child.StandardError.ReadToEndAsync();
   _=Task.Run(async()=>{
    try{string? line;while((line=await child.StandardOutput.ReadLineAsync())!=null){var parts=line.Split(':',2);if(parts.Length!=2)continue;try{onEvent(parts[0].Trim('﻿'),Encoding.UTF8.GetString(Convert.FromBase64String(parts[1])));}catch(FormatException){}}}
    catch{}finally{lock(sync){if(process==child)process=null;}onEvent("stopped","");}
   });
  }
 }
 public void Send(string command){lock(sync){try{if(process is {HasExited:false}){process.StandardInput.WriteLine(command);process.StandardInput.Flush();}}catch{}}}
 public void SetGain(double gain)=>Send("gain "+Gain(gain));
 public void Stop(){
  Process? child;lock(sync){child=process;process=null;}
  if(child is null)return;
  try{child.StandardInput.WriteLine("quit");child.StandardInput.Flush();if(!child.WaitForExit(1500))child.Kill(true);}catch{try{child.Kill(true);}catch{}}
  child.Dispose();
 }
 public void Dispose()=>Stop();
}
