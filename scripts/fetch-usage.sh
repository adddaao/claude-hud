#!/bin/bash
# Fetch usage/balance from the current provider and write to claude-hud snapshot.
# Auto-detects provider from ANTHROPIC_BASE_URL:
#   - deepseek  → GET /user/balance (shows account balance)
#   - z.ai/bigmodel → GET /api/monitor/usage/quota/limit (shows rate-limit %)
#
# Required env: ANTHROPIC_API_KEY (already in settings for the active provider)

set -euo pipefail

SNAPSHOT_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/usage-snapshot.json"
API_KEY="${ANTHROPIC_API_KEY:-}"
BASE_URL="${ANTHROPIC_BASE_URL:-}"

if [ -z "$API_KEY" ]; then
  exit 0
fi

mkdir -p "$(dirname "$SNAPSHOT_FILE")"

# ── Detect provider (strict hostname match via node URL parser) ──
# Avoids false positives when a custom proxy URL contains "deepseek" /
# "bigmodel" / "z.ai" as a substring without actually being that provider.
PROVIDER=$(node -e "
const u = process.argv[1] || '';
let p = '';
try {
  const h = new URL(u).hostname.toLowerCase();
  if (h === 'api.deepseek.com' || h.endsWith('.deepseek.com')) p = 'deepseek';
  else if (h === 'api.z.ai' || h.endsWith('.z.ai') ||
           h === 'open.bigmodel.cn' || h.endsWith('.bigmodel.cn')) p = 'zhipu';
} catch {}
console.log(p);
" "$BASE_URL" 2>/dev/null || echo "")

if [ "$PROVIDER" = "deepseek" ]; then
  # ── DeepSeek: balance API ──────────────────────────────────────
  API_URL="${DEEPSEEK_API_URL:-https://api.deepseek.com/user/balance}"
  response=$(curl -sf --max-time 10 \
    -H "Authorization: Bearer ${API_KEY}" \
    "$API_URL" 2>/dev/null) || exit 0

  [ -z "$response" ] && exit 0

  node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  const snapshot = {
    five_hour: null,
    seven_day: null,
    updated_at: new Date().toISOString(),
    balance_label: null,
  };
  if (data.is_available && Array.isArray(data.balance_infos)) {
    const cny = data.balance_infos.find(b => b.currency === 'CNY');
    const usd = data.balance_infos.find(b => b.currency === 'USD');
    const info = cny || usd || data.balance_infos[0];
    if (info) {
      const balance = parseFloat(info.total_balance || '0');
      snapshot.balance_label = info.currency === 'CNY'
        ? '¥' + balance.toFixed(2)
        : '$' + balance.toFixed(2);
    }
  }
  require('fs').writeFileSync('$SNAPSHOT_FILE', JSON.stringify(snapshot, null, 2));
  " <<< "$response"

elif [ "$PROVIDER" = "zhipu" ]; then
  # ── ZhipuAI: quota/limit API ───────────────────────────────────
  # Try international endpoint first, fall back to bigmodel.cn (CN mirror).
  # ZHIPU_API_URL overrides both — set it to use a custom endpoint only.
  CANDIDATE_URLS=()
  if [ -n "${ZHIPU_API_URL:-}" ]; then
    CANDIDATE_URLS+=("$ZHIPU_API_URL")
  else
    CANDIDATE_URLS+=("https://api.z.ai/api/monitor/usage/quota/limit")
    CANDIDATE_URLS+=("https://open.bigmodel.cn/api/monitor/usage/quota/limit")
  fi
  response=""
  for url in "${CANDIDATE_URLS[@]}"; do
    response=$(curl -sf --max-time 10 \
      -H "Authorization: ${API_KEY}" \
      -H "Content-Type: application/json" \
      -H "Accept-Language: en-US,en" \
      "$url" 2>/dev/null) && [ -n "$response" ] && break
    response=""
  done

  [ -z "$response" ] && exit 0

  node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
  if (data.success === false) { process.exit(1); }
  const limits = data.data?.limits || [];
  const tokenLimits = limits
    .filter(l => l.type?.toUpperCase() === 'TOKENS_LIMIT')
    .sort((a, b) => (a.nextResetTime || Infinity) - (b.nextResetTime || Infinity));
  const snapshot = {
    five_hour: null,
    seven_day: null,
    updated_at: new Date().toISOString(),
    balance_label: data.data?.level || null,
  };
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
  require('fs').writeFileSync('$SNAPSHOT_FILE', JSON.stringify(snapshot, null, 2));
  " <<< "$response"
fi
