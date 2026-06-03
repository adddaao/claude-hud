---
description: Auto-configure usage display (detects ZhipuAI or DeepSeek from your settings)
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

## Usage Setup

This command auto-detects your provider (ZhipuAI or DeepSeek) from `ANTHROPIC_BASE_URL` and configures usage/balance display in one step.

### Step 1: Detect provider and API key

**macOS/Linux**:
```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

BASE_URL=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_BASE_URL || '')" 2>/dev/null)
API_KEY=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_API_KEY || '')" 2>/dev/null)

echo "Base URL: $BASE_URL"
echo "API key: $([ -n "$API_KEY" ] && echo 'found' || echo 'missing')"
```

**Windows (PowerShell)**:
```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$settingsPath = Join-Path $claudeDir "settings.json"
$baseUrl = ""
$apiKey = ""
if (Test-Path $settingsPath) {
  try {
    $s = Get-Content $settingsPath -Raw | ConvertFrom-Json
    if ($s.env) {
      $baseUrl = $s.env.ANTHROPIC_BASE_URL ?? ""
      $apiKey = $s.env.ANTHROPIC_API_KEY ?? ""
    }
  } catch {}
}
Write-Host "Base URL: $baseUrl"
Write-Host "API key: $(if ($apiKey) { 'found' } else { 'missing' })"
```

**If `API_KEY` is empty**: Stop and tell the user:

> No API key found. Set `ANTHROPIC_API_KEY` in your settings first, then re-run this command.

**Detect provider by strict hostname match** (avoids false positives from URLs that happen to contain "deepseek" / "bigmodel" / "z.ai" as substrings):

**macOS/Linux**:
```bash
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
echo "Provider: $PROVIDER"
```

**Windows (PowerShell)**:
```powershell
$provider = & node -e "
const u = process.argv[1] || '';
let p = '';
try {
  const h = new URL(u).hostname.toLowerCase();
  if (h === 'api.deepseek.com' || h.endsWith('.deepseek.com')) p = 'deepseek';
  else if (h === 'api.z.ai' || h.endsWith('.z.ai') ||
           h === 'open.bigmodel.cn' || h.endsWith('.bigmodel.cn')) p = 'zhipu';
} catch {}
console.log(p);
" $baseUrl 2>$null
Write-Host "Provider: $provider"
```

**If `BASE_URL` is empty or `PROVIDER` is empty**: Stop and tell the user:

> No recognized provider detected from `ANTHROPIC_BASE_URL`. Currently supported hostnames: `api.deepseek.com` (and subdomains), `api.z.ai` / `open.bigmodel.cn` (and subdomains). Custom proxy URLs containing "deepseek" / "bigmodel" / "z.ai" as substrings will NOT match — set `DEEPSEEK_API_KEY` or `ZHIPU_API_KEY` instead if you want standalone mode, or point `ANTHROPIC_BASE_URL` directly at the provider.

**Conflict check**:

Unified mode (ANTHROPIC_API_KEY + hostname match) takes precedence over standalone DEEPSEEK_API_KEY / ZHIPU_API_KEY. Standalone keys are fallback only.

- If `PROVIDER` is detected AND `ANTHROPIC_API_KEY` starts with `sk-ant-` → URL/key mismatch. Ask the user to fix `settings.json` before re-running.
- If `PROVIDER` is detected AND a stale standalone key (DEEPSEEK_API_KEY / ZHIPU_API_KEY) is also set → unified mode wins; the standalone key is unused. Tell the user it can be removed so a single key is the source of truth.
- If `PROVIDER` is empty AND both `DEEPSEEK_API_KEY` and `ZHIPU_API_KEY` are set → conflict. Ask the user which to keep and remove the other.

### Step 2: Detect plugin install path

**macOS/Linux**:
```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGIN_DIR=$(ls -d "$CLAUDE_DIR"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1)
echo "Plugin dir: $PLUGIN_DIR"
```

**Windows (PowerShell)**:
```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$pluginDir = (Get-ChildItem (Join-Path $claudeDir "plugins\cache\*\claude-hud\*") -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^\d+(\.\d+)+$' } |
    Sort-Object { [version]$_.Name } -Descending |
    Select-Object -First 1).FullName
Write-Host "Plugin dir: $pluginDir"
```

If empty, the plugin is not installed. Ask user to run `/plugin install claude-hud` first, then re-run.

### Step 3: Copy fetch script

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SCRIPT_DEST="$CLAUDE_DIR/plugins/claude-hud"
mkdir -p "$SCRIPT_DEST"

FETCH_JS="$PLUGIN_DIR/scripts/fetch-usage.js"
if [ -f "$FETCH_JS" ]; then
  cp "$FETCH_JS" "$SCRIPT_DEST/fetch-usage.js"
  echo "OK: fetch script installed"
else
  echo "ERROR: fetch-usage.js not found in plugin"
  exit 1
fi
```

### Step 4: Test API connection

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ANTHROPIC_API_KEY="$API_KEY" ANTHROPIC_BASE_URL="$BASE_URL" node "$CLAUDE_DIR/plugins/claude-hud/fetch-usage.js"
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

**macOS/Linux**: Replace `<absolute path>` with `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/usage-snapshot.json` (no `~`).

**Windows (PowerShell)**: Replace `<absolute path>` with `Join-Path $claudeDir "plugins\claude-hud\usage-snapshot.json"` (fully expanded, no `~`).

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
            "command": "node ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/fetch-usage.js",
            "async": true
          }
        ]
      }
    ]
  }
}
```

If a PreToolUse entry with matcher `Bash|Read|Write|Edit` already exists, append the fetch-usage hook to its `hooks` array if not already present. Remove any old `fetch-zhipu-usage.sh`, `fetch-deepseek-usage.sh`, or `fetch-usage.sh` hooks from the same array.

### Step 7: Confirm

Tell the user what was configured based on the detected provider:

**For DeepSeek:**

> DeepSeek balance display configured! Restart Claude Code to apply changes. The HUD will show your account balance (e.g. ¥6.35). DeepSeek provides balance only, not rate-limit percentages.

**For ZhipuAI:**

> ZhipuAI usage display configured! Restart Claude Code to apply changes. The HUD will show 5-hour and 7-day usage bars with your quota level.

**When switching providers**: Just change `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` in settings. The same fetch script auto-detects the new provider — no need to re-run this command.
