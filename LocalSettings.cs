using System.Text.Json;
using System.IO;

namespace HoiClicky;

internal sealed class LocalSettings
{
    private static readonly string DirectoryPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HoiClicky");
    private static readonly string SettingsPath = Path.Combine(DirectoryPath, "settings.json");
    public static LocalSettings Current { get; private set; } = Load();

    public string HostId { get; set; } = "urn:uuid:" + Guid.NewGuid().ToString();
    public string? IssuedClientId { get; set; }
    public bool AllowScreenCapture { get; set; } = true;
    // "all" captures every monitor for screen questions, "cursor" only the monitor under the mouse pointer.
    public string ScreenScope { get; set; } = "all";
    public bool AllowMicrophone { get; set; }
    // Hands-free "Hey Clicky" listening; off until the user turns it on.
    public bool WakeWord { get; set; }
    // Languages speech recognition may use (Whisper codes); everything else is ignored. German and English by default.
    public string[] SpeechLanguages { get; set; } = ["de", "en"];
    public static readonly string[] SupportedSpeechLanguages = ["de", "en", "fr", "es", "it", "pt", "nl", "pl", "tr", "sq", "hr", "sr", "bs", "ru", "uk", "ar"];
    // Software microphone gain for all speech features, 0.5 to 8.
    public double MicGain { get; set; } = 1.0;
    public string? Provider { get; set; }
    public string? Model { get; set; }
    public int TalkKey1 { get; set; } = 162;
    public int TalkKey2 { get; set; } = 164;
    public bool ReadAloud { get; set; }
    public string AgentApproval { get; set; } = "ask";
    public string[] AgentTools { get; set; } = ["files", "commands", "desktop", "web"];
    public string? AgentWorkspace { get; set; }

    private static LocalSettings Load()
    {
        try { if (File.Exists(SettingsPath)) return JsonSerializer.Deserialize<LocalSettings>(File.ReadAllText(SettingsPath)) ?? new(); }
        catch { }
        return new();
    }

    public static void Save()
    {
        Directory.CreateDirectory(DirectoryPath);
        var temp = SettingsPath + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(Current, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temp, SettingsPath, true);
    }
}
