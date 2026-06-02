#!/usr/bin/env node
// Fetch usage/balance from the current provider and write to claude-hud snapshot.
// Auto-detects provider from ANTHROPIC_BASE_URL:
//   - deepseek  -> GET /user/balance (shows account balance)
//   - z.ai/bigmodel -> GET /api/monitor/usage/quota/limit (shows rate-limit %)
//
// Also supports standalone mode via DEEPSEEK_API_KEY or ZHIPU_API_KEY.
// Cross-platform: pure Node.js, no bash/curl dependencies.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SNAPSHOT_DIR = path.join(CLAUDE_DIR, 'plugins', 'claude-hud');

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https') ? https : http;
    const req = transport.get(url, { headers, timeout: 10_000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          resolve(body);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function writeSnapshot(filename, snapshot) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(path.join(SNAPSHOT_DIR, filename), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
}

function emptySnapshot() {
  return { five_hour: null, seven_day: null, updated_at: new Date().toISOString(), balance_label: null };
}

async function fetchDeepSeek(apiKey, snapshotFile) {
  const url = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/user/balance';
  const body = await httpGet(url, { Authorization: `Bearer ${apiKey}` });
  if (!body || !body.trim()) return;
  const data = JSON.parse(body);

  const snapshot = emptySnapshot();
  if (data.is_available && Array.isArray(data.balance_infos)) {
    const cny = data.balance_infos.find((b) => b.currency === 'CNY');
    const usd = data.balance_infos.find((b) => b.currency === 'USD');
    const info = cny || usd || data.balance_infos[0];
    if (info) {
      const balance = parseFloat(info.total_balance || '0');
      snapshot.balance_label = info.currency === 'CNY'
        ? `¥${balance.toFixed(2)}`
        : `$${balance.toFixed(2)}`;
    }
  }
  writeSnapshot(snapshotFile, snapshot);
}

async function fetchZhipu(apiKey, snapshotFile) {
  const candidateUrls = process.env.ZHIPU_API_URL
    ? [process.env.ZHIPU_API_URL]
    : [
        'https://api.z.ai/api/monitor/usage/quota/limit',
        'https://open.bigmodel.cn/api/monitor/usage/quota/limit',
      ];
  const headers = {
    Authorization: apiKey,
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US,en',
  };
  let body = '';
  for (const url of candidateUrls) {
    try {
      body = await httpGet(url, headers);
      if (body && body.trim()) break;
    } catch {
      // try next endpoint
    }
  }
  if (!body || !body.trim()) return;
  const data = JSON.parse(body);
  if (data.success === false) throw new Error('API returned success=false');

  const limits = data.data?.limits || [];
  const tokenLimits = limits
    .filter((l) => l.type?.toUpperCase() === 'TOKENS_LIMIT')
    .sort((a, b) => (a.nextResetTime || Infinity) - (b.nextResetTime || Infinity));

  const snapshot = emptySnapshot();
  snapshot.balance_label = data.data?.level || null;

  if (tokenLimits[0]) {
    snapshot.five_hour = {
      used_percentage: Math.round(tokenLimits[0].percentage || 0),
      resets_at: tokenLimits[0].nextResetTime
        ? new Date(tokenLimits[0].nextResetTime).toISOString()
        : null,
    };
  }
  if (tokenLimits[1]) {
    snapshot.seven_day = {
      used_percentage: Math.round(tokenLimits[1].percentage || 0),
      resets_at: tokenLimits[1].nextResetTime
        ? new Date(tokenLimits[1].nextResetTime).toISOString()
        : null,
    };
  }
  writeSnapshot(snapshotFile, snapshot);
}

// Strict hostname matching — avoids false positives where a custom proxy URL
// happens to contain "deepseek" or "bigmodel" as a substring. Only the actual
// provider hostnames (and their subdomains) count.
function detectProviderFromBaseUrl(baseUrl) {
  if (!baseUrl) return null;
  let host;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host) return null;
  if (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')) return 'deepseek';
  if (host === 'api.z.ai' || host.endsWith('.z.ai')) return 'zhipu';
  if (host === 'open.bigmodel.cn' || host.endsWith('.bigmodel.cn')) return 'zhipu';
  return null;
}

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const deepseekKey = process.env.DEEPSEEK_API_KEY || '';
  const zhipuKey = process.env.ZHIPU_API_KEY || '';

  // Unified mode takes precedence: a single ANTHROPIC_API_KEY paired with a
  // known ANTHROPIC_BASE_URL hostname is the source of truth. Standalone keys
  // (DEEPSEEK_API_KEY / ZHIPU_API_KEY) are fallbacks for when unified mode
  // can't detect a provider (e.g. custom proxy URLs).
  if (anthropicKey) {
    const provider = detectProviderFromBaseUrl(process.env.ANTHROPIC_BASE_URL);
    if (provider === 'deepseek') {
      await fetchDeepSeek(anthropicKey, 'usage-snapshot.json');
      return;
    }
    if (provider === 'zhipu') {
      await fetchZhipu(anthropicKey, 'usage-snapshot.json');
      return;
    }
  }

  if (deepseekKey && zhipuKey) {
    process.stderr.write('[claude-hud] Both DEEPSEEK_API_KEY and ZHIPU_API_KEY are set; using DeepSeek. Unset one to resolve the ambiguity.\n');
  }
  if (deepseekKey) {
    await fetchDeepSeek(deepseekKey, 'deepseek-snapshot.json');
    return;
  }
  if (zhipuKey) {
    await fetchZhipu(zhipuKey, 'usage-snapshot.json');
    return;
  }
}

try {
  await main();
} catch {
  process.exit(0);
}
