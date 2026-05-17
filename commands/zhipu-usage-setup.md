---
description: Configure ZhipuAI usage display in claude-hud
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

## ZhipuAI Usage Setup

This command configures claude-hud to display ZhipuAI (智谱) 5-hour and 7-day usage quotas.

### Step 1: Get API Key

Ask the user for their ZhipuAI API key.

Use AskUserQuestion:
- header: "API Key"
- question: "Enter your ZhipuAI API key (from open.bigmodel.cn):"
- options are not suitable here, use free text input

If the user says skip or cancel, stop here.

### Step 2: Detect Plugin Install Path

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGIN_DIR=$(ls -d "$CLAUDE_DIR"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1)
echo "Plugin dir: $PLUGIN_DIR"
```

If empty, the plugin is not installed. Ask user to run `/plugin install claude-hud` first.

### Step 3: Copy fetch script

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SCRIPT_DEST="$CLAUDE_DIR/plugins/claude-hud"
mkdir -p "$SCRIPT_DEST"

# Find the fetch script from plugin installation
FETCH_SCRIPT=$(ls "$PLUGIN_DIR"scripts/fetch-zhipu-usage.sh 2>/dev/null || echo "")

if [ -n "$FETCH_SCRIPT" ]; then
  cp "$FETCH_SCRIPT" "$SCRIPT_DEST/fetch-zhipu-usage.sh"
  chmod +x "$SCRIPT_DEST/fetch-zhipu-usage.sh"
  echo "Copied fetch script to $SCRIPT_DEST/fetch-zhipu-usage.sh"
else
  echo "ERROR: fetch-zhipu-usage.sh not found in plugin"
  exit 1
fi
```

### Step 4: Test the API connection

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ZHIPU_API_KEY="<user's API key>" "$CLAUDE_DIR/plugins/claude-hud/fetch-zhipu-usage.sh" && cat "$CLAUDE_DIR/plugins/claude-hud/usage-snapshot.json"
```

If this fails, check the API key and ask the user to verify.

### Step 5: Update config.json

Read the existing config at `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/config.json` (create if missing).
Merge in the usage settings:

```json
{
  "display": {
    "showUsage": true,
    "usageBarEnabled": true,
    "sevenDayThreshold": 0,
    "externalUsagePath": "<absolute path to usage-snapshot.json>",
    "externalUsageFreshnessMs": 300000
  }
}
```

Replace `<absolute path>` with `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/usage-snapshot.json` (expanded, no `~`).

### Step 6: Update settings.json

Read the existing settings at `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`.
Merge in:

1. Add `ZHIPU_API_KEY` to `env`:

```json
{
  "env": {
    "ZHIPU_API_KEY": "<user's API key>"
  }
}
```

2. Add or update the `PreToolUse` hook to run the fetch script:

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

**Important**: Merge with existing hooks/env, do not replace. If a PreToolUse hook with the same matcher already exists, append to the hooks array or add alongside existing entries.

### Step 7: Confirm

Tell the user:

> ZhipuAI usage display configured. Restart Claude Code to apply changes.
> The HUD will show 5-hour and 7-day usage bars with your quota level.
