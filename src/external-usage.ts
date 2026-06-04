import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { HudConfig } from './config.js';
import type { ExternalUsageSnapshot, UsageData } from './types.js';
import { getHudPluginDir } from './claude-config-dir.js';
import { getProviderLabel } from './stdin.js';

const MAX_BALANCE_LABEL_LENGTH = 50;
export const EXTERNAL_USAGE_WRITE_THROTTLE_MS = 30_000;

type ExternalUsageWriteSnapshot = {
  updated_at: string;
  five_hour: {
    used_percentage: number | null;
    resets_at: string | null;
  };
  seven_day: {
    used_percentage: number | null;
    resets_at: string | null;
  };
};

type FileSystemDeps = {
  chmodSync: typeof fs.chmodSync;
  existsSync: typeof fs.existsSync;
  readFileSync: typeof fs.readFileSync;
  renameSync: typeof fs.renameSync;
  rmSync: typeof fs.rmSync;
  statSync: typeof fs.statSync;
  writeFileSync: typeof fs.writeFileSync;
};

const fsDeps: FileSystemDeps = {
  chmodSync: fs.chmodSync,
  existsSync: fs.existsSync,
  readFileSync: fs.readFileSync,
  renameSync: fs.renameSync,
  rmSync: fs.rmSync,
  statSync: fs.statSync,
  writeFileSync: fs.writeFileSync,
};

function parseUsagePercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(Math.min(100, Math.max(0, value)));
}

function sanitizeBalanceLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const sanitized = value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[@-Z\\-_]/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u206A-\u206F]/g, '')
    .trim();

  if (!sanitized) {
    return null;
  }

  if (sanitized.length <= MAX_BALANCE_LABEL_LENGTH) {
    return sanitized;
  }

  return `${sanitized.slice(0, MAX_BALANCE_LABEL_LENGTH - 3)}...`;
}

function parseDateValue(value: unknown): Date | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    const millis = value > 1e12 ? value : value * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function parseUpdatedAt(value: unknown): number | null {
  const date = parseDateValue(value);
  return date ? date.getTime() : null;
}

function snapshotFromUsage(usage: UsageData, now: number): ExternalUsageWriteSnapshot {
  return {
    updated_at: new Date(now).toISOString(),
    five_hour: {
      used_percentage: usage.fiveHour,
      resets_at: usage.fiveHourResetAt?.toISOString() ?? null,
    },
    seven_day: {
      used_percentage: usage.sevenDay,
      resets_at: usage.sevenDayResetAt?.toISOString() ?? null,
    },
  };
}

function comparableSnapshot(snapshot: unknown): Omit<ExternalUsageWriteSnapshot, 'updated_at'> | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }

  const topLevelKeys = Object.keys(snapshot);
  if (
    topLevelKeys.length !== 3
    || !topLevelKeys.includes('updated_at')
    || !topLevelKeys.includes('five_hour')
    || !topLevelKeys.includes('seven_day')
  ) {
    return null;
  }

  const value = snapshot as Record<string, unknown>;
  if (parseUpdatedAt(value.updated_at) === null) {
    return null;
  }

  const fiveHour = comparableWindow(value.five_hour);
  const sevenDay = comparableWindow(value.seven_day);
  if (fiveHour === null || sevenDay === null) {
    return null;
  }

  return {
    five_hour: fiveHour,
    seven_day: sevenDay,
  };
}

function comparableWindow(value: unknown): ExternalUsageWriteSnapshot['five_hour'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const keys = Object.keys(value);
  if (
    keys.length !== 2
    || !keys.includes('used_percentage')
    || !keys.includes('resets_at')
  ) {
    return null;
  }

  const window = value as Record<string, unknown>;
  const usedPercentage = parseUsagePercent(window.used_percentage);
  if (window.used_percentage !== null && usedPercentage === null) {
    return null;
  }

  const resetAt = parseDateValue(window.resets_at);
  if (window.resets_at !== null && resetAt === null) {
    return null;
  }

  return {
    used_percentage: usedPercentage,
    resets_at: resetAt?.toISOString() ?? null,
  };
}

function shouldWriteSnapshot(
  snapshotPath: string,
  nextSnapshot: ExternalUsageWriteSnapshot,
  now: number,
  deps: FileSystemDeps,
): boolean {
  try {
    if (!deps.existsSync(snapshotPath)) {
      return true;
    }

    const stats = deps.statSync(snapshotPath);
    if (now - stats.mtimeMs > EXTERNAL_USAGE_WRITE_THROTTLE_MS) {
      return true;
    }

    const current = JSON.parse(deps.readFileSync(snapshotPath, 'utf8') as string) as unknown;
    return JSON.stringify(comparableSnapshot(current)) !== JSON.stringify(comparableSnapshot(nextSnapshot));
  } catch {
    return true;
  }
}

function resolveSnapshotWritePath(snapshotPath: string): string | null {
  if (!path.isAbsolute(snapshotPath)) {
    return null;
  }

  const parsed = path.parse(snapshotPath);
  if (!parsed.base || parsed.ext.toLowerCase() !== '.json') {
    return null;
  }

  return path.normalize(snapshotPath);
}

function directoryExists(dir: string, deps: FileSystemDeps): boolean {
  try {
    return deps.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

export function writeExternalUsageSnapshot(
  config: HudConfig,
  usage: UsageData | null,
  now = Date.now(),
  deps: FileSystemDeps = fsDeps,
): boolean {
  const snapshotPath = resolveSnapshotWritePath(config.display.externalUsageWritePath);
  if (!snapshotPath || !usage) {
    return false;
  }

  const snapshot = snapshotFromUsage(usage, now);
  const dir = path.dirname(snapshotPath);
  const base = path.basename(snapshotPath);
  const tmpPath = path.join(
    dir,
    `.${base}.${process.pid}.${now}.${Math.random().toString(36).slice(2)}.tmp`,
  );

  try {
    if (!directoryExists(dir, deps)) {
      return false;
    }

    if (!shouldWriteSnapshot(snapshotPath, snapshot, now, deps)) {
      return false;
    }

    deps.writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    deps.renameSync(tmpPath, snapshotPath);
    deps.chmodSync(snapshotPath, 0o600);
    return true;
  } catch {
    try {
      deps.rmSync(tmpPath, { force: true });
    } catch {
      // Ignore cleanup errors; snapshot writes must not break rendering.
    }
    return false;
  }
}

/**
 * Auto-resolve snapshot path for non-Anthropic providers.
 * Tries default locations written by fetch-usage scripts for DeepSeek/Zhipu.
 *
 * Snapshot file naming follows fetch-usage behavior:
 *   - Unified mode (ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL) → usage-snapshot.json
 *   - Standalone DeepSeek (DEEPSEEK_API_KEY only)          → deepseek-snapshot.json
 *   - Standalone Zhipu (ZHIPU_API_KEY only)                → usage-snapshot.json
 */
function resolveAutoSnapshotPath(stdin?: import('./types.js').StdinData): string | null {
  const provider = stdin ? getProviderLabel(stdin) : null;
  if (!provider || provider === 'Bedrock' || provider === 'Vertex' || provider === 'Enterprise') {
    return null;
  }

  const snapshotDir = getHudPluginDir(os.homedir());
  const hasUnifiedKey = Boolean(process.env.ANTHROPIC_API_KEY);

  // In standalone DeepSeek mode, fetch-usage writes to deepseek-snapshot.json
  // so it must be tried first. Otherwise usage-snapshot.json is the canonical name.
  const candidates = (!hasUnifiedKey && provider === 'DeepSeek')
    ? [
        path.join(snapshotDir, 'deepseek-snapshot.json'),
        path.join(snapshotDir, 'usage-snapshot.json'),
      ]
    : [
        path.join(snapshotDir, 'usage-snapshot.json'),
        path.join(snapshotDir, 'deepseek-snapshot.json'),
      ];

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // File doesn't exist, try next
    }
  }
  return null;
}

export function getUsageFromExternalSnapshot(
  config: HudConfig,
  now = Date.now(),
  stdin?: import('./types.js').StdinData,
): UsageData | null {
  // For non-Anthropic providers (cc-switch), prefer auto-resolved snapshot
  // over a possibly stale configured path (e.g. user switched from Anthropic
  // to DeepSeek standalone mode — fetch-usage now writes a different file).
  const provider = stdin ? getProviderLabel(stdin) : null;
  const isThirdParty = provider != null && provider !== 'Bedrock' && provider !== 'Vertex' && provider !== 'Enterprise';

  let snapshotPath = '';
  if (isThirdParty) {
    snapshotPath = resolveAutoSnapshotPath(stdin) ?? config.display.externalUsagePath;
  } else {
    snapshotPath = config.display.externalUsagePath;
  }

  if (!snapshotPath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(snapshotPath, 'utf8');
    const parsed = JSON.parse(raw) as ExternalUsageSnapshot;
    const updatedAt = parseUpdatedAt(parsed.updated_at);
    if (updatedAt === null) {
      return null;
    }

    const freshnessMs = config.display.externalUsageFreshnessMs;
    const stale = now - updatedAt > freshnessMs;

    const fiveHour = parseUsagePercent(parsed.five_hour?.used_percentage);
    const sevenDay = parseUsagePercent(parsed.seven_day?.used_percentage);
    const balanceLabel = sanitizeBalanceLabel(parsed.balance_label);
    if (fiveHour === null && sevenDay === null && balanceLabel === null) {
      return null;
    }

    const fiveHourResetAt = parseDateValue(parsed.five_hour?.resets_at);
    const sevenDayResetAt = parseDateValue(parsed.seven_day?.resets_at);

    if (parsed.five_hour && parsed.five_hour.resets_at != null && fiveHourResetAt === null) {
      return null;
    }
    if (parsed.seven_day && parsed.seven_day.resets_at != null && sevenDayResetAt === null) {
      return null;
    }

    const usage: UsageData = {
      fiveHour,
      sevenDay,
      fiveHourResetAt,
      sevenDayResetAt,
    };
    if (balanceLabel !== null) {
      usage.balanceLabel = balanceLabel;
    }
    if (stale) {
      usage.stale = true;
    }
    return usage;
  } catch {
    return null;
  }
}

// Auto-refresh: when the snapshot is stale, spawn fetch-usage.js in the
// background so the balance updates without waiting for a tool-call hook.
// Throttled to at most once per REFRESH_COOLDOWN_MS via a state file.

const REFRESH_COOLDOWN_MS = 60_000;

let refreshScheduled = false;

export function triggerRefreshIfStale(
  config: HudConfig,
  now = Date.now(),
): void {
  if (refreshScheduled) return;
  if (!config.display.externalUsagePath && !config.display.externalUsageFreshnessMs) return;

  const statePath = path.join(os.tmpdir(), 'claude-hud-last-refresh');
  try {
    const last = parseInt(fs.readFileSync(statePath, 'utf8'), 10);
    if (!Number.isNaN(last) && now - last < REFRESH_COOLDOWN_MS) return;
  } catch {}

  refreshScheduled = true;

  try {
    fs.writeFileSync(statePath, String(now));
  } catch {}

  const scriptDir = getHudPluginDir(os.homedir());
  const fetchScript = path.join(scriptDir, 'fetch-usage.js');
  try {
    if (fs.existsSync(fetchScript)) {
      const child = spawn(process.execPath, [fetchScript], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      child.unref();
    }
  } catch {}
}
