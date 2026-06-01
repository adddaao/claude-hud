---
description: Auto-configure usage display (detects ZhipuAI or DeepSeek from your settings)
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

## Usage Setup

This command auto-detects your provider (ZhipuAI or DeepSeek) from `ANTHROPIC_BASE_URL` and configures usage/balance display in one step.

### Step 1: Detect provider and API key

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

BASE_URL=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_BASE_URL || '')" 2>/dev/null)
API_KEY=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_API_KEY || '')" 2>/dev/null)

echo "Base URL: $BASE_URL"
echo "API key: $([ -n "$API_KEY" ] && echo 'found' || echo 'missing')"
```

**If `API_KEY` is empty**: Stop and tell the user:

> No API key found. Set `ANTHROPIC_API_KEY` in your settings first, then re-run this command.

**If `BASE_URL` is empty or doesn't match any known provider**: Stop and tell the user:

> No recognized provider detected from `ANTHROPIC_BASE_URL`. Currently supported: ZhipuAI (z.ai / bigmodel) and DeepSeek. Make sure your `ANTHROPIC_BASE_URL` is configured in settings, then re-run.

Detect the provider:
- `BASE_URL` contains `deepseek` → DeepSeek (balance display)
- `BASE_URL` contains `z.ai` or `bigmodel` → ZhipuAI (rate-limit % display)

### Step 2: Detect plugin install path

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGIN_DIR=$(ls -d "$CLAUDE_DIR"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1)
echo "Plugin dir: $PLUGIN_DIR"
```

If empty, the plugin is not installed. Ask user to run `/plugin install claude-hud` first, then re-run.

### Step 3: Copy fetch script

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SCRIPT_DEST="$CLAUDE_DIR/plugins/claude-hud"
mkdir -p "$SCRIPT_DEST"

FETCH_SCRIPT=$(ls "$PLUGIN_DIR"scripts/fetch-usage.sh 2>/dev/null || echo "")

if [ -n "$FETCH_SCRIPT" ]; then
  cp "$FETCH_SCRIPT" "$SCRIPT_DEST/fetch-usage.sh"
  chmod +x "$SCRIPT_DEST/fetch-usage.sh"
  echo "OK: fetch script installed"
else
  echo "ERROR: fetch-usage.sh not found in plugin"
  exit 1
fi
```

### Step 4: Test API connection

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ANTHROPIC_API_KEY="$API_KEY" ANTHROPIC_BASE_URL="$BASE_URL" "$CLAUDE_DIR/plugins/claude-hud/fetch-usage.sh"
echo "Exit code: $?"
cat "$CLAUDE_DIR/plugins/claude-hud/usage-snapshot.json" 2>/dev/null || echo "No snapshot written"
```

If exit code is 0 and snapshot file exists, API works. If not, the API key may be wrong — ask user to verify.

### Step 5: Update config.json

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/config.json` (create if missing).
Merge in:

```json
{
  "display": {
    "showUsage": true,
    "usageBarEnabled": true,
    "sevenDayThreshold": 0,
    "externalUsagePath": "<absolute path to usage-snapshot.json>",
    "externalUsageFreshnessMs": 1800000
  }
}
```

Replace `<absolute path>` with the fully expanded path (`$CLAUDE_DIR/plugins/claude-hud/usage-snapshot.json`, no `~`).

### Step 6: Update settings.json

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`.

Add or update the PreToolUse hook — merge with existing hooks, do not replace:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Read|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/fetch-usage.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

If a PreToolUse entry with matcher `Bash|Read|Write|Edit` already exists, append the fetch-usage hook to its `hooks` array if not already present. Remove any old `fetch-zhipu-usage.sh` or `fetch-deepseek-usage.sh` hooks from the same array.

### Step 7: Confirm

Tell the user what was configured based on the detected provider:

**For DeepSeek:**

> DeepSeek balance display configured! Restart Claude Code to apply changes. The HUD will show your account balance (e.g. ¥6.35). DeepSeek provides balance only, not rate-limit percentages.

**For ZhipuAI:**

> ZhipuAI usage display configured! Restart Claude Code to apply changes. The HUD will show 5-hour and 7-day usage bars with your quota level.

**When switching providers**: Just change `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` in settings. The same fetch script auto-detects the new provider — no need to re-run this command.
