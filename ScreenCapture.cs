using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

namespace HoiClicky;

internal static class ScreenCapture
{
    public static byte[] CaptureCursorMonitorJpeg()
        => CaptureCursorMonitorJpeg(out _);

    public static byte[] CaptureCursorMonitorJpeg(out Rectangle capturedBounds)
    {
        NativeMethods.GetCursorPos(out var cursor);
        var screen = Screen.FromPoint(new Point(cursor.X, cursor.Y));
        var bounds = screen.Bounds;
        capturedBounds = bounds;
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

    // Every monitor in one image (the bounding box of the virtual desktop; gaps stay black).
    // Scaled so the longest side is at most 2600 px; annotation percentages still map onto capturedBounds.
    public static byte[] CaptureAllMonitorsJpeg(out Rectangle capturedBounds)
    {
        var bounds = SystemInformation.VirtualScreen;
        capturedBounds = bounds;
        using var full = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb);
        using (var graphics = Graphics.FromImage(full))
            graphics.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
        var scale = Math.Min(1.0, 2600.0 / Math.Max(bounds.Width, bounds.Height));
        using var scaled = new Bitmap(Math.Max(1, (int)(bounds.Width * scale)), Math.Max(1, (int)(bounds.Height * scale)), PixelFormat.Format24bppRgb);
        using (var graphics = Graphics.FromImage(scaled))
        {
            graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            graphics.DrawImage(full, 0, 0, scaled.Width, scaled.Height);
        }
        using var output = new MemoryStream();
        var encoder = ImageCodecInfo.GetImageEncoders().First(x => x.MimeType == "image/jpeg");
        using var parameters = new EncoderParameters(1);
        parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 82L);
        scaled.Save(output, encoder, parameters);
        return output.ToArray();
    }
}
