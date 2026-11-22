using System.Reflection;
using System.Windows;
using MessageBox = System.Windows.MessageBox;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxImage = System.Windows.MessageBoxImage;

namespace HoiClicky;

public partial class ResponseWindow : Window
{
    private readonly WindowsSpeech _speech = new();
    public ResponseWindow() => InitializeComponent();
    public void SetText(string text) => Dispatcher.Invoke(() => AnswerText.Text = text);
    private void Speak_Click(object sender, RoutedEventArgs e)
    {
        try { _speech.Speak(AnswerText.Text); }
        catch (Exception ex) { MessageBox.Show(this, "Windows text-to-speech is unavailable: " + ex.Message, "HoiClicky", MessageBoxButton.OK, MessageBoxImage.Information); }
    }
    private void Stop_Click(object sender, RoutedEventArgs e) => _speech.Stop();
    protected override void OnClosed(EventArgs e) { _speech.Stop(); base.OnClosed(e); }
}

internal sealed class WindowsSpeech
{
    private object? _voice;
    public bool IsFinished { get { if(_voice is null)return true; try { dynamic v=_voice; return (int)v.Status.RunningState != 2; } catch { return true; } } }
    public void Speak(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return;
        var type = Type.GetTypeFromProgID("SAPI.SpVoice") ?? throw new InvalidOperationException("No Windows SAPI voice is registered.");
        _voice ??= Activator.CreateInstance(type);
        type.InvokeMember("Speak", BindingFlags.InvokeMethod, null, _voice, [text, 1]); // SVSFlagsAsync
    }
    public void Stop()
    {
        if (_voice is null) return;
        var type = _voice.GetType();
        type.InvokeMember("Speak", BindingFlags.InvokeMethod, null, _voice, ["", 2 | 1]); // purge queued speech
    }
}
