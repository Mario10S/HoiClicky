using System.Windows;
using System.Windows.Interop;
using MessageBox=System.Windows.MessageBox;
namespace HoiClicky;
public partial class MainWindow : Window {
 private HwndSource? source;
 private bool busy,listening;
 private readonly VoiceInput voice=new();
 private readonly WindowsSpeech speech=new();
 private AssistantIsland? island;
 private readonly System.Windows.Threading.DispatcherTimer speechTimer=new() { Interval=TimeSpan.FromMilliseconds(250) };
 public MainWindow() {
  InitializeComponent();
  speechTimer.Tick+=(_,_)=> { if(speech.IsFinished){speechTimer.Stop();if(!busy&&!listening)SetState("Ready");} };
  ScreenPermission.IsChecked=LocalSettings.Current.AllowScreenCapture;
  MicrophonePermission.IsChecked=LocalSettings.Current.AllowMicrophone;
  AutoSpeak.IsChecked=LocalSettings.Current.ReadAloud;
  OAuthService.CredentialsChanged+=UpdateConnection;
  Loaded+=async (_,_)=> {
   source=(HwndSource)PresentationSource.FromVisual(this)!;source.AddHook(WndProc);
   var chat=NativeMethods.RegisterHotKey(source.Handle,0x4843,0x4003,0x20);
   var talk=NativeMethods.RegisterHotKey(source.Handle,0x4844,0x4003,0x56);
   if(!chat||!talk)VoiceHint.Text="Some shortcuts are in use. Use the buttons below.";
   island=new AssistantIsland(()=>{Show();WindowState=WindowState.Normal;Activate();QuestionBox.Focus();});island.Show();
   UpdateConnection(); if(OAuthService.HasCredentials)await LoadModels();
  };
  Closed+=(_,_)=>{voice.Dispose();speech.Stop();island?.Close();OAuthService.CredentialsChanged-=UpdateConnection;NativeMethods.UnregisterHotKey(source?.Handle??IntPtr.Zero,0x4843);NativeMethods.UnregisterHotKey(source?.Handle??IntPtr.Zero,0x4844);};
 }
 private IntPtr WndProc(IntPtr h,int msg,IntPtr w,IntPtr l,ref bool handled) {
  if(msg==0x312){handled=true;Show();Activate();if(w.ToInt32()==0x4844)ToggleVoice();else QuestionBox.Focus();}return IntPtr.Zero;
 }
 private void SetState(string text) {StateLabel.Text=text.ToUpperInvariant();island?.State(text);}
 private void UpdateConnection()=>Dispatcher.Invoke(()=> { ConnectionStatus.Text=OAuthService.HasCredentials?"Connected · "+OAuthService.AccountLabel:"Connect your ChatGPT account to start.";DisconnectButton.IsEnabled=OAuthService.HasCredentials&&!busy;AskButton.IsEnabled=OAuthService.HasCredentials&&!busy&&!listening; });
 private async void Connect_Click(object s,RoutedEventArgs e) {
  ConnectButton.IsEnabled=false;
  try{await OAuthService.SignInAsync();UpdateConnection();await LoadModels();}catch(Exception ex){ConnectionStatus.Text=ex.Message;}finally{ConnectButton.IsEnabled=true;}
 }
 private void Disconnect_Click(object s,RoutedEventArgs e){voice.Dispose();speech.Stop();OAuthService.Disconnect();ModelPicker.ItemsSource=null;UpdateConnection();}
 private void Permission_Changed(object s,RoutedEventArgs e){if(!IsLoaded)return;LocalSettings.Current.AllowScreenCapture=ScreenPermission.IsChecked==true;LocalSettings.Current.AllowMicrophone=MicrophonePermission.IsChecked==true;LocalSettings.Current.ReadAloud=AutoSpeak.IsChecked==true;if(!LocalSettings.Current.AllowMicrophone)voice.Stop();LocalSettings.Save();}
 private async Task LoadModels(){try{var models=await OpenAiResponses.ListModelsAsync();ModelPicker.ItemsSource=models;ModelPicker.SelectedValue=LocalSettings.Current.Model;if(ModelPicker.SelectedIndex<0)ModelPicker.SelectedIndex=0;}catch(Exception ex){SetState("Models unavailable");AnswerText.Text=ex.Message;}}
 private async void RefreshModels_Click(object s,RoutedEventArgs e)=>await LoadModels();
 private void Model_Changed(object s,System.Windows.Controls.SelectionChangedEventArgs e){if(ModelPicker.SelectedValue is string slug){LocalSettings.Current.Model=slug;if(IsLoaded)LocalSettings.Save();}}
 private void Voice_Click(object s,RoutedEventArgs e)=>ToggleVoice();
 private async void ToggleVoice(){
  if(listening){voice.Stop();return;}if(busy)return;
  if(!LocalSettings.Current.AllowMicrophone){AnswerText.Text="Enable microphone in Privacy & Voice to use local speech recognition.";return;}
  speech.Stop();listening=true;VoiceButton.Content="■  Finish recording";SetState("Starting microphone");UpdateConnection();
  var transcript="";var failed=false;
  try{await voice.ListenAsync((kind,value)=>Dispatcher.Invoke(()=>{
   if(kind=="ready")SetState("Listening");
   if(kind=="level"&&int.TryParse(value,out var level))island?.Level(level);
   if(kind=="text"){transcript+=(transcript.Length>0?" ":"")+value;QuestionBox.Text=transcript;}
   if(kind=="partial")QuestionBox.Text=transcript+" "+value;
   if(kind=="error"){failed=true;AnswerText.Text="Windows speech: "+value+"\nInstall a Windows speech language pack if no recognizer is available.";}
  }));}catch(Exception ex){failed=true;AnswerText.Text=ex.Message;}
  finally{listening=false;QuestionBox.Text=transcript;VoiceButton.Content="●  Speak";SetState(failed?"Voice unavailable":"Review transcript");UpdateConnection();}
 }
 private void StopSpeech_Click(object s,RoutedEventArgs e){speech.Stop();voice.Stop();SetState("Ready");}
 private async void Ask_Click(object s,RoutedEventArgs e){
  if(busy||listening||string.IsNullOrWhiteSpace(QuestionBox.Text))return;
  if(ModelPicker.SelectedValue is not string model){await LoadModels();return;}
  busy=true;UpdateConnection();SetState("Thinking");speech.Stop();
  try{
   byte[]? image=null;
   if(LocalSettings.Current.AllowScreenCapture){Hide();island?.Hide();await Task.Delay(200);image=ScreenCapture.CaptureCursorMonitorJpeg();Show();island?.Show();}
   AnswerText.Text="Asking "+model+"…";
   var answer=await OpenAiResponses.AskAsync(QuestionBox.Text.Trim(),image,model,text=>Dispatcher.Invoke(()=>AnswerText.Text=text));
   AnswerText.Text=answer;SetState("Ready");
   if(LocalSettings.Current.ReadAloud){SetState("Speaking");speech.Speak(answer);speechTimer.Start();}
  }catch(Exception ex){AnswerText.Text=ex.Message;SetState("Request failed");}
  finally{Show();island?.Show();busy=false;UpdateConnection();}
 }
}
