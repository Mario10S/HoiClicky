using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Shapes;
using Rectangle=System.Windows.Shapes.Rectangle;
using Brushes=System.Windows.Media.Brushes;
namespace HoiClicky;
internal sealed class AssistantIsland : Window {
 public AssistantIsland(Action open) : this(open, true) {}
 readonly TextBlock label=new() {Text="hoi / clicky",Foreground=Brushes.White,VerticalAlignment=VerticalAlignment.Center,Margin=new Thickness(10,0,8,0)};
 readonly Rectangle[] bars=Enumerable.Range(0,7).Select(_=>new Rectangle {Width=3,Height=4,Fill=new SolidColorBrush(System.Windows.Media.Color.FromRgb(151,183,255)),Margin=new Thickness(2,0,0,0),VerticalAlignment=VerticalAlignment.Center}).ToArray();
 private AssistantIsland(Action open, bool initialize) {
  Width=250;Height=48;WindowStyle=WindowStyle.None;ResizeMode=ResizeMode.NoResize;AllowsTransparency=true;Background=Brushes.Transparent;Topmost=true;ShowInTaskbar=false;Left=(SystemParameters.WorkArea.Width-Width)/2;Top=SystemParameters.WorkArea.Top+12;
  var row=new StackPanel {Orientation=System.Windows.Controls.Orientation.Horizontal,HorizontalAlignment=System.Windows.HorizontalAlignment.Center}; row.Children.Add(label);foreach(var bar in bars){bar.Width=3;bar.Height=4;bar.Fill=Brushes.LightSteelBlue;bar.Margin=new Thickness(2,0,2,0);row.Children.Add(bar);}
  Content=new Border {Background=new SolidColorBrush(System.Windows.Media.Color.FromRgb(23,28,40)),CornerRadius=new CornerRadius(24),Child=row,BorderBrush=new SolidColorBrush(System.Windows.Media.Color.FromRgb(60,73,99)),BorderThickness=new Thickness(1)};
  MouseLeftButtonUp+=(_,_)=>open();
 }
 public void State(string state) { label.Text=state; Level(0); }
 public void Level(int value) {for(int i=0;i<bars.Length;i++)bars[i].Height=4+(Math.Clamp(value,0,100)/100.0)*23*(1-Math.Abs(i-3)/5.0);}
}
