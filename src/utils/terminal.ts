import termSize from 'term-size';

export const UNKNOWN_TERMINAL_WIDTH = null;

function parseEnvColumns(): number | null {
  const envColumns = Number.parseInt(process.env.COLUMNS ?? '', 10);
  return Number.isFinite(envColumns) && envColumns > 0 ? envColumns : null;
}

function parseStreamColumns(columns: unknown): number | null {
  return typeof columns === 'number' && Number.isFinite(columns) && columns > 0
    ? Math.floor(columns)
    : null;
}

function detectViaTermSize(): number | null {
  try {
    const size = termSize();
    return size.columns > 0 ? size.columns : null;
  } catch {
    return null;
  }
}

export function getTerminalWidth(options: { preferEnv?: boolean; fallback?: number | null } = {}): number | null {
  const { preferEnv = false, fallback = null } = options;

  const streamCols = parseStreamColumns(process.stdout?.columns)
    ?? parseStreamColumns(process.stderr?.columns);
  const envCols = parseEnvColumns();
  const termSizeCols = detectViaTermSize();

  if (preferEnv) {
    return envCols
      ?? streamCols
      ?? termSizeCols
      ?? fallback;
  }

  return streamCols
    ?? envCols
    ?? termSizeCols
    ?? fallback;
}

// Returns a progress bar width scaled to the current terminal width.
// Wide (>=100): 10, Medium (60-99): 6, Narrow (<60): 4.
export function getAdaptiveBarWidth(): number {
  const cols = getTerminalWidth({ preferEnv: true });

  if (cols !== null) {
    if (cols >= 100) return 10;
    if (cols >= 60) return 6;
    return 4;
  }
  return 10;
}
