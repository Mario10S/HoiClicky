using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.IO;

namespace HoiClicky;

internal static class DpapiStore
{
    private static readonly string FilePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HoiClicky", "credentials.dpapi");
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("HoiClicky.SignInWithChatGPT.v1");

    public static void Write(string value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        var protectedBytes = Protect(Encoding.UTF8.GetBytes(value));
        var temp = FilePath + ".tmp";
        File.WriteAllBytes(temp, protectedBytes);
        File.Move(temp, FilePath, true);
        CryptographicOperations.ZeroMemory(protectedBytes);
    }

    public static string? Read()
    {
        if (!File.Exists(FilePath)) return null;
        var encrypted = File.ReadAllBytes(FilePath);
        var clear = Unprotect(encrypted);
        try { return Encoding.UTF8.GetString(clear); }
        finally { CryptographicOperations.ZeroMemory(clear); CryptographicOperations.ZeroMemory(encrypted); }
    }

    public static void Delete()
    {
        if (File.Exists(FilePath)) File.Delete(FilePath);
    }

    private static byte[] Protect(byte[] input) => Transform(input, true);
    private static byte[] Unprotect(byte[] input) => Transform(input, false);

    private static byte[] Transform(byte[] input, bool protect)
    {
        var inputPtr = Marshal.AllocHGlobal(input.Length);
        var entropyPtr = Marshal.AllocHGlobal(Entropy.Length);
        try
        {
            Marshal.Copy(input, 0, inputPtr, input.Length);
            Marshal.Copy(Entropy, 0, entropyPtr, Entropy.Length);
            var source = new DataBlob { Size = input.Length, Data = inputPtr };
            var entropy = new DataBlob { Size = Entropy.Length, Data = entropyPtr };
            DataBlob output;
            var success = protect
                ? CryptProtectData(ref source, "HoiClicky credentials", ref entropy, IntPtr.Zero, IntPtr.Zero, 0, out output)
                : CryptUnprotectData(ref source, IntPtr.Zero, ref entropy, IntPtr.Zero, IntPtr.Zero, 0, out output);
            if (!success) throw new CryptographicException(Marshal.GetLastWin32Error());
            try
            {
                var result = new byte[output.Size];
                Marshal.Copy(output.Data, result, 0, output.Size);
                return result;
            }
            finally { LocalFree(output.Data); }
        }
        finally { Marshal.FreeHGlobal(inputPtr); Marshal.FreeHGlobal(entropyPtr); }
    }

    [StructLayout(LayoutKind.Sequential)] private struct DataBlob { public int Size; public IntPtr Data; }
    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool CryptProtectData(ref DataBlob input, string description, ref DataBlob entropy, IntPtr reserved, IntPtr prompt, int flags, out DataBlob output);
    [DllImport("crypt32.dll", SetLastError = true)] private static extern bool CryptUnprotectData(ref DataBlob input, IntPtr description, ref DataBlob entropy, IntPtr reserved, IntPtr prompt, int flags, out DataBlob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
}
