export const UNKNOWN_TERMINAL_WIDTH = null;

export function getTerminalWidth(): number | null {
  const { env, stdout, stderr } = process;

  // COLUMNS env var: authoritative source, set by the statusLine bash wrapper
  // via stty size < /dev/tty. Check first because stdout/stderr are piped in
  // the statusline child process and Node.js reports their .columns as undefined.
  if (env.COLUMNS) {
    const cols = parseInt(env.COLUMNS, 10);
    if (cols > 0) return cols;
  }

  if (stdout?.columns) return stdout.columns;
  if (stderr?.columns) return stderr.columns;

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
