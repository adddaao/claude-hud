import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UNKNOWN_TERMINAL_WIDTH = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.join(__dirname, '..', 'vendor');
const DBG = path.join(os.tmpdir(), 'claude-hud-debug.txt');

function dbg(...msgs: unknown[]): void {
  try { fs.appendFileSync(DBG, msgs.join(' ') + '\n'); } catch {}
}

function execVendorBinary(binaryPath: string, shell: boolean): string {
  return execFileSync(binaryPath, [], {
    encoding: 'utf8',
    shell,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

let psCachedWidth: number | null = null;
let psCachedAt = 0;
const PS_CACHE_TTL = 5000;

function tryPowerShellWidth(): number | null {
  const now = Date.now();
  if (psCachedWidth !== null && now - psCachedAt < PS_CACHE_TTL) return psCachedWidth;

  const script = path.join(VENDOR_DIR, 'windows', 'get-width.ps1');
  try {
    const output = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
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
    dbg('[ps] output=', JSON.stringify(output));
  } catch (e) {
    dbg('[ps] err=', e instanceof Error ? e.message : String(e));
  }
  return null;
}

function tryBashStty(): number | null {
  try {
    const output = execFileSync('bash', ['-c', 'stty size < /dev/tty 2>/dev/null'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const parts = output.split(/\s+/);
    if (parts.length === 2) return parseInt(parts[1], 10);
    dbg('[stty] output=', JSON.stringify(output));
  } catch (e) {
    dbg('[stty] err=', e instanceof Error ? e.message : String(e));
  }
  return null;
}

function tryTputCols(): number | null {
  try {
    const cols = execFileSync('tput', ['cols'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (cols) return parseInt(cols, 10);
  } catch {}
  return null;
}

export function getTerminalWidth(): number | null {
  const { env, stdout, stderr } = process;
  dbg(`--- getTerminalWidth --- COLUMNS=${JSON.stringify(env.COLUMNS)} TERM=${JSON.stringify(env.TERM)} stdout.cols=${stdout?.columns} stderr.cols=${stderr?.columns}`);

  if (stdout?.columns && stdout.rows) { dbg('return stdout.columns'); return stdout.columns; }
  if (stderr?.columns && stderr.rows) { dbg('return stderr.columns'); return stderr.columns; }

  // COLUMNS env var: check early (before platform-specific methods) because
  // when stdout is piped (statusline child process), native detection may
  // return stale or default values while COLUMNS is explicitly set by the
  // parent command to communicate the real terminal width.
  if (env.COLUMNS) {
    const cols = parseInt(env.COLUMNS, 10);
    dbg('[columns] parsed=', cols);
    if (cols > 0) return cols;
  }

  dbg(`platform=${process.platform} entering block`);

  if (process.platform === 'win32') {
    dbg('trying term-size.exe...');
    try {
      const size = execVendorBinary(path.join(VENDOR_DIR, 'windows', 'term-size.exe'), false).split(/\r?\n/);
      dbg('term-size result=', size.length, size[0]);
      if (size.length === 2) return parseInt(size[0], 10);
    } catch (e) { dbg('[term-size] err=', e instanceof Error ? e.message : String(e)); }

    dbg('trying powershell...');
    const psCols = tryPowerShellWidth();
    dbg('ps result=', psCols);
    if (psCols !== null) return psCols;

    dbg('trying stty...');
    const sttyCols = tryBashStty();
    dbg('stty result=', sttyCols);
    if (sttyCols !== null) return sttyCols;

    if (env.TERM) {
      dbg('trying tput...');
      const tputCols = tryTputCols();
      if (tputCols !== null) return tputCols;
    }
  } else {
    if (process.platform === 'darwin') {
      try {
        const size = execVendorBinary(path.join(VENDOR_DIR, 'macos', 'term-size'), true).split(/\r?\n/);
        if (size.length === 2) return parseInt(size[0], 10);
      } catch {}
    }

    try {
      const output = execFileSync('resize', ['-u'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const size = output.match(/\d+/g);
      if (size?.length === 2) return parseInt(size[0], 10);
    } catch {}

    if (env.TERM) {
      const tputCols = tryTputCols();
      if (tputCols !== null) return tputCols;
    }
  }

  dbg('→ null');
  return null;
}

export function getAdaptiveBarWidth(): number {
  const cols = getTerminalWidth();

  if (cols !== null) {
    if (cols >= 100) return 10;
    if (cols >= 60) return 6;
    return 4;
  }
  return 10;
}
