using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
namespace HoiClicky.Providers;

// A Claude Code process whose stdin stays open, so HoiClicky can answer permission requests while it works.
internal interface IClaudeSession:IDisposable {
 void Start(IReadOnlyList<string> args,string workDirectory,Action<string> onLine,Action onExit);
 void WriteLine(string json);
 void CloseInput();
 void Kill();
}

internal sealed class ClaudeProcessSession:IClaudeSession {
 Process? child;readonly object writeLock=new();
 public void Start(IReadOnlyList<string> args,string workDirectory,Action<string> onLine,Action onExit){
  var exe=ClaudeCli.Locate()??throw new InvalidOperationException("Claude Code is not installed. Install it from https://claude.com/claude-code, then sign in from Settings.");
  var start=ClaudeCli.StartInfo(exe,args);start.WorkingDirectory=workDirectory;
  child=Process.Start(start)??throw new InvalidOperationException("Claude Code could not start.");
  var running=child;_=running.StandardError.ReadToEndAsync();
  _=Task.Run(async()=>{try{string? line;while((line=await running.StandardOutput.ReadLineAsync())is not null)onLine(line);}catch{}finally{onExit();}});
 }
 public void WriteLine(string json){lock(writeLock){try{child?.StandardInput.WriteLine(json);child?.StandardInput.Flush();}catch(IOException){}catch(InvalidOperationException){}}}
 public void CloseInput(){lock(writeLock){try{child?.StandardInput.Close();}catch{}}}
 public void Kill(){try{if(child is {HasExited:false})child.Kill(true);}catch{}}
 public void Dispose(){Kill();child?.Dispose();}
}

internal sealed record AgentApproval(string Id,string Tool,string Title,string Detail);

internal sealed class ClaudeAgentRunner {
 static readonly TimeSpan ApprovalTimeout=TimeSpan.FromMinutes(5);
 readonly Func<IClaudeSession> sessions;
 readonly Func<AgentApproval,CancellationToken,Task<bool>> askUser;
 readonly Action<string,JsonElement>? preview;
 public ClaudeAgentRunner(Func<AgentApproval,CancellationToken,Task<bool>> askUser,Func<IClaudeSession>? sessions=null,Action<string,JsonElement>? preview=null){this.askUser=askUser;this.sessions=sessions??(()=>new ClaudeProcessSession());this.preview=preview;}

 // Without a chosen workspace the agent runs in an empty folder of its own and focuses on desktop and web tasks.
 public static readonly string DefaultWorkspace=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"HoiClicky","agent-home");
 public static string SystemPrompt(string workspace)=>(workspace==DefaultWorkspace?"You are HoiClicky's agent working on the user's Windows PC. The user has not chosen a workspace folder, so focus on desktop and web tasks such as opening, closing and operating windows; only touch files when the user asks and names them.":$"You are HoiClicky's agent working on the user's Windows PC. Work inside the folder {workspace} unless the user names another place.")+" Plan briefly, take the smallest set of actions that completes the task, and finish with a short summary in the user's language of what you did. To see what is open, call mcp__desktop__list_windows: it lists every window on every monitor and the tabs of browser windows; prefer focus_window, activate_tab and close_window over clicking when they fit. For mouse and keyboard work, call mcp__desktop__screenshot first (pass monitor to pick one, or all), use pixel coordinates from the latest screenshot, and take a new screenshot after each action to check it worked. The user may approve or deny each action. If an action is denied, do not retry it; explain what you wanted to do and ask how to continue. Never enter passwords or payment details, and stop to ask before anything destructive or irreversible.";

 public static List<string> Arguments(string model,AgentSettings settings,string? mcpConfig){
  var args=new List<string>{"-p","--input-format","stream-json","--output-format","stream-json","--verbose","--include-partial-messages","--no-session-persistence","--permission-prompt-tool","stdio","--strict-mcp-config","--setting-sources","","--disable-slash-commands","--no-chrome","--model",model,"--tools",AgentPolicy.CliTools(settings.Tools),"--append-system-prompt",SystemPrompt(settings.Workspace)};
  if(mcpConfig is not null&&settings.Tools.Contains("desktop")){args.Add("--mcp-config");args.Add(mcpConfig);}
  return args;
 }

 public static string McpConfig(string command,IEnumerable<string> args)=>JsonSerializer.Serialize(new{mcpServers=new Dictionary<string,object>{["desktop"]=new{type="stdio",command,args=args.ToArray()}}});

 public async Task<string> RunAsync(string text,byte[]? image,string model,IReadOnlyList<(string Role,string Text)>? history,AgentSettings settings,string? mcpConfig,Action<string> update,CancellationToken token){
  if(string.IsNullOrWhiteSpace(settings.Workspace)){Directory.CreateDirectory(DefaultWorkspace);settings=settings with{Workspace=DefaultWorkspace};}
  else if(!Directory.Exists(settings.Workspace))throw new InvalidOperationException("The agent workspace folder no longer exists. Choose another one in Settings, or clear it.");
  if(settings.Tools.Count==0)throw new InvalidOperationException("Turn on at least one agent tool in Settings.");
  var lines=Channel.CreateUnbounded<string?>();
  using var session=sessions();
  session.Start(Arguments(model,settings,mcpConfig),settings.Workspace,line=>lines.Writer.TryWrite(line),()=>lines.Writer.TryWrite(null));
  using var stop=token.Register(session.Kill);
  session.WriteLine(JsonSerializer.Serialize(new{type="control_request",request_id="hoiclicky-init",request=new{subtype="initialize",hooks=(object?)null}}));
  session.WriteLine(Encoding.UTF8.GetString(ClaudeCodeProvider.Payload(text,image,history)).TrimEnd());

  var steps=new List<string>();var streamed=new StringBuilder();string? final=null,error=null;
  string Compose(){var body=streamed.Length>0?streamed.ToString().Trim():final??"";if(steps.Count==0)return body;var list=string.Join("\n",steps.Select(s=>"- "+s));return "**Steps**\n"+list+(body.Length>0?"\n\n"+body:"");}
  while(await lines.Reader.ReadAsync(CancellationToken.None) is string line){
   if(token.IsCancellationRequested)break;
   if(line.Length==0||line[0]!='{')continue;
   JsonElement root;try{root=JsonDocument.Parse(line).RootElement.Clone();}catch(JsonException){continue;}
   var type=root.TryGetProperty("type",out var t)?t.GetString():null;
   if(type=="stream_event"&&root.TryGetProperty("event",out var ev)){
    var kind=ev.TryGetProperty("type",out var k)?k.GetString():null;
    if(kind=="message_start"&&streamed.Length>0&&!streamed.ToString().EndsWith("\n\n"))streamed.Append("\n\n");
    if(kind=="content_block_delta"&&ev.TryGetProperty("delta",out var delta)&&delta.TryGetProperty("type",out var dt)&&dt.GetString()=="text_delta"){streamed.Append(delta.GetProperty("text").GetString());update(Compose());}
   }
   else if(type=="assistant"&&root.TryGetProperty("message",out var message)&&message.TryGetProperty("content",out var content)&&content.ValueKind==JsonValueKind.Array){
    foreach(var block in content.EnumerateArray())if(block.TryGetProperty("type",out var bt)&&bt.GetString()=="tool_use"){steps.Add(Describe(block.GetProperty("name").GetString()??"",block.TryGetProperty("input",out var bi)?bi:default,settings.Workspace));update(Compose());}
    if(root.TryGetProperty("error",out _))error=string.Concat(content.EnumerateArray().Where(p=>p.TryGetProperty("text",out _)).Select(p=>p.GetProperty("text").GetString()));
   }
   else if(type=="control_request"&&root.TryGetProperty("request",out var request)&&request.TryGetProperty("subtype",out var st)&&st.GetString()=="can_use_tool"){
    var requestId=root.GetProperty("request_id").GetString()!;var tool=request.GetProperty("tool_name").GetString()??"";var input=request.TryGetProperty("input",out var i)?i:JsonDocument.Parse("{}").RootElement;
    var (decision,reason)=AgentPolicy.Decide(tool,input,settings);
    preview?.Invoke(tool,input);
    var allowed=decision==AgentDecision.Allow;
    if(decision==AgentDecision.Ask){
     using var wait=CancellationTokenSource.CreateLinkedTokenSource(token);wait.CancelAfter(ApprovalTimeout);
     try{allowed=await askUser(new AgentApproval(requestId,tool,Describe(tool,input,settings.Workspace),Detail(tool,input)),wait.Token);reason=allowed?null:"The user denied this action.";}
     catch(OperationCanceledException){allowed=false;reason=token.IsCancellationRequested?"The user stopped the agent.":"No answer within five minutes, so the action was denied.";}
    }
    if(!allowed){var title=Describe(tool,input,settings.Workspace);var index=steps.LastIndexOf(title);if(index>=0)steps[index]=title+" · denied";else steps.Add(title+" · denied");update(Compose());}
    session.WriteLine(Response(requestId,allowed,input,reason));
   }
   else if(type=="result"){
    var failed=root.TryGetProperty("is_error",out var e)&&e.GetBoolean();var result=root.TryGetProperty("result",out var r)&&r.ValueKind==JsonValueKind.String?r.GetString():null;
    if(failed)error??=string.IsNullOrWhiteSpace(result)?"Claude could not finish this task.":result;else final=result??"";
    session.CloseInput();break;
   }
  }
  session.Kill();
  if(token.IsCancellationRequested){var stopped=Compose();return (stopped.Length>0?stopped+"\n\n":"")+"_Stopped._";}
  if(error is not null)throw new InvalidOperationException(error);
  if(final is null)throw new InvalidOperationException("Claude Code stopped before finishing. Check that you are signed in, then try again.");
  return Compose();
 }

 public static string Response(string requestId,bool allow,JsonElement input,string? reason)=>JsonSerializer.Serialize(new{type="control_response",response=new{subtype="success",request_id=requestId,response=allow?(object)new{behavior="allow",updatedInput=input}:new{behavior="deny",message=reason??"The user denied this action."}}});

 static string Str(JsonElement input,string name)=>input.ValueKind==JsonValueKind.Object&&input.TryGetProperty(name,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString()??"":"";
 static string Num(JsonElement input,string name)=>input.ValueKind==JsonValueKind.Object&&input.TryGetProperty(name,out var v)&&v.ValueKind==JsonValueKind.Number?Math.Round(v.GetDouble()).ToString():"?";
 static string Short(string value,int max=80){value=value.Replace("\r","").Replace("\n"," ").Trim();return value.Length>max?value[..(max-1)]+"…":value;}
 static string Rel(string path,string workspace){if(path.Length==0)return "a file";try{if(AgentPolicy.Inside(path,workspace))return Path.GetRelativePath(workspace,Path.GetFullPath(path,workspace));}catch{}return path;}

 // One short line per action, shown on approval cards and in the step list.
 public static string Describe(string tool,JsonElement input,string workspace)=>tool switch{
  "Read"=>"Read "+Rel(Str(input,"file_path"),workspace),
  "Glob"=>"Find files matching "+Short(Str(input,"pattern")),
  "Grep"=>"Search files for “"+Short(Str(input,"pattern"),50)+"”",
  "Write"=>"Write "+Rel(Str(input,"file_path"),workspace),
  "Edit"=>"Edit "+Rel(Str(input,"file_path"),workspace),
  "NotebookEdit"=>"Edit notebook "+Rel(Str(input,"notebook_path"),workspace),
  "Bash" or "PowerShell"=>"Run: "+Short(Str(input,"command"),70),
  "WebSearch"=>"Search the web for “"+Short(Str(input,"query"),60)+"”",
  "WebFetch"=>"Open "+Short(Str(input,"url"),70),
  AgentPolicy.DesktopPrefix+"screenshot"=>Str(input,"monitor") is {Length:>0} monitor?(monitor=="all"?"Look at all monitors":"Look at monitor "+monitor):"Look at the screen",
  AgentPolicy.DesktopPrefix+"list_windows"=>"List open windows and tabs",
  AgentPolicy.DesktopPrefix+"focus_window"=>"Bring a window to the front",
  AgentPolicy.DesktopPrefix+"activate_tab"=>"Switch to the tab “"+Short(Str(input,"tab") is {Length:>0} t?t:Num(input,"tab"),50)+"”",
  AgentPolicy.DesktopPrefix+"close_window"=>"Close a window",
  AgentPolicy.DesktopPrefix+"click"=>(input.ValueKind==JsonValueKind.Object&&input.TryGetProperty("double",out var d)&&d.ValueKind==JsonValueKind.True?"Double-click":Str(input,"button")=="right"?"Right-click":"Click")+$" at {Num(input,"x")}, {Num(input,"y")}",
  AgentPolicy.DesktopPrefix+"type_text"=>"Type “"+Short(Str(input,"text"),50)+"”",
  AgentPolicy.DesktopPrefix+"press_keys"=>"Press "+Short(Str(input,"keys"),30),
  AgentPolicy.DesktopPrefix+"scroll"=>$"Scroll at {Num(input,"x")}, {Num(input,"y")}",
  _=>"Use "+tool};

 public static string Detail(string tool,JsonElement input){
  string Clip(string value)=>value.Length>4000?value[..4000]+"\n…":value;
  return tool switch{
   "Write"=>Clip(Str(input,"content")),
   "Edit"=>Clip("- "+Str(input,"old_string").Replace("\n","\n- ")+"\n+ "+Str(input,"new_string").Replace("\n","\n+ ")),
   "Bash" or "PowerShell"=>Clip(Str(input,"command")+(Str(input,"description") is {Length:>0} desc?"\n\n"+desc:"")),
   AgentPolicy.DesktopPrefix+"type_text"=>Clip(Str(input,"text")),
   AgentPolicy.DesktopPrefix+"click" or AgentPolicy.DesktopPrefix+"scroll"=>"The companion cursor shows where this happens.",
   _=>input.ValueKind==JsonValueKind.Undefined?"":Clip(JsonSerializer.Serialize(input,new JsonSerializerOptions{WriteIndented=true}))};
 }
}
