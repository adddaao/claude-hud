import termSize from 'term-size';

export const UNKNOWN_TERMINAL_WIDTH = null;

export function getTerminalWidth(): number | null {
  // term-size reads COLUMNS internally, which may be stale/wrong in
  // statusline context (stty size </dev/tty can fail).  Temporarily
  // clear it so term-size falls back to ioctl on /dev/tty, which
  // returns the real terminal width even when stdin is piped.
  const saved = process.env.COLUMNS;
  delete process.env.COLUMNS;
  try {
    const size = termSize();
    return size.columns > 0 ? size.columns : null;
  } catch {
    return null;
  } finally {
    if (saved !== undefined) process.env.COLUMNS = saved;
  }
}

// Returns a progress bar width scaled to the current terminal width.
// Wide (>=100): 10, Medium (60-99): 6, Narrow (<60): 4.
export function getAdaptiveBarWidth(): number {
  const cols = getTerminalWidth();

  if (cols !== null) {
    if (cols >= 100) return 10;
    if (cols >= 60) return 6;
    return 4;
  }
  return 10;
}
