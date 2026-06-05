import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
export const UNKNOWN_TERMINAL_WIDTH = null;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.join(__dirname, '..', 'vendor');
function execVendorBinary(binaryPath, shell) {
    return execFileSync(binaryPath, [], {
        encoding: 'utf8',
        shell,
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}
// PowerShell fallback for Windows — uses P/Invoke to open CONOUT$ directly,
// bypassing piped stdout.  Cached for 5s to avoid spawning powershell every call.
let psCachedWidth = null;
let psCachedAt = 0;
const PS_CACHE_TTL = 5000;
function tryPowerShellWidth() {
    const now = Date.now();
    if (psCachedWidth !== null && now - psCachedAt < PS_CACHE_TTL)
        return psCachedWidth;
    try {
        const output = execFileSync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command',
            `
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class CW {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
  static extern IntPtr CreateFile(string lp, uint ga, uint sm, IntPtr sa, uint cd, uint fa, IntPtr ht);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetConsoleScreenBufferInfoEx(IntPtr h, ref CONSOLE_SCREEN_BUFFER_INFOEX i);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential)]
  struct COORD { public short X,Y; }
  [StructLayout(LayoutKind.Sequential)]
  struct SMALL_RECT { public short L,T,R,B; }
  [StructLayout(LayoutKind.Sequential)]
  struct COLORREF { public uint D; }
  [StructLayout(LayoutKind.Sequential)]
  struct CONSOLE_SCREEN_BUFFER_INFOEX {
    public uint cb; public COORD S,C; public ushort A; public SMALL_RECT W;
    public COORD M; public ushort P; public bool F;
    public COLORREF c0,c1,c2,c3,c4,c5,c6,c7,c8,c9,cA,cB,cC,cD,cE,cF;
  }
  public static int Cols() {
    var h = CreateFile("CONOUT$", 0x80000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (h == (IntPtr)(-1)) return 0;
    var inf = new CONSOLE_SCREEN_BUFFER_INFOEX(); inf.cb = (uint)Marshal.SizeOf(inf);
    bool ok = GetConsoleScreenBufferInfoEx(h, ref inf);
    CloseHandle(h);
    return ok ? inf.W.R - inf.W.L + 1 : 0;
  }
}
' -PassThru | Out-Null; [CW]::Cols()
      `.trim(),
        ], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            windowsHide: true,
            timeout: 3000,
        }).trim();
        const cols = parseInt(output, 10);
        if (cols > 0) {
            psCachedWidth = cols;
            psCachedAt = now;
            return cols;
        }
    }
    catch { }
    return null;
}
function tryBashStty() {
    try {
        const output = execFileSync('bash', ['-c', 'stty size < /dev/tty 2>/dev/null'], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
        }).trim();
        const parts = output.split(/\s+/);
        if (parts.length === 2)
            return parseInt(parts[1], 10);
    }
    catch { }
    return null;
}
function tryTputCols() {
    try {
        const cols = execFileSync('tput', ['cols'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (cols)
            return parseInt(cols, 10);
    }
    catch { }
    return null;
}
export function getTerminalWidth() {
    const { env, stdout, stderr } = process;
    if (stdout?.columns && stdout.rows)
        return stdout.columns;
    if (stderr?.columns && stderr.rows)
        return stderr.columns;
    if (process.platform === 'win32') {
        // 1. Native binary — works if console handle is not piped
        try {
            const size = execVendorBinary(path.join(VENDOR_DIR, 'windows', 'term-size.exe'), false).split(/\r?\n/);
            if (size.length === 2)
                return parseInt(size[0], 10);
        }
        catch { }
        // 2. PowerShell — opens CONOUT$ directly, bypasses piped stdout
        //    Most reliable for PowerShell+Git Bash setup. Cached 5s.
        const psCols = tryPowerShellWidth();
        if (psCols !== null)
            return psCols;
        // 3. Git Bash / MSYS2 — stty via /dev/tty
        const sttyCols = tryBashStty();
        if (sttyCols !== null)
            return sttyCols;
        if (env.TERM) {
            const tputCols = tryTputCols();
            if (tputCols !== null)
                return tputCols;
        }
    }
    else {
        if (process.platform === 'darwin') {
            try {
                const size = execVendorBinary(path.join(VENDOR_DIR, 'macos', 'term-size'), true).split(/\r?\n/);
                if (size.length === 2)
                    return parseInt(size[0], 10);
            }
            catch { }
        }
        try {
            const output = execFileSync('resize', ['-u'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            const size = output.match(/\d+/g);
            if (size?.length === 2)
                return parseInt(size[0], 10);
        }
        catch { }
        if (env.TERM) {
            const tputCols = tryTputCols();
            if (tputCols !== null)
                return tputCols;
        }
    }
    if (env.COLUMNS) {
        const cols = parseInt(env.COLUMNS, 10);
        if (cols > 0)
            return cols;
    }
    return null;
}
export function getAdaptiveBarWidth() {
    const cols = getTerminalWidth();
    if (cols !== null) {
        if (cols >= 100)
            return 10;
        if (cols >= 60)
            return 6;
        return 4;
    }
    return 10;
}
//# sourceMappingURL=terminal.js.map