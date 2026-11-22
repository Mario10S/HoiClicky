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
    public bool AllowMicrophone { get; set; }
    public string? Model { get; set; }
    public bool ReadAloud { get; set; }

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
