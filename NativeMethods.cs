using System.Runtime.InteropServices;

namespace HoiClicky;

internal static class NativeMethods
{
    [DllImport("user32.dll", SetLastError = true)] internal static extern bool RegisterHotKey(IntPtr hWnd, int id, uint modifiers, uint virtualKey);
    [DllImport("user32.dll", SetLastError = true)] internal static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    [DllImport("user32.dll")] internal static extern bool GetCursorPos(out Point point);
    [StructLayout(LayoutKind.Sequential)] internal struct Point { public int X; public int Y; }
}
