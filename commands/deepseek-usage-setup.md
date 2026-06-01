---
description: Configure DeepSeek usage display in claude-hud (show account balance)
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

## DeepSeek Usage Setup

This command configures claude-hud to display your DeepSeek account balance. DeepSeek provides a balance API (not rate-limit percentages), so the HUD will show your remaining balance instead of usage bars.

### Step 1: Auto-detect DeepSeek

Check if the user is using DeepSeek by reading settings:

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

# Detect DeepSeek from ANTHROPIC_BASE_URL
BASE_URL=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_BASE_URL || '')" 2>/dev/null)
echo "Base URL: $BASE_URL"

# Get API key
API_KEY=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_API_KEY || '')" 2>/dev/null)
echo "API key found: $([ -n "$API_KEY" ] && echo 'yes' || echo 'no')"
```

**If `BASE_URL` does NOT contain `deepseek`**: Ask the user if they still want to set up DeepSeek balance display. If not, stop.

**If `API_KEY` is empty**: Fall back to asking the user. Use AskUserQuestion:
- header: "API Key"
- question: "No ANTHROPIC_API_KEY found in settings. Enter your DeepSeek API key:"
- Options are not suitable, use free text input

### Step 2: Detect Plugin Install Path

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGIN_DIR=$(ls -d "$CLAUDE_DIR"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1)
echo "Plugin dir: $PLUGIN_DIR"
```

If empty, the plugin is not installed. Ask user to run `/plugin install claude-hud` first, then re-run this command.

### Step 3: Copy fetch script

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SCRIPT_DEST="$CLAUDE_DIR/plugins/claude-hud"
mkdir -p "$SCRIPT_DEST"

FETCH_SCRIPT=$(ls "$PLUGIN_DIR"scripts/fetch-deepseek-usage.sh 2>/dev/null || echo "")

if [ -n "$FETCH_SCRIPT" ]; then
  cp "$FETCH_SCRIPT" "$SCRIPT_DEST/fetch-deepseek-usage.sh"
  chmod +x "$SCRIPT_DEST/fetch-deepseek-usage.sh"
  echo "OK: fetch script installed"
else
  echo "ERROR: fetch-deepseek-usage.sh not found in plugin"
  exit 1
fi
```

### Step 4: Test the API connection

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEEPSEEK_API_KEY="$API_KEY" "$CLAUDE_DIR/plugins/claude-hud/fetch-deepseek-usage.sh" && echo "OK: API connected" && cat "$CLAUDE_DIR/plugins/claude-hud/deepseek-snapshot.json"
```

If this fails, the API key may be wrong. Ask the user to verify.

### Step 5: Update config.json

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/config.json` (create if missing).
Merge in:

```json
{
  "display": {
    "showUsage": true,
    "externalUsagePath": "<absolute path to deepseek-snapshot.json>",
    "externalUsageFreshnessMs": 1800000
  }
}
```

Replace `<absolute path>` with the fully expanded path (use `$CLAUDE_DIR/plugins/claude-hud/deepseek-snapshot.json`, no `~`).

### Step 6: Update settings.json

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`.

1. **Ensure `DEEPSEEK_API_KEY` is in `env`** — if `ANTHROPIC_API_KEY` is already set and the base URL contains `deepseek`, add `DEEPSEEK_API_KEY` with the same value. Merge with existing env, do not replace.

2. **Add PreToolUse hook** — add to existing hooks array, do not replace:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Read|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/fetch-deepseek-usage.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

If a PreToolUse entry with matcher `Bash|Read|Write|Edit` already exists, check if the DeepSeek fetch script hook is already in its `hooks` array. If not, append it. If the matcher doesn't exist, add the full entry.

**Important**: If the ZhipuAI fetch hook is also present, keep both — the scripts are independent and write to separate snapshot files. The user switches between them by changing `externalUsagePath` in config.

### Step 7: Confirm

> DeepSeek balance display configured! Restart Claude Code to apply changes. The HUD will show your DeepSeek account balance (e.g. ¥6.35).
>
> Note: DeepSeek only provides balance info, not rate-limit percentages. You'll see your remaining balance instead of usage bars.
