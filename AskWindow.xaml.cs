using System.Windows;

namespace HoiClicky;

public partial class AskWindow : Window
{
    public string Question => QuestionBox.Text;
    public AskWindow()
    {
        InitializeComponent();
        Loaded += (_, _) => QuestionBox.Focus();
    }
    private void Send_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(QuestionBox.Text)) { QuestionBox.Focus(); return; }
        DialogResult = true;
    }
}
