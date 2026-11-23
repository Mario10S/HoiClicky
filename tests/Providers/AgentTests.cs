using System.Text.Json;
using HoiClicky;
using HoiClicky.Providers;
static class AgentTests {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static JsonElement Json(string text)=>JsonDocument.Parse(text).RootElement.Clone();

 public static async Task RunAsync(){
  Policy();Desktop();AppControl();await Runner();
  Console.WriteLine("PASS: agent approval rules, workspace boundary, disabled tools, screen permission, desktop coordinate mapping and key parsing, permission protocol allow/deny/stop, step list, agent without workspace, app control prompt.");
 }

 static void Policy(){
  var workspace=Path.Combine(Path.GetTempPath(),"hoi-agent-ws");Directory.CreateDirectory(workspace);
  var all=AgentPolicy.Groups;
  AgentSettings S(string approval,string[]? tools=null,bool screen=true)=>new(approval,tools??all,workspace,screen);
  var inside=Json($$"""{"file_path":{{JsonSerializer.Serialize(Path.Combine(workspace,"notes.txt"))}}}""");
  var outside=Json($$"""{"file_path":{{JsonSerializer.Serialize(Path.Combine(Path.GetTempPath(),"elsewhere.txt"))}}}""");
  var escape=Json($$"""{"file_path":{{JsonSerializer.Serialize(Path.Combine(workspace,"..","escape.txt"))}}}""");
  var command=Json("""{"command":"Remove-Item *"}""");var click=Json("""{"x":10,"y":10}""");
  Check(AgentPolicy.Decide("Read",inside,S("ask")).Decision==AgentDecision.Allow,"Reading in the workspace needed approval.");
  Check(AgentPolicy.Decide("Read",outside,S("ask")).Decision==AgentDecision.Ask,"Reading outside the workspace ran without approval.");
  Check(AgentPolicy.Decide("Write",inside,S("ask")).Decision==AgentDecision.Ask,"Ask mode wrote without approval.");
  Check(AgentPolicy.Decide("PowerShell",command,S("ask")).Decision==AgentDecision.Ask,"Ask mode ran a command without approval.");
  Check(AgentPolicy.Decide("mcp__desktop__click",click,S("ask")).Decision==AgentDecision.Ask,"Ask mode clicked without approval.");
  Check(AgentPolicy.Decide("Edit",inside,S("files")).Decision==AgentDecision.Allow,"Files mode asked for a workspace edit.");
  Check(AgentPolicy.Decide("Write",outside,S("files")).Decision==AgentDecision.Ask,"Files mode wrote outside the workspace without approval.");
  Check(AgentPolicy.Decide("Write",escape,S("files")).Decision==AgentDecision.Ask,"A .. path escaped the workspace.");
  Check(AgentPolicy.Decide("mcp__desktop__click",click,S("files")).Decision==AgentDecision.Ask,"Files mode clicked without approval.");
  Check(AgentPolicy.Decide("PowerShell",command,S("auto")).Decision==AgentDecision.Allow,"Autonomous mode asked for approval.");
  Check(AgentPolicy.Decide("PowerShell",command,S("auto",["files","web"])).Decision==AgentDecision.Deny,"A turned-off tool group was allowed.");
  Check(AgentPolicy.Decide("mcp__desktop__screenshot",Json("{}"),S("auto",screen:false)).Decision==AgentDecision.Deny,"Screenshot ran with screen access off.");
  Check(AgentPolicy.Decide("mcp__desktop__screenshot",Json("{}"),S("ask")).Decision==AgentDecision.Allow,"Screenshot needed approval with screen access on.");
  Check(AgentPolicy.Decide("Task",Json("{}"),S("auto")).Decision==AgentDecision.Deny,"An unknown tool was allowed.");
  Check(AgentPolicy.CliTools(["files"])=="Read,Glob,Grep,Edit,Write","Wrong CLI tool list.");
 }

 static void AppControl(){
  var prompt=AppCommands.Prompt(Json("""{"model":"sonnet","models":[{"slug":"opus"}]}"""));
  Check(prompt.Contains("[[APP {\"action\":\"new_chat\"}]]")&&prompt.Contains("talk_keys")&&prompt.Contains("agent_approval")&&prompt.Contains("\"slug\":\"opus\""),"App control prompt is missing actions or state.");
  Check(prompt.Contains("Never change agent_approval to auto unless"),"App control prompt lost the autonomous-mode guard.");
  var huge=AppCommands.Prompt(Json("{\"x\":\""+new string('a',9000)+"\"}"));Check(huge.Contains("too large")&&huge.Length<4000,"Oversized app state was not dropped.");
 }
 static void Desktop(){
  var map=new ScreenMapping(-1920,0,2560,1440,1280,720);
  Check(DesktopMcpCore.ToScreen(640,360,map)==(-640,720),"Screenshot point did not map to the screen.");
  try{DesktopMcpCore.ToScreen(1280,10,map);throw new Exception("Accepted a point outside the screenshot.");}catch(InvalidOperationException){}
  Check(DesktopMcpCore.ImageSize(2560,1440)==(1280,720)&&DesktopMcpCore.ImageSize(1024,768)==(1024,768),"Wrong screenshot size.");
  Check(DesktopMcpCore.ParseKeys("ctrl+shift+s").SequenceEqual(new ushort[]{0x11,0x10,0x53})&&DesktopMcpCore.ParseKeys("F5")[0]==0x74&&DesktopMcpCore.ParseKeys("enter")[0]==0x0D,"Key parsing failed.");
  try{DesktopMcpCore.ParseKeys("ctrl+banana");throw new Exception("Accepted an unknown key.");}catch(InvalidOperationException){}
  var tools=JsonSerializer.Serialize(DesktopMcpCore.Tools());foreach(var name in new[]{"screenshot","click","type_text","press_keys","scroll"})Check(tools.Contains($"\"{name}\""),"Missing desktop tool "+name+".");
 }

 static async Task Runner(){
  var workspace=Path.Combine(Path.GetTempPath(),"hoi-agent-ws");Directory.CreateDirectory(workspace);
  var settings=new AgentSettings("ask",AgentPolicy.Groups,workspace,true);
  var file=JsonSerializer.Serialize(Path.Combine(workspace,"notes.txt"));
  string Ask(string id)=>"{\"type\":\"control_request\",\"request_id\":\""+id+"\",\"request\":{\"subtype\":\"can_use_tool\",\"tool_name\":\"Write\",\"input\":{\"file_path\":"+file+",\"content\":\"Hallo\"}}}";
  const string ToolUse="""{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"notes.txt","content":"Hallo"}}]}}""";
  const string Done="""{"type":"result","subtype":"success","is_error":false,"result":"Created notes.txt."}""";

  // Allowed by the user.
  var session=new FakeSession(ToolUse,Ask("r1"),Done);AgentApproval? seen=null;var updates=new List<string>();
  var runner=new ClaudeAgentRunner((a,_)=>{seen=a;return Task.FromResult(true);},()=>session);
  var answer=await runner.RunAsync("Create notes.txt",null,"sonnet",[("user","earlier")],settings,null,updates.Add,CancellationToken.None);
  Check(session.Args.Contains("--permission-prompt-tool")&&session.Args.Contains("--no-session-persistence")&&session.Args[session.Args.IndexOf("--tools")+1].Contains("PowerShell"),"Agent was not started with permission prompts and tools.");
  Check(!session.Args.Contains("--mcp-config"),"MCP config added without a server command.");
  Check(session.Written[0].Contains("\"initialize\"")&&session.Written[1].Contains("Create notes.txt")&&session.Written[1].Contains("User: earlier"),"Initialize or question was not sent.");
  Check(seen is {Id:"r1",Title:"Write notes.txt"}&&seen.Detail=="Hallo","The approval card was wrong.");
  using(var reply=JsonDocument.Parse(session.Written[2])){var r=reply.RootElement.GetProperty("response");Check(r.GetProperty("request_id").GetString()=="r1"&&r.GetProperty("response").GetProperty("behavior").GetString()=="allow"&&r.GetProperty("response").GetProperty("updatedInput").GetProperty("content").GetString()=="Hallo","Allow response was malformed.");}
  Check(answer.Contains("- Write notes.txt")&&answer.Contains("Created notes.txt."),"Steps or final answer missing.");
  Check(session.Closed&&session.Killed,"Session was not closed after the result.");

  // Denied by the user.
  session=new FakeSession(ToolUse,Ask("r2"),Done);
  answer=await new ClaudeAgentRunner((_,_)=>Task.FromResult(false),()=>session).RunAsync("x",null,"sonnet",null,settings,null,_=>{},CancellationToken.None);
  using(var reply=JsonDocument.Parse(session.Written[2])){var r=reply.RootElement.GetProperty("response").GetProperty("response");Check(r.GetProperty("behavior").GetString()=="deny"&&r.GetProperty("message").GetString()!.Contains("denied"),"Deny response was malformed.");}
  Check(answer.Contains("Write notes.txt · denied"),"Denied step was not marked.");

  // Files mode allows workspace writes without asking.
  session=new FakeSession(Ask("r3"),Done);var asked=false;
  await new ClaudeAgentRunner((_,_)=>{asked=true;return Task.FromResult(true);},()=>session).RunAsync("x",null,"sonnet",null,settings with{Approval="files"},null,_=>{},CancellationToken.None);
  Check(!asked&&session.Written[2].Contains("\"allow\""),"Files mode asked for a workspace write.");

  // Stop while waiting for approval: the session is killed and nothing is allowed.
  session=new FakeSession(Ask("r4"));using var stop=new CancellationTokenSource();
  var stopped=new ClaudeAgentRunner(async(_,token)=>{stop.Cancel();await Task.Delay(Timeout.Infinite,token);return true;},()=>session).RunAsync("x",null,"sonnet",null,settings,null,_=>{},stop.Token);
  var finished=await Task.WhenAny(stopped,Task.Delay(5000));Check(finished==stopped&&session.Killed,"Stop did not end the agent.");Check(!session.Written.Any(w=>w.Contains("\"allow\"")),"Stopped agent still allowed the action.");

  // No workspace chosen: the agent still runs, in HoiClicky's own empty folder, with a desktop-focused prompt.
  session=new FakeSession(Done);
  await new ClaudeAgentRunner((_,_)=>Task.FromResult(true),()=>session).RunAsync("Close Notepad",null,"sonnet",null,settings with{Workspace=""},null,_=>{},CancellationToken.None);
  var prompt=session.Args[session.Args.IndexOf("--append-system-prompt")+1];Check(session.Dir==ClaudeAgentRunner.DefaultWorkspace&&prompt.Contains("not chosen a workspace"),"Agent without a workspace did not use its own folder.");
  // A chosen folder that was deleted is a clear error.
  try{await new ClaudeAgentRunner((_,_)=>Task.FromResult(true),()=>new FakeSession()).RunAsync("x",null,"sonnet",null,settings with{Workspace=Path.Combine(workspace,"gone")},null,_=>{},CancellationToken.None);throw new Exception("Ran in a missing workspace.");}catch(InvalidOperationException ex){Check(ex.Message.Contains("workspace"),"Wrong missing-workspace error.");}
 }

 sealed class FakeSession(params string[] script):IClaudeSession {
  public List<string> Args=[];public List<string> Written=[];public string Dir="";public bool Closed,Killed;Action? exit;Action<string>? line;int next;
  public void Start(IReadOnlyList<string> args,string dir,Action<string> onLine,Action onExit){Args=[..args];Dir=dir;line=onLine;exit=onExit;}
  // Feed the next scripted line each time HoiClicky writes, like a real CLI reacting to input.
  public void WriteLine(string json){Written.Add(json);if(Written.Count>=2)Pump();}
  void Pump(){if(next<script.Length){var current=script[next++];line!(current);if(!current.Contains("control_request"))Pump();}}
  public void CloseInput(){Closed=true;}
  public void Kill(){if(Killed)return;Killed=true;exit?.Invoke();}
  public void Dispose(){}
 }
}
