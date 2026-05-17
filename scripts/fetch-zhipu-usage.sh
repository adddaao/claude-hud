#!/bin/bash
# Fetch ZhipuAI usage quota and write to claude-hud external snapshot
# Called by PreToolUse hook to keep usage data fresh
#
# Required env: ZHIPU_API_KEY (set via /zhipu-usage:setup)
# Optional env: ZHIPU_API_URL (default: https://api.z.ai/api/monitor/usage/quota/limit)

set -euo pipefail

SNAPSHOT_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/usage-snapshot.json"
API_KEY="${ZHIPU_API_KEY:-}"
API_URL="${ZHIPU_API_URL:-https://api.z.ai/api/monitor/usage/quota/limit}"

if [ -z "$API_KEY" ]; then
  exit 0
fi

response=$(curl -sf --max-time 10 \
  -H "Authorization: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -H "Accept-Language: en-US,en" \
  "$API_URL" 2>/dev/null) || exit 0

if [ -z "$response" ]; then
  exit 0
fi

mkdir -p "$(dirname "$SNAPSHOT_FILE")"

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
