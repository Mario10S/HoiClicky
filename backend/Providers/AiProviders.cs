using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.IO;
using HoiClicky;
namespace HoiClicky.Providers;
internal sealed record AiModel(string Slug,string Name,bool? SupportsImages);
internal interface IAiProvider {
 Task<List<AiModel>> ModelsAsync();
 Task ValidateImagesAsync(string model);
 Task<string> AskAsync(string text,byte[]? image,string model,Action<string> update,IReadOnlyList<(string Role,string Text)>? history=null);
}
internal static class AiProviders {
 public static string Selected=>LocalSettings.Current.Provider??(OAuthService.HasCredentials?"chatgpt":"ollama");
 public static IAiProvider Current=>Selected=="ollama"?new OllamaProvider():new ChatGptProvider();
}
internal sealed class ChatGptProvider:IAiProvider {
 public async Task<List<AiModel>> ModelsAsync()=>(await OpenAiResponses.ListModelsAsync()).Select(m=>new AiModel(m.Slug,m.Name,null)).ToList();
 public Task ValidateImagesAsync(string model)=>Task.CompletedTask;
 public Task<string> AskAsync(string text,byte[]? image,string model,Action<string> update,IReadOnlyList<(string Role,string Text)>? history=null)=>OpenAiResponses.AskAsync(text,image,model,update,history);
}
internal sealed class OllamaProvider:IAiProvider {
 // Loopback only. Credentials and cloud tokens are never sent to this provider.
 static readonly HttpClient DefaultHttp=new(new HttpClientHandler{UseProxy=false}){BaseAddress=new Uri("http://127.0.0.1:11434/"),Timeout=TimeSpan.FromMinutes(5)};
 readonly HttpClient Http;
 public OllamaProvider(HttpClient? http=null){Http=http??DefaultHttp;}
 async Task<JsonDocument> JsonAsync(string path,object? body=null){using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(15));try{using var request=new HttpRequestMessage(body is null?HttpMethod.Get:HttpMethod.Post,path);if(body is not null)request.Content=new StringContent(JsonSerializer.Serialize(body),Encoding.UTF8,"application/json");using var response=await Http.SendAsync(request,timeout.Token);if(!response.IsSuccessStatusCode)throw new InvalidOperationException($"Ollama returned HTTP {(int)response.StatusCode}. Check that the model is installed.");return JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));}catch(HttpRequestException){throw new InvalidOperationException("Cannot reach Ollama. Start Ollama on this PC, then refresh models in Settings.");}catch(OperationCanceledException){throw new InvalidOperationException("Ollama took too long to respond. Check that it is running and refresh models.");}}
 async Task<bool> VisionAsync(string model){using var doc=await JsonAsync("api/show",new{model});return doc.RootElement.TryGetProperty("capabilities",out var c)&&c.EnumerateArray().Any(x=>x.GetString()=="vision");}
 public async Task<List<AiModel>> ModelsAsync(){using var doc=await JsonAsync("api/tags");var result=new List<AiModel>();foreach(var item in doc.RootElement.GetProperty("models").EnumerateArray()){var name=item.GetProperty("name").GetString()!;result.Add(new(name,name,await VisionAsync(name)));}return result;}
 public async Task ValidateImagesAsync(string model){if(!await VisionAsync(model))throw new InvalidOperationException("This Ollama model cannot read screenshots. Turn off Screen included or select a vision model.");}
 public async Task<string> AskAsync(string text,byte[]? image,string model,Action<string> update,IReadOnlyList<(string Role,string Text)>? history=null){
  var message=new Dictionary<string,object>{{"role","user"},{"content",text}};if(image is not null)message["images"]=new[]{Convert.ToBase64String(image)};
  var chat=new List<object>();foreach(var turn in history??[])chat.Add(new{role=turn.Role,content=turn.Text});chat.Add(message);
  using var request=new HttpRequestMessage(HttpMethod.Post,"api/chat"){Content=new StringContent(JsonSerializer.Serialize(new{model,messages=chat,stream=true}),Encoding.UTF8,"application/json")};
  HttpResponseMessage response;try{response=await Http.SendAsync(request,HttpCompletionOption.ResponseHeadersRead);}catch(HttpRequestException){throw new InvalidOperationException("Ollama is unavailable. Start Ollama and try again.");}
  using(response){if(!response.IsSuccessStatusCode)throw new InvalidOperationException($"Ollama request failed (HTTP {(int)response.StatusCode}). Check the model and available memory.");await using var stream=await response.Content.ReadAsStreamAsync();using var reader=new StreamReader(stream);var textOut=new StringBuilder();bool done=false;string? line;while((line=await reader.ReadLineAsync())is not null){if(string.IsNullOrWhiteSpace(line))continue;using var item=JsonDocument.Parse(line);var root=item.RootElement;if(root.TryGetProperty("error",out var err))throw new InvalidOperationException(err.GetString());if(root.TryGetProperty("message",out var msg)&&msg.TryGetProperty("content",out var delta)){textOut.Append(delta.GetString());update(textOut.ToString());}if(root.TryGetProperty("done",out var end)&&end.GetBoolean()){done=true;break;}}if(!done)throw new InvalidOperationException("Ollama disconnected before finishing the response.");return textOut.ToString();}
 }
}
