using HoiClicky.Providers;
using System.Text.Json;
using System.IO;
using HoiClicky;
class Program {
 static readonly object outputLock=new();
 static readonly SemaphoreSlim gate=new(1);
 static readonly VoiceInput voice=new();
 static ClaudeStatus claude=new(false,false,null);
 // Agent mode: open approval requests by id, and the running agent so Stop can cancel it.
 static readonly System.Collections.Concurrent.ConcurrentDictionary<string,TaskCompletionSource<bool>> approvals=new();
 static CancellationTokenSource? agentRun;
 static AgentSettings AgentSettingsNow()=>new(LocalSettings.Current.AgentApproval,LocalSettings.Current.AgentTools,LocalSettings.Current.AgentWorkspace??"",LocalSettings.Current.AllowScreenCapture);
 static string DesktopMcpConfig(){var exe=Environment.ProcessPath??"dotnet";var dll=typeof(Program).Assembly.Location;var viaDotnet=Path.GetFileNameWithoutExtension(exe).Equals("dotnet",StringComparison.OrdinalIgnoreCase);return ClaudeAgentRunner.McpConfig(exe,viaDotnet?[dll,"--mcp-desktop"]:["--mcp-desktop"]);}
 static async Task<bool> AskUser(AgentApproval approval,CancellationToken token){
  var answer=new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);approvals[approval.Id]=answer;
  Emit(new{eventName="approval",id=approval.Id,tool=approval.Tool,title=approval.Title,detail=approval.Detail});
  try{using(token.Register(()=>answer.TrySetCanceled()))return await answer.Task;}
  finally{approvals.TryRemove(approval.Id,out _);Emit(new{eventName="approvalDone",id=approval.Id});}
 }
 // Show the companion cursor at the spot a click or scroll would hit, before the user decides.
 static void PreviewAction(string tool,JsonElement input){
  if(tool is not (AgentPolicy.DesktopPrefix+"click" or AgentPolicy.DesktopPrefix+"scroll"))return;
  try{var map=DesktopMcpCore.LoadMapping();if(map is null)return;var (x,y)=DesktopMcpCore.ToScreen(input.GetProperty("x").GetDouble(),input.GetProperty("y").GetDouble(),map);Emit(new{eventName="point",x,y});}catch{}
 }
 static void Emit(object value){lock(outputLock)Console.WriteLine(JsonSerializer.Serialize(value));}
 static object Status()=>new {connected=OAuthService.HasCredentials,account=OAuthService.HasCredentials?OAuthService.AccountLabel:null,screen=LocalSettings.Current.AllowScreenCapture,microphone=LocalSettings.Current.AllowMicrophone,provider=AiProviders.Selected,model=LocalSettings.Current.Model,key1=LocalSettings.Current.TalkKey1,key2=LocalSettings.Current.TalkKey2,claude=new{installed=claude.Installed,loggedIn=claude.LoggedIn,account=claude.Label},agent=new{approval=LocalSettings.Current.AgentApproval,tools=LocalSettings.Current.AgentTools,workspace=LocalSettings.Current.AgentWorkspace}};
 static async Task Main(string[] argv){if(argv.Contains("--mcp-desktop")){await DesktopMcp.RunAsync();return;}using var keys=new HoldKeyMonitor(OnHold);var requests=new List<Task>();string? line;while((line=await Console.In.ReadLineAsync())!=null){try{var msg=JsonDocument.Parse(line).RootElement.Clone();requests.RemoveAll(task=>task.IsCompleted);requests.Add(Handle(msg));}catch{}}voice.Stop();await Task.WhenAll(requests);voice.Dispose();}
 static bool heldVoice;
 static void OnHold(bool down){
  if(!down){if(heldVoice){voice.Stop();Emit(new{eventName="hold",value=false});}return;}
  if(!gate.Wait(0))return;
  heldVoice=true;Emit(new{eventName="hold",value=true});_=RunHeldVoice();
 }
 static async Task RunHeldVoice(){try{await voice.ListenAsync((kind,value)=>Emit(new{eventName="voice",kind,value}));}catch(Exception ex){Emit(new{eventName="voice",kind="error",value=ex.Message});}finally{heldVoice=false;Emit(new{eventName="voice",kind="complete",value=""});gate.Release();}}
 static async Task Handle(JsonElement msg){var id=msg.GetProperty("id").GetInt32();var method=msg.GetProperty("method").GetString();
  if(method=="voiceStop"){voice.Stop();Emit(new{id,result=true});return;}
  // Approvals and Stop must not wait for the gate: the running agent holds it.
  if(method=="approve"){var a=msg.GetProperty("args");var found=approvals.TryGetValue(a.GetProperty("id").GetString()??"",out var pending)&&pending.TrySetResult(a.GetProperty("allow").GetBoolean());Emit(new{id,result=found});return;}
  if(method=="agentStop"){agentRun?.Cancel();Emit(new{id,result=true});return;}
  // App changes Claude requested that widen its permissions: ask through the same approval card, without holding the gate.
  if(method=="confirmAction"){
   var c=msg.GetProperty("args");var title=(c.GetProperty("title").GetString()??"").Trim();var detail=c.TryGetProperty("detail",out var d)?d.GetString()??"":"";
   if(title.Length is 0 or >200||detail.Length>1000){Emit(new{id,error="Invalid confirmation."});return;}
   _=Task.Run(async()=>{using var wait=new CancellationTokenSource(TimeSpan.FromMinutes(5));bool ok;try{ok=await AskUser(new AgentApproval("app-"+Guid.NewGuid().ToString("N"),"app",title,detail),wait.Token);}catch(OperationCanceledException){ok=false;}Emit(new{id,result=ok});});
   return;
  }
  // Serialize operations, including token refresh; routine requests wait instead of failing.
  await gate.WaitAsync();
  try{object? result=null;
   switch(method){
    case "status":claude=await ClaudeCodeAuth.StatusAsync();result=Status();break;
    case "claudeConnect":claude=await ClaudeCodeAuth.LoginAsync();result=Status();break;
    case "claudeDisconnect":await ClaudeCodeAuth.LogoutAsync();claude=await ClaudeCodeAuth.StatusAsync();result=Status();break;
    case "connect":await OAuthService.SignInAsync();result=Status();break;
    case "disconnect":OAuthService.Disconnect();result=Status();break;
    case "prepareClick":
     var pointArgs=msg.GetProperty("args");result=ConfirmedClick.Prepare(pointArgs.GetProperty("x").GetInt32(),pointArgs.GetProperty("y").GetInt32());break;
    case "confirmClick":result=ConfirmedClick.Invoke();break;
    case "cancelClick":ConfirmedClick.Cancel();result=true;break;
    case "models":result=await AiProviders.Current.ModelsAsync();break;
    case "settings":
     var settings=msg.GetProperty("args");LocalSettings.Current.AllowScreenCapture=settings.GetProperty("screen").GetBoolean();LocalSettings.Current.AllowMicrophone=settings.GetProperty("microphone").GetBoolean();LocalSettings.Current.Model=settings.GetProperty("model").GetString();if(settings.TryGetProperty("key1",out var k1)&&settings.TryGetProperty("key2",out var k2)){
      TalkKeys.Validate(k1.GetInt32(),k2.GetInt32());
      LocalSettings.Current.TalkKey1=k1.GetInt32();LocalSettings.Current.TalkKey2=k2.GetInt32();
     }if(settings.TryGetProperty("provider",out var provider)){
      var name=provider.GetString();if(name is not ("ollama" or "chatgpt" or "claude"))throw new Exception("Unsupported AI provider.");
      if(AiProviders.Selected!=name)LocalSettings.Current.Model="";
      LocalSettings.Current.Provider=name;
     }if(settings.TryGetProperty("agentApproval",out var approval)){var mode=approval.GetString();if(mode is null||!AgentPolicy.Approvals.Contains(mode))throw new Exception("Unsupported approval mode.");LocalSettings.Current.AgentApproval=mode;}
     if(settings.TryGetProperty("agentTools",out var tools)&&tools.ValueKind==JsonValueKind.Array){LocalSettings.Current.AgentTools=tools.EnumerateArray().Select(t=>t.GetString()??"").Where(t=>AgentPolicy.Groups.Contains(t)).Distinct().ToArray();}
     if(settings.TryGetProperty("workspace",out var workspace)&&workspace.ValueKind==JsonValueKind.String){var folder=workspace.GetString()!;if(folder.Length==0)LocalSettings.Current.AgentWorkspace=null;else{if(!Directory.Exists(folder))throw new Exception("That workspace folder does not exist.");LocalSettings.Current.AgentWorkspace=Path.GetFullPath(folder);}}
     LocalSettings.Save();result=Status();break;
    case "ask":
     var args=msg.GetProperty("args");var model=args.GetProperty("model").GetString()!;var question=args.GetProperty("question").GetString()!;
     if(string.IsNullOrWhiteSpace(model)||string.IsNullOrWhiteSpace(question))throw new Exception("Choose a model and enter a question.");
     var ai=AiProviders.Current;byte[]? image=null;System.Drawing.Rectangle bounds=default;if(args.GetProperty("screen").GetBoolean()){await ai.ValidateImagesAsync(model);if(!LocalSettings.Current.AllowScreenCapture)throw new Exception("Screen permission is disabled.");image=ScreenCapture.CaptureCursorMonitorJpeg(out bounds);}
     Emit(new{eventName="captured",value=true});
     var history=new List<(string Role,string Text)>();
     if(args.TryGetProperty("history",out var prior)&&prior.ValueKind==JsonValueKind.Array){foreach(var turn in prior.EnumerateArray().TakeLast(12)){var role=turn.GetProperty("role").GetString();var text=turn.GetProperty("text").GetString()??"";if(role is not ("user" or "assistant"))throw new Exception("Invalid history role.");if(text.Length>12000)text=text[..12000];history.Add((role,text));}}
     if(AiProviders.Selected=="claude"&&args.TryGetProperty("app",out var appState)&&appState.ValueKind==JsonValueKind.Object)question+="\n\n"+AppCommands.Prompt(appState);
     if(args.TryGetProperty("agent",out var agentFlag)&&agentFlag.ValueKind==JsonValueKind.True){
      if(AiProviders.Selected!="claude")throw new Exception("Agent mode needs Claude as the AI provider.");
      using var run=new CancellationTokenSource();agentRun=run;
      try{result=await new ClaudeAgentRunner(AskUser,preview:PreviewAction).RunAsync(question,image,model,history,AgentSettingsNow(),DesktopMcpConfig(),text=>Emit(new{eventName="answer",value=text}),run.Token);}
      finally{agentRun=null;foreach(var open in approvals.Values)open.TrySetResult(false);}
      break;
     }
     if(image is not null)question+="\n\nWhen the user asks where or how to click a visible element, append exactly [[POINT:x,y]] to your answer, using integer percentages from the screenshot top-left (0 to 100). Point at the element center. Omit the marker if uncertain or no specific element applies.";
     static string Clean(string text){var i=text.LastIndexOf("[[",StringComparison.Ordinal);if(i<0)return text;var suffix=text[i..];return ("[[POINT:".StartsWith(suffix,StringComparison.OrdinalIgnoreCase)||suffix.StartsWith("[[POINT:",StringComparison.OrdinalIgnoreCase))?text[..i].TrimEnd():text;}
     var answer=await ai.AskAsync(question,image,model,text=>Emit(new{eventName="answer",value=Clean(text)}),history);
     if(image is not null){var point=System.Text.RegularExpressions.Regex.Match(answer,@"\[\[POINT:\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\]\]",System.Text.RegularExpressions.RegexOptions.IgnoreCase);if(point.Success&&int.TryParse(point.Groups[1].Value,out var x)&&int.TryParse(point.Groups[2].Value,out var y)&&x<=100&&y<=100)Emit(new{eventName="point",x=bounds.Left+(int)(bounds.Width*x/100.0),y=bounds.Top+(int)(bounds.Height*y/100.0)});}
     result=Clean(answer);break;
    case "voice":
     if(!LocalSettings.Current.AllowMicrophone)throw new Exception("Enable microphone access in Settings first.");
     await voice.ListenAsync((kind,value)=>Emit(new{eventName="voice",kind,value}));result=true;break;
    default:throw new Exception("Unsupported command.");
   }Emit(new{id,result});
  }catch(Exception ex){Emit(new{id,error=ex.Message});}finally{gate.Release();}
 }
}
