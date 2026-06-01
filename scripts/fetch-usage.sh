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

# ── Detect provider ──────────────────────────────────────────────
lower_url=$(echo "$BASE_URL" | tr '[:upper:]' '[:lower:]')

if echo "$lower_url" | grep -q 'deepseek'; then
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

elif echo "$lower_url" | grep -qE '(z\.ai|bigmodel)'; then
  # ── ZhipuAI: quota/limit API ───────────────────────────────────
  API_URL="${ZHIPU_API_URL:-https://api.z.ai/api/monitor/usage/quota/limit}"
  response=$(curl -sf --max-time 10 \
    -H "Authorization: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -H "Accept-Language: en-US,en" \
    "$API_URL" 2>/dev/null) || exit 0

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
