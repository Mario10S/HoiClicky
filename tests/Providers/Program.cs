using System.Net;
using System.Text;
using HoiClicky.Providers;
class Tests {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 static async Task Main(){
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
  Console.WriteLine("PASS: model capabilities, text-only image rejection, vision acceptance, streamed text, credential isolation, interrupted stream, offline recovery message.");
 }
 sealed class Handler:HttpMessageHandler{public Func<HttpRequestMessage,Task<HttpResponseMessage>> Reply=null!;protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token)=>Reply(request);}
}
namespace HoiClicky {
 internal class LocalSettings{public static LocalSettings Current=new();public string? Provider { get; set; }}
 internal static class OAuthService{public static bool HasCredentials=>false;}
 internal static class OpenAiResponses{public sealed record ModelChoice(string Slug,string Name);public static Task<List<ModelChoice>> ListModelsAsync()=>throw new NotImplementedException();public static Task<string> AskAsync(string a,byte[]? b,string c,Action<string> d,IReadOnlyList<(string Role,string Text)>? history=null)=>throw new NotImplementedException();}
}
