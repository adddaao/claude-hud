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
export function getTerminalWidth() {
    const { env, stdout, stderr } = process;
    // stdout/stderr.columns work when connected to a real terminal
    if (stdout?.columns && stdout.rows)
        return stdout.columns;
    if (stderr?.columns && stderr.rows)
        return stderr.columns;
    // Vendor binaries call ioctl on /dev/tty — reliable even when stdin/stdout are piped
    if (process.platform === 'win32') {
        try {
            const size = execVendorBinary(path.join(VENDOR_DIR, 'windows', 'term-size.exe'), false).split(/\r?\n/);
            if (size.length === 2)
                return parseInt(size[0], 10);
        }
        catch { }
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
        // `resize -u` works even when all file descriptors are redirected (Linux)
        try {
            const output = execFileSync('resize', ['-u'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            const size = output.match(/\d+/g);
            if (size?.length === 2)
                return parseInt(size[0], 10);
        }
        catch { }
        if (env.TERM) {
            try {
                const cols = execFileSync('tput', ['cols'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
                if (cols)
                    return parseInt(cols, 10);
            }
            catch { }
        }
    }
    // COLUMNS env var — unreliable in statusline context (may be stale/wrong)
    if (env.COLUMNS) {
        const cols = parseInt(env.COLUMNS, 10);
        if (cols > 0)
            return cols;
    }
    return null;
}
// Returns a progress bar width scaled to the current terminal width.
// Wide (>=100): 10, Medium (60-99): 6, Narrow (<60): 4.
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