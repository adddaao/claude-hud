import { execSync } from 'node:child_process';
export const UNKNOWN_TERMINAL_WIDTH = null;
// Cache mode.com result for 5 seconds to avoid spawning a process on every render.
let cachedModeCols;
let cachedModeExpiresAt = 0;
const MODE_CACHE_TTL_MS = 5_000;
function parseEnvColumns() {
    const envColumns = Number.parseInt(process.env.COLUMNS ?? '', 10);
    return Number.isFinite(envColumns) && envColumns > 0 ? envColumns : null;
}
function parseStreamColumns(columns) {
    return typeof columns === 'number' && Number.isFinite(columns) && columns > 0
        ? Math.floor(columns)
        : null;
}
function detectViaTput() {
    try {
        const result = execSync('tput cols 2>/dev/null', {
            encoding: 'utf8',
            timeout: 500,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const cols = parseInt(result.trim(), 10);
        if (cols > 0)
            return cols;
    }
    catch {
        // tput not available
    }
    return null;
}
function detectViaStty() {
    try {
        const result = execSync('stty size </dev/tty 2>/dev/null', {
            encoding: 'utf8',
            timeout: 500,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const parts = result.trim().split(/\s+/);
        if (parts.length >= 2) {
            const cols = parseInt(parts[1], 10);
            if (cols > 0)
                return cols;
        }
    }
    catch {
        // stty or /dev/tty not available
    }
    return null;
}
function detectViaModeUncached() {
    if (process.platform !== 'win32')
        return null;
    try {
        const result = execSync('mode.com con', {
            encoding: 'utf8',
            timeout: 500,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        const match = result.match(/Columns:\s+(\d+)/i);
        if (match) {
            const cols = parseInt(match[1], 10);
            if (cols > 0)
                return cols;
        }
    }
    catch {
        // mode.com not available or no console
    }
    return null;
}
function detectViaMode() {
    const now = Date.now();
    if (cachedModeCols !== undefined && now < cachedModeExpiresAt) {
        return cachedModeCols;
    }
    cachedModeCols = detectViaModeUncached();
    cachedModeExpiresAt = now + MODE_CACHE_TTL_MS;
    return cachedModeCols;
}
export function getTerminalWidth(options = {}) {
    const { preferEnv = false, fallback = null } = options;
    const streamCols = parseStreamColumns(process.stdout?.columns)
        ?? parseStreamColumns(process.stderr?.columns);
    const envCols = parseEnvColumns();
    // On Windows, try mode.com detection early — it's more reliable than
    // env/stream columns when running as a headless subprocess. Result is cached
    // to avoid spawning mode.com on every render call.
    const modeCols = process.platform === 'win32' ? detectViaMode() : null;
    if (preferEnv) {
        return envCols
            ?? streamCols
            ?? modeCols
            ?? detectViaTput()
            ?? detectViaStty()
            ?? fallback;
    }
    return streamCols
        ?? envCols
        ?? modeCols
        ?? detectViaTput()
        ?? detectViaStty()
        ?? fallback;
}
// Returns a progress bar width scaled to the current terminal width.
// Wide (>=100): 10, Medium (60-99): 6, Narrow (<60): 4.
export function getAdaptiveBarWidth() {
    const cols = getTerminalWidth({ preferEnv: true });
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