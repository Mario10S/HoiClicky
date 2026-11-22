using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

namespace HoiClicky;

internal static class ScreenCapture
{
    public static byte[] CaptureCursorMonitorJpeg()
    {
        NativeMethods.GetCursorPos(out var cursor);
        var screen = Screen.FromPoint(new Point(cursor.X, cursor.Y));
        var bounds = screen.Bounds;
        using var bitmap = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb);
        using (var graphics = Graphics.FromImage(bitmap))
            graphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
        using var output = new MemoryStream();
        var encoder = ImageCodecInfo.GetImageEncoders().First(x => x.MimeType == "image/jpeg");
        using var parameters = new EncoderParameters(1);
        parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 82L);
        bitmap.Save(output, encoder, parameters);
        return output.ToArray();
    }
}
