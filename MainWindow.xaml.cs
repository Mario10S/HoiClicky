using System.Windows;
using System.Windows.Interop;
using MessageBox = System.Windows.MessageBox;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxImage = System.Windows.MessageBoxImage;

namespace HoiClicky;

public partial class MainWindow : Window
{
    private const int HotkeyId = 0x4843;
    private const int WmHotkey = 0x0312;
    private HwndSource? _source;
    private bool _busy;

    public MainWindow()
    {
        InitializeComponent();
        ScreenPermission.IsChecked = LocalSettings.Current.AllowScreenCapture;
        MicrophonePermission.IsChecked = LocalSettings.Current.AllowMicrophone;
        OAuthService.CredentialsChanged += UpdateConnection;
        Loaded += (_, _) =>
        {
            _source = (HwndSource)PresentationSource.FromVisual(this)!;
            _source.AddHook(WndProc);
            // MOD_CONTROL | MOD_ALT | MOD_NOREPEAT
            if (!NativeMethods.RegisterHotKey(_source.Handle, HotkeyId, 0x0002 | 0x0001 | 0x4000, 0x20))
                ConnectionStatus.Text = "Ready. The global shortcut is unavailable; use the button instead.";
            UpdateConnection();
        };
        Closed += (_, _) =>
        {
            NativeMethods.UnregisterHotKey(_source?.Handle ?? IntPtr.Zero, HotkeyId);
            OAuthService.CredentialsChanged -= UpdateConnection;
        };
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        if (msg == WmHotkey && wParam.ToInt32() == HotkeyId)
        {
            handled = true;
            OpenQuestion();
        }
        return IntPtr.Zero;
    }

    private void UpdateConnection()
    {
        Dispatcher.Invoke(() =>
        {
            var connected = OAuthService.HasCredentials;
            ConnectionStatus.Text = connected ? $"Connected to ChatGPT ({OAuthService.AccountLabel})." : "Not connected. Sign in to use ChatGPT plan access.";
            ConnectButton.Content = connected ? "Add / reconnect ChatGPT" : "Continue with ChatGPT";
            DisconnectButton.IsEnabled = connected;
            AskButton.IsEnabled = connected && !_busy;
        });
    }

    private async void Connect_Click(object sender, RoutedEventArgs e)
    {
        ConnectButton.IsEnabled = false;
        ConnectionStatus.Text = "Opening secure sign-in in your browser…";
        try { await OAuthService.SignInAsync(); }
        catch (Exception ex) { ConnectionStatus.Text = "Sign-in did not complete: " + ex.Message; }
        finally { ConnectButton.IsEnabled = true; UpdateConnection(); }
    }

    private void Disconnect_Click(object sender, RoutedEventArgs e)
    {
        OAuthService.Disconnect();
        ConnectionStatus.Text = "Disconnected. Local ChatGPT tokens were removed.";
    }

    private void Permission_Changed(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded) return;
        LocalSettings.Current.AllowScreenCapture = ScreenPermission.IsChecked == true;
        LocalSettings.Current.AllowMicrophone = MicrophonePermission.IsChecked == true;
        LocalSettings.Save();
    }

    private void Ask_Click(object sender, RoutedEventArgs e) => OpenQuestion();

    private void OpenQuestion()
    {
        if (_busy) return;
        if (!OAuthService.HasCredentials)
        {
            MessageBox.Show(this, "Connect a ChatGPT account first.", "HoiClicky", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        if (!LocalSettings.Current.AllowScreenCapture)
        {
            MessageBox.Show(this, "Screen capture is disabled in Privacy settings.", "HoiClicky", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }
        var dialog = new AskWindow { Owner = this };
        if (dialog.ShowDialog() != true || string.IsNullOrWhiteSpace(dialog.Question)) return;
        _ = AskAsync(dialog.Question.Trim());
    }

    private async Task AskAsync(string question)
    {
        _busy = true;
        UpdateConnection();
        var response = new ResponseWindow { Owner = this };
        Hide();
        response.SetText("Capturing your screen and asking ChatGPT…");
        try
        {
            // Capture starts only after the user presses Send in AskWindow.
            await Task.Delay(180);
            var screenshot = ScreenCapture.CaptureCursorMonitorJpeg();
            Show();
            response.Show();
            response.SetText("Sending the screenshot and asking ChatGPT...");
            response.SetText(await OpenAiResponses.AskAboutScreenAsync(question, screenshot, response.SetText));
        }
        catch (Exception ex) { response.SetText("HoiClicky could not finish the request.\n\n" + ex.Message); }
        finally { if (!IsVisible) Show(); _busy = false; UpdateConnection(); }
    }
}
