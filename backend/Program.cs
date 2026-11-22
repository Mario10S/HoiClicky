using System.Text.Json;
using HoiClicky;
class Program {
 static readonly object outputLock=new();
 static readonly SemaphoreSlim gate=new(1);
 static readonly VoiceInput voice=new();
 static void Emit(object value){lock(outputLock)Console.WriteLine(JsonSerializer.Serialize(value));}
 static object Status()=>new {connected=OAuthService.HasCredentials,account=OAuthService.HasCredentials?OAuthService.AccountLabel:null,screen=LocalSettings.Current.AllowScreenCapture,microphone=LocalSettings.Current.AllowMicrophone,model=LocalSettings.Current.Model};
 static async Task Main(){string? line;while((line=await Console.In.ReadLineAsync())!=null){try{var msg=JsonDocument.Parse(line).RootElement.Clone();_=Handle(msg);}catch{}}voice.Dispose();}
 static async Task Handle(JsonElement msg){var id=msg.GetProperty("id").GetInt32();var method=msg.GetProperty("method").GetString();
  if(method=="voiceStop"){voice.Stop();Emit(new{id,result=true});return;}
  if(!await gate.WaitAsync(0)){Emit(new{id,error="Finish the current operation first."});return;}
  try{object? result=null;
   switch(method){
    case "status":result=Status();break;
    case "connect":await OAuthService.SignInAsync();result=Status();break;
    case "disconnect":OAuthService.Disconnect();result=Status();break;
    case "models":result=await OpenAiResponses.ListModelsAsync();break;
    case "settings":
     var settings=msg.GetProperty("args");LocalSettings.Current.AllowScreenCapture=settings.GetProperty("screen").GetBoolean();LocalSettings.Current.AllowMicrophone=settings.GetProperty("microphone").GetBoolean();LocalSettings.Current.Model=settings.GetProperty("model").GetString();LocalSettings.Save();result=Status();break;
    case "ask":
     var args=msg.GetProperty("args");var model=args.GetProperty("model").GetString()!;var question=args.GetProperty("question").GetString()!;
     if(string.IsNullOrWhiteSpace(model)||string.IsNullOrWhiteSpace(question))throw new Exception("Choose a model and enter a question.");
     byte[]? image=null;if(args.GetProperty("screen").GetBoolean()){if(!LocalSettings.Current.AllowScreenCapture)throw new Exception("Screen permission is disabled.");image=ScreenCapture.CaptureCursorMonitorJpeg();}
     Emit(new{eventName="captured",value=true});
     result=await OpenAiResponses.AskAsync(question,image,model,text=>Emit(new{eventName="answer",value=text}));break;
    case "voice":
     if(!LocalSettings.Current.AllowMicrophone)throw new Exception("Enable microphone access in Settings first.");
     await voice.ListenAsync((kind,value)=>Emit(new{eventName="voice",kind,value}));result=true;break;
    default:throw new Exception("Unsupported command.");
   }Emit(new{id,result});
  }catch(Exception ex){Emit(new{id,error=ex.Message});}finally{gate.Release();}
 }
}
