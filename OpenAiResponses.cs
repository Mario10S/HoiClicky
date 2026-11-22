using System.Net.Http.Headers;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.IO;

namespace HoiClicky;

internal static class OpenAiResponses
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMinutes(3) };

    public static async Task<string> AskAboutScreenAsync(string question, byte[] screenshot, Action<string> onText)
    {
        var token = await OAuthService.GetAccessTokenAsync();
        var model = await SelectModelAsync(token);
        var dataUrl = "data:image/jpeg;base64," + Convert.ToBase64String(screenshot);
        var requestBody = JsonSerializer.Serialize(new
        {
            model,
            input = new[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "input_text", text = question },
                        new { type = "input_image", image_url = dataUrl }
                    }
                }
            },
            store = false,
            stream = true
        });

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Content = new StringContent(requestBody, Encoding.UTF8, "application/json");
        using var response = await Http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new InvalidOperationException(ExplainError((int)response.StatusCode, body));
        }

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);
        var result = new StringBuilder();
        var completed = false;
        string? line;
        while ((line = await reader.ReadLineAsync()) is not null)
        {
            if (!line.StartsWith("data: ", StringComparison.Ordinal)) continue;
            var data = line[6..];
            if (data == "[DONE]") break;
            using var eventDoc = JsonDocument.Parse(data);
            var root = eventDoc.RootElement;
            var type = root.TryGetProperty("type", out var eventType) ? eventType.GetString() : null;
            if (type == "response.output_text.delta" && root.TryGetProperty("delta", out var delta))
            {
                result.Append(delta.GetString());
                onText(result.ToString());
            }
            else if (type == "response.completed") completed = true;
            else if (type == "response.failed")
            {
                var error = root.TryGetProperty("response", out var responseNode) && responseNode.TryGetProperty("error", out var errorNode)
                    ? errorNode.TryGetProperty("message", out var message) ? message.GetString() : errorNode.TryGetProperty("code", out var code) ? code.GetString() : null
                    : null;
                throw new InvalidOperationException(error ?? "ChatGPT could not complete this request.");
            }
            else if (type == "response.incomplete") throw new InvalidOperationException("ChatGPT ended the response early. Please try again.");
        }
        if (!completed) throw new InvalidOperationException("The connection ended before ChatGPT completed the response.");
        return result.ToString();
    }

    private static async Task<string> SelectModelAsync(string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://api.openai.com/v1/models");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await Http.SendAsync(request);
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("Could not load models for this ChatGPT account. Reconnect and try again.");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        if (!doc.RootElement.TryGetProperty("models", out var models)) throw new InvalidOperationException("OpenAI returned no available model list.");
        foreach (var model in models.EnumerateArray())
            if (model.TryGetProperty("visibility", out var visibility) && visibility.GetString() == "list" && model.TryGetProperty("slug", out var slug))
                return slug.GetString()!;
        throw new InvalidOperationException("No model is currently available to this ChatGPT account.");
    }

    private static string ExplainError(int status, string body)
    {
        if (status == 401) return "ChatGPT sign-in expired or was revoked. Reconnect in Settings.";
        if (status == 429) return "ChatGPT reports a usage limit for this plan. Try again later or check your ChatGPT plan limits.";
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var error) && error.TryGetProperty("message", out var message)) return message.GetString() ?? "OpenAI request failed.";
        }
        catch { }
        return $"OpenAI request failed (HTTP {status}).";
    }
}
