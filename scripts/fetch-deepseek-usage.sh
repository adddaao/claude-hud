#!/bin/bash
# Fetch DeepSeek account balance and write to claude-hud external snapshot
# Called by PreToolUse hook to keep usage data fresh
#
# Required env: DEEPSEEK_API_KEY (set via /deepseek-usage:setup)

set -euo pipefail

SNAPSHOT_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/deepseek-snapshot.json"
API_KEY="${DEEPSEEK_API_KEY:-}"
API_URL="${DEEPSEEK_API_URL:-https://api.deepseek.com/user/balance}"

if [ -z "$API_KEY" ]; then
  exit 0
fi

response=$(curl -sf --max-time 10 \
  -H "Authorization: Bearer ${API_KEY}" \
  "$API_URL" 2>/dev/null) || exit 0

if [ -z "$response" ]; then
  exit 0
fi

mkdir -p "$(dirname "$SNAPSHOT_FILE")"

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
    if (info.currency === 'CNY') {
      snapshot.balance_label = '¥' + balance.toFixed(2);
    } else {
      snapshot.balance_label = '$' + balance.toFixed(2);
    }
  }
}

require('fs').writeFileSync('$SNAPSHOT_FILE', JSON.stringify(snapshot, null, 2));
" <<< "$response"
