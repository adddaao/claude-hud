# Get console width by opening CONOUT$ directly (bypasses piped stdout)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ConSize {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);

    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetConsoleScreenBufferInfo(IntPtr h, out CSBI info);

    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool CloseHandle(IntPtr h);

    [StructLayout(LayoutKind.Sequential)]
    struct COORD { public short X, Y; }

    [StructLayout(LayoutKind.Sequential)]
    struct SMALL_RECT { public short Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    struct CSBI {
        public COORD Size;
        public COORD Cursor;
        public ushort Attr;
        public SMALL_RECT Window;
        public COORD MaxWin;
    }

    public static int Width() {
        var h = CreateFile("CONOUT$", 0x80000000u, 3u, IntPtr.Zero, 3u, 0u, IntPtr.Zero);
        if (h == new IntPtr(-1)) return 0;
        CSBI i;
        bool ok = GetConsoleScreenBufferInfo(h, out i);
        CloseHandle(h);
        return ok ? i.Window.Right - i.Window.Left + 1 : 0;
    }
}
"@
$r = [ConSize]::Width()
if ($r -gt 0) { Write-Output $r }
