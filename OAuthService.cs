using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.IO;

namespace HoiClicky;

internal sealed class OAuthCredential
{
    public string ClientId { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Email { get; set; } = "";
    public string IdToken { get; set; } = "";
    public string AccessToken { get; set; } = "";
    public string RefreshToken { get; set; } = "";
    public string[] Scopes { get; set; } = [];
    public DateTimeOffset ExpiresAt { get; set; }
}

internal static class OAuthService
{
    private const string AuthorizeEndpoint = "https://auth.openai.com/api/accounts/authorize";
    private const string TokenEndpoint = "https://auth.openai.com/api/accounts/oauth/token";
    private const string Resource = "https://api.openai.com/v1";
    private const string RedirectUri = "http://127.0.0.1:1455/auth/callback";
    private const string RequiredScope = "chatgpt.tokens.use.direct";
    private const string RequestedScopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
    private static readonly HttpClient Http = new();
    private static OAuthCredential? _credentials = Load();
    public static event Action? CredentialsChanged;
    public static bool HasCredentials => _credentials is not null;
    public static string AccountLabel => _credentials?.Email ?? "signed in";

    public static async Task SignInAsync()
    {
        var registration = _credentials is null || string.IsNullOrWhiteSpace(LocalSettings.Current.IssuedClientId);
        var clientId = registration ? "dynamic_agent_client" : LocalSettings.Current.IssuedClientId!;
        var state = RandomBase64Url(32);
        var nonce = RandomBase64Url(32);
        var verifier = RandomBase64Url(48);
        var challenge = Base64UrlEncode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        using var listener = new HttpListener();
        listener.Prefixes.Add("http://127.0.0.1:1455/auth/");
        listener.Start(); // OpenAI requires the loopback listener to be ready before opening the browser.

        var query = new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["redirect_uri"] = RedirectUri,
            ["response_type"] = "code",
            ["scope"] = RequestedScopes,
            ["resource"] = Resource,
            ["state"] = state,
            ["nonce"] = nonce,
            ["code_challenge_method"] = "S256",
            ["code_challenge"] = challenge,
            ["ext_agent_host_id"] = LocalSettings.Current.HostId
        };
        if (registration) query["agent_name_hint"] = "HoiClicky";
        else if (!string.IsNullOrWhiteSpace(_credentials?.IdToken)) query["id_token_hint"] = _credentials.IdToken;
        var url = AuthorizeEndpoint + "?" + string.Join("&", query.Select(x => Uri.EscapeDataString(x.Key) + "=" + Uri.EscapeDataString(x.Value)));
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(4));
        var context = await listener.GetContextAsync().WaitAsync(timeout.Token);
        var callback = context.Request.Url!;
        var responseText = "HoiClicky sign-in completed. You can close this browser tab.";
        await using (var writer = new StreamWriter(context.Response.OutputStream))
        {
            context.Response.ContentType = "text/plain; charset=utf-8";
            await writer.WriteAsync(responseText);
        }
        context.Response.Close();
        if (callback.AbsolutePath != "/auth/callback") throw new InvalidOperationException("Unexpected sign-in callback path.");
        var values = ParseQuery(callback.Query);
        if (!values.TryGetValue("state", out var returnedState) || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(returnedState), Encoding.UTF8.GetBytes(state)))
            throw new InvalidOperationException("Sign-in state did not match. Please try again.");
        if (!registration && values.TryGetValue("client_id", out var returnedClientId) && returnedClientId != clientId)
            throw new InvalidOperationException("OpenAI returned a different client registration. Please try signing in again.");
        if (values.TryGetValue("error", out var error)) throw new InvalidOperationException(error == "access_denied" ? "Sign-in was cancelled." : "OpenAI returned sign-in error: " + error);
        if (!values.TryGetValue("code", out var code)) throw new InvalidOperationException("OpenAI did not return an authorization code.");

        var issuedClientId = registration ? values.GetValueOrDefault("client_id") : clientId;
        if (string.IsNullOrWhiteSpace(issuedClientId) || issuedClientId == "dynamic_agent_client")
            throw new InvalidOperationException("OpenAI did not finish registering HoiClicky. Try again.");
        var token = await ExchangeCodeAsync(code, verifier, issuedClientId);
        var credential = await ValidateTokenResponseAsync(token, issuedClientId, nonce);
        LocalSettings.Current.IssuedClientId = issuedClientId;
        LocalSettings.Save();
        Save(credential);
    }

    public static async Task<string> GetAccessTokenAsync()
    {
        if (_credentials is null) throw new InvalidOperationException("Connect ChatGPT first.");
        if (!_credentials.Scopes.Contains(RequiredScope, StringComparer.Ordinal))
            throw new InvalidOperationException("ChatGPT plan usage was not granted. Disconnect and sign in again, allowing plan usage.");
        if (_credentials.ExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1)) return _credentials.AccessToken;
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["client_id"] = _credentials.ClientId,
            ["refresh_token"] = _credentials.RefreshToken,
            ["resource"] = Resource
        };
        using var response = await Http.PostAsync(TokenEndpoint, new FormUrlEncodedContent(form));
        var json = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("ChatGPT sign-in expired. Reconnect in Settings.");
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        _credentials.AccessToken = root.GetProperty("access_token").GetString()!;
        _credentials.RefreshToken = root.TryGetProperty("refresh_token", out var rt) ? rt.GetString()! : _credentials.RefreshToken;
        _credentials.ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(root.TryGetProperty("expires_in", out var exp) ? exp.GetInt32() : 3600);
        if (root.TryGetProperty("scope", out var scope)) _credentials.Scopes = scope.GetString()!.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (!_credentials.Scopes.Contains(RequiredScope, StringComparer.Ordinal)) throw new InvalidOperationException("ChatGPT plan permission is missing. Reconnect and allow plan usage.");
        Persist();
        return _credentials.AccessToken;
    }

    public static void Disconnect()
    {
        _credentials = null;
        DpapiStore.Delete();
        LocalSettings.Current.IssuedClientId = null;
        LocalSettings.Save();
        CredentialsChanged?.Invoke();
    }

    private static async Task<string> ExchangeCodeAsync(string code, string verifier, string clientId)
    {
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code", ["client_id"] = clientId, ["code"] = code,
            ["code_verifier"] = verifier, ["redirect_uri"] = RedirectUri, ["resource"] = Resource
        };
        using var response = await Http.PostAsync(TokenEndpoint, new FormUrlEncodedContent(form));
        var json = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException("OpenAI could not exchange the sign-in code. Please sign in again.");
        return json;
    }

    private static async Task<OAuthCredential> ValidateTokenResponseAsync(string json, string clientId, string nonce)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var idToken = root.GetProperty("id_token").GetString()!;
        var claims = await ValidateIdTokenAsync(idToken, clientId, nonce);
        var scopes = root.GetProperty("scope").GetString()!.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (!scopes.Contains(RequiredScope, StringComparer.Ordinal)) throw new InvalidOperationException("Allow ChatGPT plan usage during sign-in to continue.");
        return new OAuthCredential
        {
            ClientId = clientId,
            Subject = claims.GetProperty("sub").GetString() ?? throw new CryptographicException("Account subject is missing."),
            Email = claims.TryGetProperty("email", out var email) ? email.GetString() ?? "ChatGPT account" : "ChatGPT account",
            IdToken = idToken,
            AccessToken = root.GetProperty("access_token").GetString()!,
            RefreshToken = root.GetProperty("refresh_token").GetString()!,
            Scopes = scopes,
            ExpiresAt = DateTimeOffset.UtcNow.AddSeconds(root.TryGetProperty("expires_in", out var expires) ? expires.GetInt32() : 3600)
        };
    }

    private static async Task<JsonElement> ValidateIdTokenAsync(string token, string clientId, string expectedNonce)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) throw new CryptographicException("OpenAI returned a malformed ID token.");
        using var headerDoc = JsonDocument.Parse(Base64UrlDecode(parts[0]));
        using var claimsDoc = JsonDocument.Parse(Base64UrlDecode(parts[1]));
        var header = headerDoc.RootElement;
        var claims = claimsDoc.RootElement;
        var algorithm = header.GetProperty("alg").GetString();
        var keyId = header.TryGetProperty("kid", out var kidNode) ? kidNode.GetString() : null;

        using var httpResponse = await Http.GetAsync("https://auth.openai.com/.well-known/openid-configuration");
        httpResponse.EnsureSuccessStatusCode();
        using var metadata = JsonDocument.Parse(await httpResponse.Content.ReadAsStringAsync());
        var issuer = metadata.RootElement.GetProperty("issuer").GetString();
        var jwksUri = metadata.RootElement.GetProperty("jwks_uri").GetString();
        if (string.IsNullOrWhiteSpace(issuer) || string.IsNullOrWhiteSpace(jwksUri) || !Uri.TryCreate(jwksUri, UriKind.Absolute, out var keysUri) || keysUri.Scheme != Uri.UriSchemeHttps)
            throw new CryptographicException("OpenAI's signing-key metadata was invalid.");

        using var keysResponse = await Http.GetAsync(keysUri);
        keysResponse.EnsureSuccessStatusCode();
        using var keysDoc = JsonDocument.Parse(await keysResponse.Content.ReadAsStringAsync());
        var key = keysDoc.RootElement.GetProperty("keys").EnumerateArray().FirstOrDefault(candidate =>
            (keyId is null || (candidate.TryGetProperty("kid", out var candidateKid) && candidateKid.GetString() == keyId)) &&
            (!candidate.TryGetProperty("use", out var use) || use.GetString() == "sig"));
        if (key.ValueKind != JsonValueKind.Object) throw new CryptographicException("No matching OpenAI signing key was found.");

        var signingInput = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);
        var signature = Base64UrlDecode(parts[2]);
        var validSignature = VerifyJwtSignature(key, algorithm, signingInput, signature);
        if (!validSignature) throw new CryptographicException("OpenAI's ID token signature was invalid.");

        if (claims.GetProperty("iss").GetString() != issuer) throw new CryptographicException("OpenAI's ID token issuer was invalid.");
        var audience = claims.GetProperty("aud");
        var audienceValid = audience.ValueKind == JsonValueKind.String
            ? audience.GetString() == clientId
            : audience.ValueKind == JsonValueKind.Array && audience.EnumerateArray().Any(value => value.GetString() == clientId);
        if (!audienceValid) throw new CryptographicException("OpenAI's ID token audience was invalid.");
        if (!claims.TryGetProperty("exp", out var expiry) || expiry.GetInt64() <= DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            throw new CryptographicException("OpenAI's ID token has expired.");
        if (claims.TryGetProperty("nbf", out var notBefore) && notBefore.GetInt64() > DateTimeOffset.UtcNow.AddMinutes(2).ToUnixTimeSeconds())
            throw new CryptographicException("OpenAI's ID token is not valid yet.");
        if (!claims.TryGetProperty("nonce", out var nonce) || nonce.GetString() != expectedNonce)
            throw new CryptographicException("Sign-in nonce did not match.");
        return claims.Clone();
    }

    private static bool VerifyJwtSignature(JsonElement key, string? algorithm, byte[] data, byte[] signature)
    {
        var keyType = key.GetProperty("kty").GetString();
        if (keyType == "RSA" && algorithm is "RS256" or "PS256")
        {
            using var rsa = RSA.Create();
            rsa.ImportParameters(new RSAParameters
            {
                Modulus = Base64UrlDecode(key.GetProperty("n").GetString()!),
                Exponent = Base64UrlDecode(key.GetProperty("e").GetString()!)
            });
            return rsa.VerifyData(data, signature, HashAlgorithmName.SHA256,
                algorithm == "PS256" ? RSASignaturePadding.Pss : RSASignaturePadding.Pkcs1);
        }
        if (keyType == "EC" && algorithm == "ES256" && key.GetProperty("crv").GetString() == "P-256")
        {
            using var ecdsa = ECDsa.Create(new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = Base64UrlDecode(key.GetProperty("x").GetString()!), Y = Base64UrlDecode(key.GetProperty("y").GetString()!) }
            });
            return ecdsa.VerifyData(data, signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        }
        throw new CryptographicException("OpenAI's ID token used an unsupported signing algorithm.");
    }

    private static OAuthCredential? Load()
    {
        try { var value = DpapiStore.Read(); return value is null ? null : JsonSerializer.Deserialize<OAuthCredential>(value); }
        catch { return null; }
    }
    private static void Save(OAuthCredential value) { _credentials = value; Persist(); CredentialsChanged?.Invoke(); }
    private static void Persist() => DpapiStore.Write(JsonSerializer.Serialize(_credentials));
    private static string RandomBase64Url(int count) => Base64UrlEncode(RandomNumberGenerator.GetBytes(count));
    private static string Base64UrlEncode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    private static byte[] Base64UrlDecode(string value)
    {
        var base64 = value.Replace('-', '+').Replace('_', '/');
        base64 += new string('=', (4 - base64.Length % 4) % 4);
        return Convert.FromBase64String(base64);
    }
    private static Dictionary<string, string> ParseQuery(string query) => query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries).Select(x => x.Split('=', 2)).Where(x => x.Length == 2).ToDictionary(x => Uri.UnescapeDataString(x[0]), x => Uri.UnescapeDataString(x[1].Replace('+', ' ')), StringComparer.Ordinal);
}
