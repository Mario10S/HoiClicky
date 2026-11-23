using System.Net;
using System.Text;
using HoiClicky.Providers;
class Tests {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static async Task Main(){
  await TestChatGptAgent();
  Check(Annotations.Parse("Answer [[POINT:10,100]]")?.Coordinates.SequenceEqual(new[]{10,100})==true,"Circle parsing failed.");
  Check(Annotations.Parse("Answer [[ARROW:10,20,30,40]]")?.Coordinates.SequenceEqual(new[]{10,20,30,40})==true,"Arrow parsing failed.");
  Check(Annotations.Parse("[[ARROW:10,20,30,101]]")==null && Annotations.Parse("[[POINT:1,2,3,4]]")==null,"Invalid marker accepted.");
  Check(Annotations.Clean("Answer [[ARR") == "Answer" && Annotations.Clean("Answer [[ARROW:1,2,3,4]]") == "Answer","Marker leaked into answer.");
  var handler=new Handler();using var http=new HttpClient(handler){BaseAddress=new Uri("http://127.0.0.1:11434/")};var provider=new OllamaProvider(http);
  handler.Reply=request=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent(request.RequestUri!.AbsolutePath=="/api/tags"?"{\"models\":[{\"name\":\"text\"},{\"name\":\"vision\"}]}":request.Content!.ReadAsStringAsync().Result.Contains("vision")?"{\"capabilities\":[\"completion\",\"vision\"]}":"{\"capabilities\":[\"completion\"]}")});
  var models=await provider.ModelsAsync();Check(models.Count==2&&models[0].SupportsImages==false&&models[1].SupportsImages==true,"Capabilities were not mapped.");
  try{await provider.ValidateImagesAsync("text");throw new Exception("Text-only model accepted an image.");}catch(InvalidOperationException ex){Check(ex.Message.Contains("cannot read screenshots"),"Incorrect vision error.");}
  await provider.ValidateImagesAsync("vision");
  var updates=new List<string>();handler.Reply=async request=>{Check(request.Headers.Authorization is null,"Cloud credentials leaked to Ollama.");var payload=await request.Content!.ReadAsStringAsync();Check(payload.Contains("question"),"Prompt was missing.");using var body=System.Text.Json.JsonDocument.Parse(payload);Check(body.RootElement.GetProperty("messages").GetArrayLength()==3,"Conversation context was missing.");Check(body.RootElement.GetProperty("messages")[0].GetProperty("content").GetString()=="I own a blue car","Wrong conversation context.");return new(HttpStatusCode.OK){Content=new StringContent("{\"message\":{\"content\":\"Hello \"},\"done\":false}\n{\"message\":{\"content\":\"world\"},\"done\":true}\n")};};
  var result=await provider.AskAsync("question",null,"text",updates.Add,[("user","I own a blue car"),("assistant","Understood")]);Check(result=="Hello world"&&updates.Count==2,"Streaming deltas failed.");
  handler.Reply=_=>Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK){Content=new StringContent("{\"message\":{\"content\":\"partial\"},\"done\":false}\n")});
  try{await provider.AskAsync("question",null,"text",_=>{});throw new Exception("Truncated response succeeded.");}catch(InvalidOperationException ex){Check(ex.Message.Contains("disconnected"),"Incorrect incomplete-stream error.");}
  handler.Reply=_=>throw new HttpRequestException("offline");try{await provider.ModelsAsync();throw new Exception("Offline provider succeeded.");}catch(InvalidOperationException ex){Check(ex.Message.Contains("Cannot reach Ollama"),"Incorrect offline error.");}
  await ClaudeTests();
  TalkKeyTests();
  await AgentTests.RunAsync();
  Console.WriteLine("PASS: model capabilities, text-only image rejection, vision acceptance, streamed text, credential isolation, interrupted stream, offline recovery message.");
 }
 static async Task TestChatGptAgent(){
  var workspace=Path.Combine(Path.GetTempPath(),"hoi-agent-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(workspace);await File.WriteAllTextAsync(Path.Combine(workspace,"note.txt"),"hello from workspace");
  try{
   var calls=0;var handler=new Handler();handler.Reply=async request=>{var body=await request.Content!.ReadAsStringAsync();Check(request.RequestUri!.AbsolutePath=="/v1/responses","Incorrect Responses endpoint.");Check(request.Headers.Authorization?.Scheme=="Bearer","OAuth token missing.");if(calls++==0)return Sse("response.output_item.done",new{type="function_call",name="read_file",arguments="{\"path\":\"note.txt\"}",call_id="read1"});Check(body.Contains("function_call_output")&&body.Contains("hello from workspace"),"Function output was not sent on the next turn.");return TextSse("Read complete.");};
   using(var http=new HttpClient(handler)){var runner=new ChatGptAgentRunner((_,_)=>Task.FromResult(false),http:http,tokenSource:()=>Task.FromResult("fake-token"));var answer=await runner.RunAsync("Read note.txt",null,"gpt-test",[],new AgentSettings("ask",["files"],workspace,false),_=>{},CancellationToken.None);Check(answer.Contains("Read note.txt")&&answer.Contains("Read complete."),"Tool-loop result or step was missing: "+answer);}
   var deniedCalls=0;var deniedHandler=new Handler();deniedHandler.Reply=async request=>{var body=await request.Content!.ReadAsStringAsync();if(deniedCalls++==0)return Sse("response.output_item.done",new{type="function_call",name="write_file",arguments="{\"path\":\"new.txt\",\"content\":\"bad\"}",call_id="write1"});Check(body.Contains("DENIED:")&&body.Contains("Do not retry"),"Denied tool result not sent to model.");return TextSse("Understood.");};
   using(var http=new HttpClient(deniedHandler)){var runner=new ChatGptAgentRunner((_,_)=>Task.FromResult(false),http:http,tokenSource:()=>Task.FromResult("fake-token"));var answer=await runner.RunAsync("Write a file",null,"gpt-test",[],new AgentSettings("ask",["files"],workspace,false),_=>{},CancellationToken.None);Check(answer.Contains("denied")&&!File.Exists(Path.Combine(workspace,"new.txt")),"Denied write was performed.");}
   Console.WriteLine("PASS: ChatGPT Responses tool loop, OAuth header, stateless function output replay and denied writes.");
  }finally{Directory.Delete(workspace,true);}
 }
 static HttpResponseMessage Sse(string type,object item)=>new(HttpStatusCode.OK){Content=new StringContent("data: "+System.Text.Json.JsonSerializer.Serialize(new{type,item})+"\n\n"+"data: {\"type\":\"response.completed\"}\n\n"+"data: [DONE]\n\n",Encoding.UTF8,"text/event-stream")};
 static HttpResponseMessage TextSse(string text)=>new(HttpStatusCode.OK){Content=new StringContent("data: {\"type\":\"response.output_text.delta\",\"delta\":"+System.Text.Json.JsonSerializer.Serialize(text)+"}\n\n"+"data: {\"type\":\"response.completed\"}\n\n"+"data: [DONE]\n\n",Encoding.UTF8,"text/event-stream")};
 static void TalkKeyTests(){
  HoiClicky.TalkKeys.Validate(119,HoiClicky.TalkKeys.None);HoiClicky.TalkKeys.Validate(162,164);
  foreach(var (k1,k2,why) in new[]{(32,0,"Space alone"),(162,162,"same key twice"),(65,0,"unsupported key"),(162,65,"unsupported second key")}){try{HoiClicky.TalkKeys.Validate(k1,k2);throw new Exception("Accepted "+why+".");}catch(Exception ex)when(!ex.Message.StartsWith("Accepted")){}}
  var down=new HashSet<int>{119};Check(HoiClicky.TalkKeys.Held(119,0,down.Contains),"Single key did not start talking.");Check(!HoiClicky.TalkKeys.Held(162,164,down.Contains),"Unpressed pair started talking.");
  down=[162];Check(!HoiClicky.TalkKeys.Held(162,164,down.Contains),"One key of a pair started talking.");down=[162,164];Check(HoiClicky.TalkKeys.Held(162,164,down.Contains),"Held pair did not start talking.");
  Console.WriteLine("PASS: single-key and two-key push-to-talk, Space-alone and duplicate key rejection.");
 }
 static async Task ClaudeTests(){
  var cli=new FakeCli();var claude=new ClaudeCodeProvider(cli);
  cli.Lines=["{\"loggedIn\":false}"];
  try{await claude.ModelsAsync();throw new Exception("Signed-out Claude listed models.");}catch(InvalidOperationException ex){Check(ex.Message.Contains("Sign in with Claude"),"Incorrect signed-out error.");}
  cli.Lines=["{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"subscriptionType\":\"max\",\"email\":\"someone@example.com\"}"];
  var status=await ClaudeCodeAuth.StatusAsync(cli);Check(status.LoggedIn&&status.Label=="Claude Max via Claude Code","Status label was wrong.");Check(!status.Label!.Contains("@"),"Account email leaked into the label.");
  var claudeModels=await claude.ModelsAsync();Check(claudeModels.Count==3&&claudeModels.All(m=>m.SupportsImages==true),"Claude models were not listed.");
  var image=new byte[]{0xFF,0xD8,0xFF,0x01,0x02,0x03};var imageBase64=Convert.ToBase64String(image);
  cli.Lines=["{\"type\":\"system\",\"subtype\":\"init\"}","{\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello \"}}}","{\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"world\"}}}","{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"Hello world\"}"];
  var claudeUpdates=new List<string>();var answer=await claude.AskAsync("What is on screen?",image,"sonnet",claudeUpdates.Add,[("user","I own a blue car"),("assistant","Understood")]);
  Check(answer=="Hello world"&&claudeUpdates.SequenceEqual(["Hello ","Hello world"]),"Claude streaming failed.");
  var args=cli.Args!;Check(args[0]=="-p"&&args.Contains("--no-session-persistence")&&args.Contains("--strict-mcp-config"),"Claude was not run headless without session persistence.");
  var tools=Array.IndexOf(args.ToArray(),"--tools");Check(tools>=0&&args[tools+1]=="","Claude tools were not disabled.");
  Check(args[Array.IndexOf(args.ToArray(),"--model")+1]=="sonnet","Wrong Claude model.");
  Check(!args.Any(a=>a.Contains(imageBase64))&&!args.Any(a=>a.Contains("What is on screen")),"Prompt or screenshot leaked onto the command line.");
  using(var payload=System.Text.Json.JsonDocument.Parse(cli.Stdin!)){var content=payload.RootElement.GetProperty("message").GetProperty("content");var prompt=content[0].GetProperty("text").GetString()!;Check(prompt.Contains("User: I own a blue car")&&prompt.Contains("Assistant: Understood")&&prompt.EndsWith("What is on screen?"),"Claude conversation context was missing.");Check(content.GetArrayLength()==2&&content[1].GetProperty("type").GetString()=="image"&&content[1].GetProperty("source").GetProperty("data").GetString()==imageBase64,"Screenshot was not sent as an image block.");}
  await claude.AskAsync("text only",null,"haiku",_=>{});using(var payload=System.Text.Json.JsonDocument.Parse(cli.Stdin!))Check(payload.RootElement.GetProperty("message").GetProperty("content").GetArrayLength()==1,"Text-only request carried an image.");
  cli.Lines=["{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":true,\"result\":\"Invalid API key\"}"];
  try{await claude.AskAsync("question",null,"sonnet",_=>{});throw new Exception("Failed Claude request succeeded.");}catch(InvalidOperationException ex){Check(ex.Message.Contains("Sign in with Claude"),"Auth failure was not explained.");}
  cli.Lines=["{\"type\":\"stream_event\",\"event\":{\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"partial\"}}}"];
  try{await claude.AskAsync("question",null,"sonnet",_=>{});throw new Exception("Truncated Claude response succeeded.");}catch(InvalidOperationException ex){Check(ex.Message.Contains("disconnected"),"Incorrect Claude incomplete-stream error.");}
  try{await claude.AskAsync("question",null,"--dangerous",_=>{});throw new Exception("Unknown Claude model accepted.");}catch(InvalidOperationException ex){Check(ex.Message.Contains("Choose a Claude model"),"Unknown model error.");}
  Console.WriteLine("PASS: Claude sign-in status, model list, streamed text, tools disabled, no session persistence, prompt and screenshot only on stdin, history context, error and truncation handling.");
 }
 sealed class FakeCli:IClaudeCli{public string[] Lines=[];public IReadOnlyList<string>? Args;public byte[]? Stdin;public Task<int> RunAsync(IReadOnlyList<string> args,byte[]? stdin,Action<string> onLine,CancellationToken token){if(args[0]=="-p"){Args=args;Stdin=stdin;}foreach(var line in Lines)onLine(line);return Task.FromResult(0);}}
 sealed class Handler:HttpMessageHandler{public Func<HttpRequestMessage,Task<HttpResponseMessage>> Reply=null!;protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)=>Reply(request);}
}
namespace HoiClicky {
 internal class LocalSettings{public static LocalSettings Current=new();public string? Provider { get; set; }}
 internal static class OAuthService{public static bool HasCredentials=>false;}
 internal static class OpenAiResponses{public sealed record ModelChoice(string Slug,string Name);public static Task<List<ModelChoice>> ListModelsAsync()=>throw new NotImplementedException();public static Task<string> AskAsync(string a,byte[]? b,string c,Action<string> d,IReadOnlyList<(string Role,string Text)>? history=null)=>throw new NotImplementedException();}
}
