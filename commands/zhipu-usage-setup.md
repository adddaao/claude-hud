---
description: Configure ZhipuAI usage display in claude-hud (auto-detect API key)
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

## ZhipuAI Usage Setup

This command auto-detects ZhipuAI configuration and sets up usage display in one step.

### Step 1: Auto-detect ZhipuAI

Check if the user is using ZhipuAI by reading settings:

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

# Detect ZhipuAI from ANTHROPIC_BASE_URL
BASE_URL=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_BASE_URL || '')" 2>/dev/null)
echo "Base URL: $BASE_URL"

# Get API key (reuse ANTHROPIC_API_KEY for ZhipuAI usage API)
API_KEY=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_API_KEY || '')" 2>/dev/null)
echo "API key found: $([ -n "$API_KEY" ] && echo 'yes' || echo 'no')"
```

**If `BASE_URL` does NOT contain `bigmodel` or `z.ai`**: This setup only applies to ZhipuAI users. Tell the user this command is for ZhipuAI accounts and stop.

**If `API_KEY` is empty**: Fall back to asking the user. Use AskUserQuestion:
- header: "API Key"
- question: "No ANTHROPIC_API_KEY found in settings. Enter your ZhipuAI API key:"
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

FETCH_SCRIPT=$(ls "$PLUGIN_DIR"scripts/fetch-zhipu-usage.sh 2>/dev/null || echo "")

if [ -n "$FETCH_SCRIPT" ]; then
  cp "$FETCH_SCRIPT" "$SCRIPT_DEST/fetch-zhipu-usage.sh"
  chmod +x "$SCRIPT_DEST/fetch-zhipu-usage.sh"
  echo "OK: fetch script installed"
else
  echo "ERROR: fetch-zhipu-usage.sh not found in plugin"
  exit 1
fi
```

### Step 4: Test the API connection

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ZHIPU_API_KEY="$API_KEY" "$CLAUDE_DIR/plugins/claude-hud/fetch-zhipu-usage.sh" && echo "OK: API connected" && cat "$CLAUDE_DIR/plugins/claude-hud/usage-snapshot.json"
```

If this fails, the API key may be wrong. Ask the user to verify.

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

Replace `<absolute path>` with the fully expanded path (use `$CLAUDE_DIR/plugins/claude-hud/usage-snapshot.json`, no `~`).

### Step 6: Update settings.json

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`.

1. **Ensure `ZHIPU_API_KEY` is in `env`** — if `ANTHROPIC_API_KEY` is already set, add `ZHIPU_API_KEY` with the same value. Merge with existing env, do not replace.

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
            "command": "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/fetch-zhipu-usage.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

If a PreToolUse entry with matcher `Bash|Read|Write|Edit` already exists, check if the fetch script hook is already in its `hooks` array. If not, append it. If the matcher doesn't exist, add the full entry.

### Step 7: Confirm

> ZhipuAI usage display configured! Restart Claude Code to apply changes. The HUD will show 5-hour and 7-day usage bars with your quota level.
