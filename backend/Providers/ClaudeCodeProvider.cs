using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
namespace HoiClicky.Providers;

// Runs the user's own Claude Code CLI. HoiClicky never reads or stores Claude credentials:
// sign-in happens in the browser through `claude auth login`, and Claude Code keeps its own login.
internal interface IClaudeCli {
 Task<int> RunAsync(IReadOnlyList<string> args,byte[]? stdin,Action<string> onLine,CancellationToken token);
}

internal sealed class ClaudeCli:IClaudeCli {
 public static readonly ClaudeCli Default=new();
 // Environment keys stripped from the child so only Claude Code's own (browser) login is used.
 static readonly string[] HiddenEnvironment=["ANTHROPIC_API_KEY","ANTHROPIC_AUTH_TOKEN"];
 static readonly string WorkDirectory=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"HoiClicky","claude-work");

 public static string? Locate(){
  var names=OperatingSystem.IsWindows()?new[]{"claude.exe"}:new[]{"claude"};
  var dirs=(Environment.GetEnvironmentVariable("PATH")??"").Split(Path.PathSeparator,StringSplitOptions.RemoveEmptyEntries).ToList();
  dirs.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),".local","bin"));
  foreach(var dir in dirs)foreach(var name in names){try{var path=Path.Combine(dir.Trim('"'),name);if(File.Exists(path))return path;}catch(ArgumentException){}}
  return null;
 }

 public static ProcessStartInfo StartInfo(string exe,IEnumerable<string> args){
  Directory.CreateDirectory(WorkDirectory);
  var start=new ProcessStartInfo(exe){UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=WorkDirectory,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
  foreach(var arg in args)start.ArgumentList.Add(arg);
  foreach(var key in HiddenEnvironment)start.Environment.Remove(key);
  return start;
 }

 public async Task<int> RunAsync(IReadOnlyList<string> args,byte[]? stdin,Action<string> onLine,CancellationToken token){
  var exe=Locate()??throw new InvalidOperationException("Claude Code is not installed. Install it from https://claude.com/claude-code, then sign in from Settings.");
  using var child=Process.Start(StartInfo(exe,args))??throw new InvalidOperationException("Claude Code could not start.");
  using var kill=token.Register(()=>{try{child.Kill(true);}catch{}});
  var errors=child.StandardError.ReadToEndAsync();
  try{
   if(stdin is not null)await child.StandardInput.BaseStream.WriteAsync(stdin,token);
   child.StandardInput.Close();
   string? line;while((line=await child.StandardOutput.ReadLineAsync())is not null)onLine(line);
   await child.WaitForExitAsync(token);await errors;
   return child.ExitCode;
  }catch{try{if(!child.HasExited)child.Kill(true);}catch{}throw;}
 }
}

internal sealed record ClaudeStatus(bool Installed,bool LoggedIn,string? Label);

internal static class ClaudeCodeAuth {
 public static async Task<ClaudeStatus> StatusAsync(IClaudeCli? cli=null){
  cli??=ClaudeCli.Default;if(cli==ClaudeCli.Default&&ClaudeCli.Locate() is null)return new(false,false,null);
  var output=new StringBuilder();using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(20));
  try{await cli.RunAsync(["auth","status","--json"],null,line=>output.AppendLine(line),timeout.Token);}
  catch(OperationCanceledException){throw new InvalidOperationException("Claude Code did not answer. Try again.");}
  try{
   using var doc=JsonDocument.Parse(output.ToString());var root=doc.RootElement;
   if(!root.TryGetProperty("loggedIn",out var loggedIn)||!loggedIn.GetBoolean())return new(true,false,null);
   var method=root.TryGetProperty("authMethod",out var m)?m.GetString():null;
   var plan=root.TryGetProperty("subscriptionType",out var s)&&s.ValueKind==JsonValueKind.String?s.GetString():null;
   var label=method=="claude.ai"?"Claude "+(string.IsNullOrEmpty(plan)?"subscription":char.ToUpperInvariant(plan[0])+plan[1..])+" via Claude Code":"Anthropic Console via Claude Code";
   return new(true,true,label);
  }catch(JsonException){return new(true,false,null);}
 }

 // Opens Claude Code's own browser sign-in in a visible console window, then waits until it reports a login.
 public static async Task<ClaudeStatus> LoginAsync(){
  var status=await StatusAsync();if(!status.Installed)throw new InvalidOperationException("Claude Code is not installed. Install it from https://claude.com/claude-code first.");if(status.LoggedIn)return status;
  var exe=ClaudeCli.Locate()!;var start=ClaudeCli.StartInfo(Environment.GetEnvironmentVariable("ComSpec")??"cmd.exe",["/c","start","Sign in with Claude",exe,"auth","login","--claudeai"]);
  start.RedirectStandardInput=start.RedirectStandardOutput=start.RedirectStandardError=false;start.StandardOutputEncoding=start.StandardErrorEncoding=null;
  using(Process.Start(start)){}
  var until=DateTime.UtcNow.AddMinutes(5);
  while(DateTime.UtcNow<until){await Task.Delay(2000);status=await StatusAsync();if(status.LoggedIn)return status;}
  throw new InvalidOperationException("Claude sign-in was not completed. Finish it in the browser window, then try again.");
 }

 public static async Task LogoutAsync(){if(ClaudeCli.Locate() is null)return;using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(30));await ClaudeCli.Default.RunAsync(["auth","logout"],null,_=>{},timeout.Token);}
}

internal sealed class ClaudeCodeProvider:IAiProvider {
 const string SystemPrompt="You are HoiClicky, a friendly AI screen companion on Windows. Answer clearly and concisely in the language the user writes in, using Markdown when it helps. When a screenshot is attached it shows the user's current screen. You cannot click, type or run anything on the computer in this mode; explain the steps instead. If the user explicitly asks you to do the task yourself, to act as an agent, or to use agent mode, reply with exactly [[AGENT_MODE]] and nothing else, so HoiClicky can switch on agent mode.";
 static readonly AiModel[] Models=[new("sonnet","Claude Sonnet (latest)",true),new("opus","Claude Opus (latest)",true),new("haiku","Claude Haiku (latest)",true)];
 readonly IClaudeCli Cli;
 public ClaudeCodeProvider(IClaudeCli? cli=null){Cli=cli??ClaudeCli.Default;}

 public async Task<List<AiModel>> ModelsAsync(){
  var status=await ClaudeCodeAuth.StatusAsync(Cli);
  if(!status.Installed)throw new InvalidOperationException("Claude Code is not installed. Install it from https://claude.com/claude-code, then sign in from Settings.");
  if(!status.LoggedIn)throw new InvalidOperationException("Sign in with Claude in Settings to choose a model.");
  return [..Models];
 }
 public Task ValidateImagesAsync(string model)=>Task.CompletedTask;

 public static string[] Arguments(string model)=>["-p","--input-format","stream-json","--output-format","stream-json","--verbose","--include-partial-messages","--no-session-persistence","--tools","","--strict-mcp-config","--setting-sources","","--disable-slash-commands","--no-chrome","--model",model,"--system-prompt",SystemPrompt];

 // The question, recent text history and an optional screenshot go over stdin only: never on the command line, never on disk.
 public static byte[] Payload(string text,byte[]? image,IReadOnlyList<(string Role,string Text)>? history){
  var prompt=new StringBuilder();
  if(history is {Count:>0}){prompt.AppendLine("Earlier in this conversation:");foreach(var turn in history)prompt.Append(turn.Role=="user"?"User: ":"Assistant: ").AppendLine(turn.Text);prompt.AppendLine().AppendLine("Current message:");}
  prompt.Append(text);
  var content=new List<object>{new{type="text",text=prompt.ToString()}};
  if(image is not null)content.Add(new{type="image",source=new{type="base64",media_type="image/jpeg",data=Convert.ToBase64String(image)}});
  return Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new{type="user",message=new{role="user",content}})+"\n");
 }

 public async Task<string> AskAsync(string text,byte[]? image,string model,Action<string> update,IReadOnlyList<(string Role,string Text)>? history=null){
  if(!Models.Any(m=>m.Slug==model))throw new InvalidOperationException("Choose a Claude model in the model list.");
  var streamed=new StringBuilder();string? final=null,error=null;
  using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(5));
  int exit;
  try{exit=await Cli.RunAsync(Arguments(model),Payload(text,image,history),line=>{
   if(string.IsNullOrWhiteSpace(line)||line[0]!='{')return;
   using var doc=JsonDocument.Parse(line);var root=doc.RootElement;var type=root.TryGetProperty("type",out var t)?t.GetString():null;
   if(type=="stream_event"&&root.TryGetProperty("event",out var ev)&&ev.TryGetProperty("delta",out var delta)&&delta.TryGetProperty("type",out var dt)&&dt.GetString()=="text_delta"){streamed.Append(delta.GetProperty("text").GetString());update(streamed.ToString());}
   else if(type=="assistant"&&root.TryGetProperty("error",out _)&&root.GetProperty("message").TryGetProperty("content",out var parts)){error=string.Concat(parts.EnumerateArray().Where(p=>p.TryGetProperty("text",out _)).Select(p=>p.GetProperty("text").GetString()));}
   else if(type=="result"){var failed=root.TryGetProperty("is_error",out var e)&&e.GetBoolean();var result=root.TryGetProperty("result",out var r)&&r.ValueKind==JsonValueKind.String?r.GetString():null;if(failed)error??=string.IsNullOrWhiteSpace(result)?"Claude could not answer this request.":result;else final=result??streamed.ToString();}
  },timeout.Token);}
  catch(OperationCanceledException){throw new InvalidOperationException("Claude took too long to respond. Try again.");}
  if(error is not null)throw new InvalidOperationException(Friendly(error));
  if(final is null)throw new InvalidOperationException(exit==0?"Claude disconnected before finishing the response.":"Claude Code stopped unexpectedly. Check that you are signed in, then try again.");
  return final;
 }

 static string Friendly(string error)=>error.Contains("API key",StringComparison.OrdinalIgnoreCase)||error.Contains("login",StringComparison.OrdinalIgnoreCase)||error.Contains("authenticat",StringComparison.OrdinalIgnoreCase)?"Claude sign-in is missing or expired. Sign in with Claude in Settings. ("+error+")":error;
}
