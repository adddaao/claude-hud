---
description: Configure claude-hud as your statusline
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

**Note**: Placeholders like `{RUNTIME_PATH}`, `{SOURCE}`, and `{GENERATED_COMMAND}` should be substituted with actual detected values.

## Step 0: Detect Ghost Installation (Run First)

Check for inconsistent plugin state that can occur after failed installations:

**macOS/Linux**:
```bash
# Check 1: Cache exists?
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CACHE_EXISTS=$(ls -d "$CLAUDE_DIR/plugins/cache"/*/claude-hud 2>/dev/null && echo "YES" || echo "NO")

# Check 2: Registry entry exists?
REGISTRY_EXISTS=$(grep -q "claude-hud" "$CLAUDE_DIR/plugins/installed_plugins.json" 2>/dev/null && echo "YES" || echo "NO")

# Check 3: Temp files left behind?
TEMP_FILES=$(ls -d "$CLAUDE_DIR/plugins/cache/temp_local_"* 2>/dev/null | head -1)

echo "Cache: $CACHE_EXISTS | Registry: $REGISTRY_EXISTS | Temp: ${TEMP_FILES:-none}"
```

**Windows (Git Bash / MSYS2 / Cygwin)**: If Platform is `win32` and Shell is `bash` (or `echo $OSTYPE` returns `msys` or `cygwin`), use the **macOS/Linux** bash commands above. Git Bash provides the same Unix tools (`ls`, `grep`, etc.) and file paths use the same `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` form.

**Windows (PowerShell)** — use only when Shell is `powershell`, `pwsh`, or `cmd` AND `$OSTYPE` is NOT `msys`/`cygwin`:
```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$cache = (Get-ChildItem (Join-Path $claudeDir "plugins\cache") -Directory | ForEach-Object { Test-Path (Join-Path $_.FullName "claude-hud") }) -contains $true
$registry = (Get-Content (Join-Path $claudeDir "plugins\installed_plugins.json") -ErrorAction SilentlyContinue) -match "claude-hud"
$temp = Get-ChildItem (Join-Path $claudeDir "plugins\cache\temp_local_*") -ErrorAction SilentlyContinue
Write-Host "Cache: $cache | Registry: $registry | Temp: $($temp.Count) files"
```

### Interpreting Results

| Cache | Registry | Meaning | Action |
|-------|----------|---------|--------|
| YES | YES | Normal install (may still be broken) | Continue to Step 1 |
| YES | NO | Ghost install - cache orphaned | Clean up cache |
| NO | YES | Ghost install - registry stale | Clean up registry |
| NO | NO | Not installed | Continue to Step 1 |

If **temp files exist**, a previous install was interrupted. Clean them up.

### Cleanup Commands

If ghost installation detected, ask user if they want to reset. If yes:

**macOS/Linux**:
```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

# Remove orphaned cache (handles both direct and marketplace installs)
rm -rf "$CLAUDE_DIR/plugins/cache"/*/claude-hud

# Remove temp files from failed installs
rm -rf "$CLAUDE_DIR/plugins/cache/temp_local_"*

# Reset registry (removes ALL plugins - warn user first!)
# Only run if user confirms they have no other plugins they want to keep:
echo '{"version": 2, "plugins": {}}' > "$CLAUDE_DIR/plugins/installed_plugins.json"
```

**Windows (Git Bash / MSYS2 / Cygwin)**: Use the **macOS/Linux** cleanup commands above — Git Bash provides `rm`, `echo`, etc.

**Windows (PowerShell)** — use only when Shell is `powershell`, `pwsh`, or `cmd` AND `$OSTYPE` is NOT `msys`/`cygwin`:
```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }

# Remove orphaned cache (handles both direct and marketplace installs)
Get-ChildItem (Join-Path $claudeDir "plugins\cache") -Directory | ForEach-Object { Remove-Item -Recurse -Force (Join-Path $_.FullName "claude-hud") -ErrorAction SilentlyContinue }

# Remove temp files
Remove-Item -Recurse -Force (Join-Path $claudeDir "plugins\cache\temp_local_*") -ErrorAction SilentlyContinue

# Reset registry (removes ALL plugins - warn user first!)
'{"version": 2, "plugins": {}}' | Set-Content (Join-Path $claudeDir "plugins\installed_plugins.json")
```

After cleanup, tell user to **restart Claude Code** and run `/plugin install claude-hud` again.

### Linux: Cross-Device Filesystem Check

**On Linux only**, if install keeps failing, check for EXDEV issue:
```bash
[ "$(df --output=source ~ /tmp 2>/dev/null | tail -2 | uniq | wc -l)" = "2" ] && echo "CROSS_DEVICE"
```

If this outputs `CROSS_DEVICE`, `/tmp` and home are on different filesystems. This causes `EXDEV: cross-device link not permitted` during installation. Workaround:
```bash
mkdir -p ~/.cache/tmp && TMPDIR=~/.cache/tmp claude /plugin install claude-hud
```

This is a [Claude Code platform limitation](https://github.com/anthropics/claude-code/issues/14799).

---

## Step 1: Detect Platform, Shell, and Runtime

**IMPORTANT**: Use the environment context values (`Platform:` and `Shell:`) as your starting point. On `win32`, also check `$OSTYPE` via the Bash tool. Some Windows sessions report `Shell: powershell` while the command path exposed to Claude Code is Git Bash/MSYS2. When `$OSTYPE` is `msys` or `cygwin`, the PowerShell command format can fail before PowerShell runs because bash expands `$env:VAR`, `$p`, and `$(...)` expressions first (see [#531](https://github.com/jarrodwatts/claude-hud/issues/531)).

**On `win32`, run this check first:**
```bash
echo $OSTYPE
```

| Platform | Shell | OSTYPE | Command Format |
|----------|-------|--------|----------------|
| `darwin` | any | any | bash (macOS instructions) |
| `linux` | any | any | bash (Linux instructions) |
| `win32` | `bash` | any | bash — Windows + Git Bash instructions |
| `win32` | `powershell`, `pwsh`, or `cmd` | `msys` or `cygwin` | bash — Windows + Git Bash instructions (the active command environment is MSYS/Cygwin; PowerShell syntax is unsafe here) |
| `win32` | `powershell`, `pwsh`, or `cmd` | other / empty | PowerShell — Windows + PowerShell instructions |

---

**macOS/Linux** (Platform: `darwin` or `linux`):

1. Get plugin path (sorted by dotted numeric version, not modification time):
   ```bash
   ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | awk -F/ '{ print $(NF-1) "\t" $(0) }' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+[[:space:]]' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-
   ```
   If empty, the plugin is not installed. Go back to Step 0 to check for ghost installation or EXDEV issues. If Step 0 was clean, ask the user to install via `/plugin install claude-hud` first.

2. Get runtime absolute path:
   - On `darwin` or `linux`, prefer bun for performance and fall back to node:
     ```bash
     command -v bun 2>/dev/null || command -v node 2>/dev/null
     ```
   - On `win32` + `bash`, require node. Do not fall back to bun on Windows:
     ```bash
     command -v node 2>/dev/null
     ```

   If empty, stop setup and explain that the current shell cannot find the required runtime.
   - On **Windows + Git Bash/MSYS2**, explicitly explain that the current Git Bash session could not find Node.js, even if Claude Code itself is installed.
   - If `winget` is available, recommend:
     ```bash
     winget install OpenJS.NodeJS.LTS
     ```
   - On Windows, ask the user to install Node.js LTS from https://nodejs.org/
   - On macOS/Linux, ask the user to install one of these:
     - Node.js LTS from https://nodejs.org/
     - Bun from https://bun.sh/
   - After installation, ask the user to restart their shell and re-run `/claude-hud:setup`.

3. Verify the runtime exists:
   ```bash
   ls -la {RUNTIME_PATH}
   ```
   If it doesn't exist, re-detect or ask user to verify their installation.

4. Determine source file based on runtime:
   - On `darwin` or `linux`, use `src/index.ts` when the runtime is bun. Otherwise use `dist/index.js`.
   - On Windows, always use `dist/index.js`.

5. Generate command (quotes around runtime path handle spaces):

   The command exports `COLUMNS` so the HUD knows the real terminal width.
   Claude Code pipes the subprocess stdout, so `process.stdout.columns` is
   unavailable at runtime. `tput cols` reads the current terminal width
   and works on all platforms (macOS, Linux, Windows Git Bash).
   The `- 4` accounts for Claude Code's input area padding
   (2 columns on each side).

   Avoid `awk '{print $2}'` from `stty size` output — the `$2` gets eaten
   by template processing when setup writes settings.json.

   When a TTY file descriptor is available, `tput` queries it via ioctl
   for the actual terminal size. When no TTY fd exists (piped stdout),
   `tput` falls back to the `COLUMNS` environment variable, and if that
   is unset or zero, to the terminfo default (typically 80 for xterm).
   The `${cols:-120}` fallback handles the case where `tput` fails
   entirely (e.g. missing terminfo entry). On very wide terminals this
   may cause earlier wrapping than necessary; users can set a custom
   `maxWidth` in their HUD config to override.

   The grep pattern uses `[[:space:]]` rather than `\t` to match the tab
   separator emitted by awk. GNU grep (BRE/ERE) does **not** interpret
   `\t` as a tab character — it emits `warning: stray \ before t` and
   treats the pattern as literal `t`, so the regex never matches the awk
   output and `plugin_dir` resolves to an empty string. The runtime then
   exits with `Module not found "src/index.ts"` and no HUD appears.
   Setup verification can hide this because some shells alias `grep` to
   alternatives (e.g. `ugrep`) that *do* expand `\t`, while the actual
   `statusLine` subprocess invokes `/usr/bin/grep`. `[[:space:]]` is a
   POSIX character class supported by both BSD grep (macOS default) and
   GNU grep (Linux default).

   **When runtime is bun** - add `--env-file /dev/null` to prevent Bun from auto-loading project `.env` files:
   ```
   bash -c 'cols=$(tput cols 2>/dev/null); export COLUMNS=$(( ${cols:-120} > 4 ? ${cols:-120} - 4 : 1 )); plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | awk -F/ '"'"'{ print $(NF-1) "\t" $(0) }'"'"' | grep -E '"'"'^[0-9]+\.[0-9]+\.[0-9]+[[:space:]]'"'"' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-); exec "{RUNTIME_PATH}" --env-file /dev/null "${plugin_dir}{SOURCE}"'
   ```

   **When runtime is node**:
   ```
   bash -c 'cols=$(tput cols 2>/dev/null); export COLUMNS=$(( ${cols:-120} > 4 ? ${cols:-120} - 4 : 1 )); plugin_dir=$(ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | awk -F/ '"'"'{ print $(NF-1) "\t" $(0) }'"'"' | grep -E '"'"'^[0-9]+\.[0-9]+\.[0-9]+[[:space:]]'"'"' | sort -t. -k1,1n -k2,2n -k3,3n -k4,4n | tail -1 | cut -f2-); exec "{RUNTIME_PATH}" "${plugin_dir}{SOURCE}"'
   ```

**Windows + Git Bash** (Platform: `win32`, Shell: `bash`):

Do not use PowerShell commands when the shell is bash. Claude Code invokes statusLine commands through bash, which will interpret PowerShell variables like `$env` and `$p` before PowerShell ever sees them.

On Windows require `node` and always use `dist/index.js`.

**Important**: Do **not** reuse the macOS/Linux awk-based command on Windows + Git Bash. The `awk` fragment requires `'"'"'` quoting to nest single quotes inside `bash -c '...'`. After JSON encoding and decoding, this quoting breaks on Windows Git Bash, causing a silent syntax error that prevents the HUD process from starting (see [#326](https://github.com/jarrodwatts/claude-hud/issues/326)).

Instead, use `sort -V` (GNU version sort, included with Git for Windows) which avoids nested single quotes entirely. Also avoid wrapping the generated command in a second `bash -c ...` layer. Claude Code is already invoking the statusline through bash, so the direct shell command lets `exec` replace that shell instead of spawning an extra bash wrapper first. The command still exports `COLUMNS` so the HUD receives the real terminal width, and it uses the marketplace-aware cache glob:

   ```
   cols=$(tput cols 2>/dev/null); export COLUMNS=$(( ${cols:-120} > 4 ? ${cols:-120} - 4 : 1 )); plugin_dir=$(ls -1d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1); exec "{RUNTIME_PATH}" "${plugin_dir}{SOURCE}"
   ```

**Windows + PowerShell** (Platform: `win32`, Shell: `powershell`, `pwsh`, or `cmd`, OSTYPE: other/empty):

> **Before proceeding**: if `echo $OSTYPE` returned `msys` or `cygwin`, use the **Windows + Git Bash** instructions above. In that environment, bash can expand PowerShell variables before PowerShell runs.

1. Get plugin path:
   ```powershell
   $claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
   (Get-ChildItem (Join-Path $claudeDir "plugins\cache\*\claude-hud\*") -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^\d+(\.\d+)+$' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).FullName
   ```
   The trailing `\*` on the cache glob is required. Without it, `Get-ChildItem` returns the `claude-hud` directory itself, whose name does not match the `^\d+(\.\d+)+$` version pattern, so the lookup resolves to `$null` and any subsequent `Join-Path` throws (see [#521](https://github.com/jarrodwatts/claude-hud/issues/521)).

   If empty or errors, the plugin is not installed. Ask the user to install via marketplace first.

2. Get runtime absolute path (require node on Windows):
   ```powershell
   if (Get-Command node -ErrorAction SilentlyContinue) { (Get-Command node).Source } else { Write-Error "Node.js not found" }
   ```

   If node is not found, stop setup and explain that the current PowerShell session cannot find Node.js.
   - If `winget` is available, recommend:
     ```powershell
     winget install OpenJS.NodeJS.LTS
     ```
   - Otherwise ask the user to install Node.js LTS, then restart PowerShell and re-run `/claude-hud:setup`.
   - On Windows, do not offer Bun for statusLine setup. Use Node.js only.

3. Use `dist\index.js`.

4. Write the PowerShell wrapper script.

   Claude Code spawns the statusLine subprocess with no console handle attached. On Windows PowerShell 5.1, that makes `[Console]::WindowWidth` throw `System.IO.IOException: The handle is invalid.`, which halts the script before `node` runs — the HUD shows only "initializing..." and no error reaches any log.

   The wrapper tries three detection methods in order:
   1. `[Console]::WindowWidth` — works when a console handle is present
   2. `$Host.UI.RawUI.WindowSize.Width` — works in some non-interactive sessions
   3. `cmd /c 'mode con'` — reads console buffer info directly, most reliable in headless subprocess
   If none succeed, `COLUMNS` is not set and the Node.js process tries its own detection (including `mode.com con`).
   The macOS/Linux and Windows Git Bash branches sidestep this with `tput cols` and a `${cols:-120}` fallback; the PowerShell equivalent is the multi-method fallback chain above.

   Inline `powershell -Command "..."` strings in `settings.json` make `try/catch` and multi-line control flow awkward because of nested quoting and the `cmd /s /c` rules that wrap the call. A standalone `.ps1` wrapper is the PowerShell equivalent of the macOS/Linux `bash -c '...'` script body — proper control flow, no JSON-string quoting pressure, and a single source of truth that future PS-side fixes can extend.

   The wrapper file at `$claudeDir/plugins/claude-hud/statusline.ps1` should contain:

   ```powershell
   $w = $null
   try { $w = [Console]::WindowWidth } catch {}
   if (-not $w -or $w -le 0) { try { $w = $Host.UI.RawUI.WindowSize.Width } catch {} }
   if (-not $w -or $w -le 0) {
       try {
           $m = cmd /c 'mode con' 2>$null | Out-String
           if ($m -match 'Columns:\s+(\d+)') { $w = [int]$Matches[1] }
       } catch {}
   }
   if ($w -and $w -gt 0) { $env:COLUMNS = [Math]::Max(1, $w - 4) }
   $claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
   $pluginDir = (Get-ChildItem (Join-Path $claudeDir 'plugins\cache\*\claude-hud\*') -Directory -ErrorAction SilentlyContinue |
       Where-Object { $_.Name -match '^\d+(\.\d+)+$' } |
       Sort-Object { [version]$_.Name } -Descending |
       Select-Object -First 1).FullName
   if (-not $pluginDir) { exit 0 }
   & '{RUNTIME_PATH}' (Join-Path $pluginDir 'dist\index.js')
   ```

   Write it using `[System.IO.File]::WriteAllText` with `New-Object System.Text.UTF8Encoding $false` so the file is UTF-8 without a BOM. A script block with `.ToString()` is the cleanest way to embed the body without here-string quoting pressure:

   ```powershell
   $wrapperDir = Join-Path $claudeDir "plugins\claude-hud"
   New-Item -ItemType Directory -Force -Path $wrapperDir | Out-Null
   $wrapperPath = Join-Path $wrapperDir "statusline.ps1"
   $runtimePathLiteral = $runtimePath.Replace("'", "''")
   $wrapperBody = ({
       $w = $null
       try { $w = [Console]::WindowWidth } catch {}
       if (-not $w -or $w -le 0) { try { $w = $Host.UI.RawUI.WindowSize.Width } catch {} }
       if (-not $w -or $w -le 0) {
           try {
               $m = cmd /c 'mode con' 2>$null | Out-String
               if ($m -match 'Columns:\s+(\d+)') { $w = [int]$Matches[1] }
           } catch {}
       }
       if ($w -and $w -gt 0) { $env:COLUMNS = [Math]::Max(1, $w - 4) }
       $claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
       $pluginDir = (Get-ChildItem (Join-Path $claudeDir 'plugins\cache\*\claude-hud\*') -Directory -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -match '^\d+(\.\d+)+$' } |
           Sort-Object { [version]$_.Name } -Descending |
           Select-Object -First 1).FullName
       if (-not $pluginDir) { exit 0 }
       & '__RUNTIME_PATH__' (Join-Path $pluginDir 'dist\index.js')
   }.ToString().Trim()).Replace('__RUNTIME_PATH__', $runtimePathLiteral)
   [System.IO.File]::WriteAllText($wrapperPath, $wrapperBody, (New-Object System.Text.UTF8Encoding $false))
   ```

   `$runtimePath` is the value detected in step 2 (the absolute path returned by `(Get-Command node).Source`, typically `C:\Program Files\nodejs\node.exe`). `$runtimePathLiteral` escapes single quotes for the generated single-quoted PowerShell command, and `.Replace()` performs literal replacement so `$` and other regex replacement characters in the runtime path are preserved.

   `Set-Content -Encoding UTF8` and `Out-File -Encoding UTF8` on Windows PowerShell 5.1 both emit a UTF-8 BOM — PS 7+ added `-Encoding utf8NoBOM`, but PS 5.1 ships as the Windows 10/11 default and does not. `WriteAllText` + `UTF8Encoding $false` writes without a BOM in both versions.

5. Generate command (points at the wrapper file, not an inline `-Command` string):

   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File "{WRAPPER_PATH}"
   ```

   `{WRAPPER_PATH}` is the value of `$wrapperPath` from step 4 (typically `C:\Users\<user>\.claude\plugins\claude-hud\statusline.ps1`).

**WSL (Windows Subsystem for Linux)**: If running in WSL, use the macOS/Linux instructions. Ensure the plugin is installed in the Linux environment (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/...`), not the Windows side.

## Step 2: Test Command

Run the generated command. It should produce output (the HUD lines) within a few seconds.

- If it errors, do not proceed to Step 3.
- If it hangs for more than a few seconds, cancel and debug.
- This test catches issues like broken runtime binaries, missing plugins, or path problems.

## Step 2.5: Detect Existing Statusline and Create Backup

Before writing to `settings.json`, check whether a `statusLine` key already exists and protect the user's current configuration. This covers the existing-statusLine overwrite issue tracked in [#547](https://github.com/jarrodwatts/claude-hud/issues/547).

### 2.5.1: Read the existing statusLine

**macOS/Linux**:
```bash
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
EXISTING_COMMAND=""
EXISTING_COMMAND_PREVIEW=""

if [ -f "$SETTINGS" ]; then
  EXISTING_COMMAND=$("{RUNTIME_PATH}" -e '
const fs = require("fs");
const settingsPath = process.argv[1];

try {
  const text = fs.readFileSync(settingsPath, "utf8");
  if (text.trim() === "") process.exit(0);

  const json = JSON.parse(text);
  const command = json && json.statusLine && typeof json.statusLine.command === "string"
    ? json.statusLine.command
    : "";
  process.stdout.write(command);
} catch (error) {
  console.error("Unable to read statusLine.command from settings.json: " + error.message);
  process.exit(1);
}
' "$SETTINGS") || exit 1

  EXISTING_COMMAND_PREVIEW=$(printf '%s' "$EXISTING_COMMAND" | "{RUNTIME_PATH}" -e '
let value = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { value += chunk; });
process.stdin.on("end", () => {
  const redacted = value
    .replace(/\b(Bearer)\s+["\x27]?[^"\x27\s]+/gi, "$1 [REDACTED]")
    .replace(/\b(Authorization\s*:\s*)["\x27]?[^"\x27\s]+/gi, "$1[REDACTED]")
    .replace(/\b(token|api[_-]?key|secret|password|pass|auth)(=|:)\s*["\x27]?[^"\x27\s]+/gi, "$1$2[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/g, "[GITHUB_TOKEN_REDACTED]")
    .replace(/\s+/g, " ")
    .trim();

  process.stdout.write(redacted.length > 160 ? redacted.slice(0, 157) + "..." : redacted);
});
')
fi
```

**Windows (Git Bash / MSYS2 / Cygwin)**: Use the **macOS/Linux** `{RUNTIME_PATH} -e '...'` script above — Git Bash provides `node` and `printf`. The `$CLAUDE_CONFIG_DIR` / `$HOME` variable expansion works identically.

**Windows (PowerShell)** — use only when Shell is `powershell`, `pwsh`, or `cmd` AND `$OSTYPE` is NOT `msys`/`cygwin`:
```powershell
$settingsPath = if ($env:CLAUDE_CONFIG_DIR) { Join-Path $env:CLAUDE_CONFIG_DIR "settings.json" } else { Join-Path $HOME ".claude\settings.json" }
$existingCommand = ""
$existingCommandPreview = ""
if (Test-Path $settingsPath) {
  try {
    $json = Get-Content $settingsPath -Raw | ConvertFrom-Json
    if ($json.statusLine -and $json.statusLine.command) {
      $existingCommand = $json.statusLine.command
    }
  } catch {
    Write-Error "Unable to read statusLine.command from settings.json: $($_.Exception.Message)"
    throw
  }

  if ($existingCommand -ne "") {
    $existingCommandPreview = $existingCommand `
      -replace "(?i)\b(Bearer)\s+[`"']?[^`"'\s]+", '$1 [REDACTED]' `
      -replace "(?i)\b(Authorization\s*:\s*)[`"']?[^`"'\s]+", '$1[REDACTED]' `
      -replace "(?i)\b(token|api[_-]?key|secret|password|pass|auth)(=|:)\s*[`"']?[^`"'\s]+", '$1$2[REDACTED]' `
      -replace "\bsk-[A-Za-z0-9_-]{8,}\b", 'sk-[REDACTED]' `
      -replace "\bgh[pousr]_[A-Za-z0-9_]{8,}\b", '[GITHUB_TOKEN_REDACTED]' `
      -replace "\s+", " "
    $existingCommandPreview = $existingCommandPreview.Trim()
    if ($existingCommandPreview.Length -gt 160) {
      $existingCommandPreview = $existingCommandPreview.Substring(0, 157) + "..."
    }
  }
}
```

### 2.5.2: Classify the existing statusline

If `EXISTING_COMMAND` / `$existingCommand` is non-empty, classify it:

| Pattern in command | Classification | Source label |
|---|---|---|
| Contains `claude-hud` | **Reinstall** (own config) | `claude-hud` |
| Contains `claude-pace` | **Known project** | `claude-pace` |
| Contains `cc-statusline` or `ccstatusline` | **Known project** | `cc-statusline` |
| Contains `statusline.sh` or `statusline.js` or `statusline.py` | **Likely another statusline** | `statusline script` |
| Any other non-empty value | **Custom script** | `custom` |
| Empty / missing key | **Clean install** | (none) |

### 2.5.3: Create a timestamped backup

**Always** create a backup of `settings.json` before modifying it, regardless of whether a statusline exists. This protects against corruption (see [#315]) and gives users a recovery path.

**macOS/Linux**:
```bash
SETTINGS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
BACKUP_TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH=""
if [ -f "$SETTINGS" ]; then
  BACKUP_PATH="${SETTINGS}.bak.${BACKUP_TIMESTAMP}"
  if cp "$SETTINGS" "$BACKUP_PATH"; then
    echo "Backup created: $BACKUP_PATH"
  else
    echo "Failed to create backup at: $BACKUP_PATH" >&2
    exit 1
  fi
fi
```

**Windows (Git Bash / MSYS2 / Cygwin)**: Use the **macOS/Linux** backup commands above — Git Bash provides `date`, `cp`, and the same variable expansion.

**Windows (PowerShell)** — use only when Shell is `powershell`, `pwsh`, or `cmd` AND `$OSTYPE` is NOT `msys`/`cygwin`:
```powershell
$backupPath = ""
if (Test-Path $settingsPath) {
  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $backupPath = "${settingsPath}.bak.${timestamp}"
  Copy-Item $settingsPath $backupPath -ErrorAction Stop
  Write-Host "Backup created: $backupPath"
}
```

### 2.5.4: Prompt the user if a statusline exists

**If the statusline is empty (clean install)**: Skip this step. Proceed directly to Step 3.

**If the statusline is claude-hud (reinstall)**: Skip this step. The new command replaces the old one — this is an idempotent update. Proceed to Step 3.

**If the statusline belongs to a known project or is a custom script**: Use AskUserQuestion to ask the user what to do.

Use AskUserQuestion:
- header: "Existing statusline detected"
- question: "Found an existing statusLine in settings.json:\n\n  command preview: {REDACTED_COMMAND_PREVIEW}\n  source: {SOURCE_LABEL}\n\nWhat would you like to do?"
- options:
  - "Replace it with claude-hud (your current setup will be backed up)"
  - "Keep my current statusline and exit setup (settings stay unchanged)"
  - "Cancel setup without changing settings"

Set `{REDACTED_COMMAND_PREVIEW}` to `EXISTING_COMMAND_PREVIEW` on macOS/Linux or `$existingCommandPreview` on Windows. Use only the redacted/truncated preview in the prompt and normal output. Do not print the full previous command because it may contain tokens or secrets.

**If the user chooses "Keep" or "Cancel"**: Stop setup. The backup from 2.5.3 is still available if one was created. Tell the user:

> No changes were made to your settings. Your existing statusline is preserved. Setup created no settings mutation apart from the backup file at `{BACKUP_PATH or $backupPath}` if that value is set.

**If the user chooses "Replace"**: Proceed to Step 3. The backup from 2.5.3 ensures the previous configuration can be restored.

### 2.5.5: Save the previous command for potential restoration

Store the previous `statusLine.command` value in a file alongside the settings backup. This makes it easy to restore if the user later wants to switch back.

**macOS/Linux**:
```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
if [ -n "$EXISTING_COMMAND" ]; then
  PREVIOUS_COMMAND_DIR="$CLAUDE_DIR/plugins/claude-hud"
  PREVIOUS_COMMAND_PATH="$PREVIOUS_COMMAND_DIR/previous-statusline.txt"
  mkdir -p "$PREVIOUS_COMMAND_DIR"
  chmod 700 "$PREVIOUS_COMMAND_DIR" 2>/dev/null || true
  if (
    umask 077
    printf '%s' "$EXISTING_COMMAND" > "$PREVIOUS_COMMAND_PATH"
  ); then
    chmod 600 "$PREVIOUS_COMMAND_PATH" 2>/dev/null || true
    echo "Previous statusline command saved to: $PREVIOUS_COMMAND_PATH"
  else
    echo "Failed to save previous statusline command to: $PREVIOUS_COMMAND_PATH" >&2
    exit 1
  fi
fi
```

**Windows (Git Bash / MSYS2 / Cygwin)**: Use the **macOS/Linux** commands above — Git Bash provides `mkdir`, `chmod`, `printf`, etc.

**Windows (PowerShell)** — use only when Shell is `powershell`, `pwsh`, or `cmd` AND `$OSTYPE` is NOT `msys`/`cygwin`:
```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$pluginDir = Join-Path $claudeDir "plugins\claude-hud"
if (-not (Test-Path $pluginDir)) { New-Item -ItemType Directory -Force -Path $pluginDir | Out-Null }
if ($existingCommand -ne "") {
  Set-Content -Path (Join-Path $pluginDir "previous-statusline.txt") -Value $existingCommand -NoNewline
}
```

---

## Step 3: Apply Configuration

Read the settings file and merge in the statusLine config, preserving all existing settings:
- **Platform `darwin` or `linux`, or Platform `win32` + Shell `bash`**: `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json`
- **Platform `win32` + Shell `powershell`, `pwsh`, or `cmd`**: `settings.json` inside `$env:CLAUDE_CONFIG_DIR` when set, otherwise `Join-Path $HOME ".claude"`

If the file doesn't exist, create it. If it contains invalid JSON, report the error and do not overwrite.
If a write fails with `File has been unexpectedly modified`, re-read the file and retry the merge once.

**A timestamped backup was already created in Step 2.5.3.** If Step 2.5.4 prompted the user and they chose "Keep" or "Cancel", do not reach this step — setup has already exited.

```json
{
  "statusLine": {
    "type": "command",
    "command": "{GENERATED_COMMAND}"
  }
}
```

**JSON safety**: Write `settings.json` with a real JSON serializer or editor API, not manual string concatenation.
If you must inspect the saved JSON manually, the embedded bash command must preserve escaped backslashes inside the awk fragment.
For example, the saved JSON should contain `\\$(NF-1)` and `\\$0`, not `\$(NF-1)` and `\$0`.

**Windows PowerShell 5.1 BOM**: on Windows PowerShell 5.1 (the default shell on Windows 10/11), `Set-Content -Encoding UTF8` and `Out-File -Encoding UTF8` emit a UTF-8 BOM (`EF BB BF`). RFC 8259 §8.1 forbids BOM in JSON. PowerShell 7+ added `-Encoding utf8NoBOM`, but PS 5.1 did not. Use `[System.IO.File]::WriteAllText` with `New-Object System.Text.UTF8Encoding $false` to write UTF-8 without a BOM from both PS versions:

```powershell
[System.IO.File]::WriteAllText($path, $json, (New-Object System.Text.UTF8Encoding $false))
```

Verify the first bytes are `7B 0D 0A` (`{` + CRLF) or `7B 0A` (`{` + LF), not `EF BB BF`:

```powershell
[System.IO.File]::ReadAllBytes($path)[0..2]
```


After successfully writing the config, tell the user:

> ✅ Config written. **Please restart Claude Code now** — quit and run `claude` again in your terminal.
> Once restarted, run `/claude-hud:setup` again to complete Step 4 and verify the HUD is working.

**Windows note**: Keep the restart guidance separate from runtime installation guidance.
- If the user just installed Node.js, they should restart their shell first so `node` is available in `PATH`.
- After `statusLine` is written successfully, they should fully quit Claude Code and launch a fresh session before judging whether the HUD setup worked.

**Note**: The generated command dynamically finds and runs the latest installed plugin version. Updates are automatic - no need to re-run setup after plugin updates. If the HUD suddenly stops working, re-run `/claude-hud:setup` to verify the plugin is still installed.

**Restoring a previous statusline**: If the user previously had a different statusline and wants to restore it, use the backup path printed in Step 2.5.3. The previous command is stored in `~/.claude/plugins/claude-hud/previous-statusline.txt`. To restore:
1. Find the most recent backup: `ls -t ~/.claude/settings.json.bak.* | head -1`
2. Copy it back: `cp ~/.claude/settings.json.bak.{timestamp} ~/.claude/settings.json`
3. Restart Claude Code.

## Step 4: Layout & Optional Features

After the statusLine is applied, configure the HUD layout and optional features.

### Step 4a: Layout

Use AskUserQuestion:
- header: "Layout"
- question: "Choose HUD layout?"
- multiSelect: false
- options:
  - "Compact (recommended)" — All info in one dense line: `[Opus] │ project │ Context ██░░ 45% │ Usage ██░░ 25% │ ...`
  - "Expanded" — Multi-line: Line 1 = model+project, Line 2 = context bar, Line 3 = usage bar, etc.
  - "Wrap" — Compact layout that auto-wraps at terminal width

Write `lineLayout` to config based on selection:
| Selection | Config |
|-----------|--------|
| Compact | `lineLayout: "compact"`, `showSeparators: false` |
| Expanded | (defaults, no keys needed) |
| Wrap | `lineLayout: "wrap"`, `showSeparators: false` |

### Step 4b: Optional Features

Use AskUserQuestion:
- header: "Extras"
- question: "Enable any optional HUD features? (all hidden by default)"
- multiSelect: true
- options:
  - "Tools activity" — Shows running/completed tools (◐ Edit: file.ts | ✓ Read ×3)
  - "Agents & Todos" — Shows subagent status and todo progress
  - "Session info" — Shows session duration and config counts (CLAUDE.md, rules, MCPs)
  - "Session name" — Shows session slug or custom title from /rename
  - "Custom line" — Display a custom phrase in the HUD

### Step 4c: Write config.json

**If user selected any options in Step 4a or 4b**, write `plugins/claude-hud/config.json` inside the Claude config directory (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}` on bash, `$env:CLAUDE_CONFIG_DIR` or `Join-Path $HOME ".claude"` on PowerShell). Create directories if needed:

| Selection | Config keys |
|-----------|------------|
| Compact layout | `lineLayout: "compact"`, `showSeparators: false` |
| Tools activity | `display.showTools: true` |
| Agents & Todos | `display.showAgents: true, display.showTodos: true` |
| Session info | `display.showDuration: true, display.showConfigCounts: true` |
| Session name | `display.showSessionName: true` |
| Custom line | `display.customLine: "<user's text>"` — ask user for the text (max 80 chars) |

Merge with existing config if the file already exists. Only write keys the user selected — don't write `false` for unselected items (defaults handle that).

**If user selects nothing** (or picks "Other" and says skip/none), do not create a config file. The defaults are fine.

---

## Step 4.5: Auto-detect Provider Usage Display (Optional)

After writing config, automatically detect the provider from `ANTHROPIC_BASE_URL` and configure usage/balance display.

**macOS/Linux**:
```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SETTINGS="$CLAUDE_DIR/settings.json"

BASE_URL=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_BASE_URL || '')" 2>/dev/null || echo "")
API_KEY=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ANTHROPIC_API_KEY || '')" 2>/dev/null || echo "")
DEEPSEEK_KEY=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.DEEPSEEK_API_KEY || '')" 2>/dev/null || echo "")
ZHIPU_KEY=$(node -e "const s=JSON.parse(require('fs').readFileSync('$SETTINGS','utf8')); console.log(s.env?.ZHIPU_API_KEY || '')" 2>/dev/null || echo "")

# Strict hostname match — avoids false positives from URLs that happen to
# contain "deepseek" / "bigmodel" / "z.ai" as substrings without being that
# provider's actual host.
PROVIDER=$(node -e "
const u = process.argv[1] || '';
let p = 'unknown';
try {
  const h = new URL(u).hostname.toLowerCase();
  if (h === 'api.deepseek.com' || h.endsWith('.deepseek.com')) p = 'deepseek';
  else if (h === 'api.z.ai' || h.endsWith('.z.ai') ||
           h === 'open.bigmodel.cn' || h.endsWith('.bigmodel.cn')) p = 'zhipu';
} catch {}
console.log(p);
" "$BASE_URL" 2>/dev/null || echo "unknown")

echo "Base URL: $BASE_URL"
echo "Provider: $PROVIDER"
echo "API key: $([ -n "$API_KEY" ] && echo 'found' || echo 'missing')"
echo "Standalone DEEPSEEK_API_KEY: $([ -n "$DEEPSEEK_KEY" ] && echo 'found' || echo 'missing')"
echo "Standalone ZHIPU_API_KEY: $([ -n "$ZHIPU_KEY" ] && echo 'found' || echo 'missing')"
```

**Windows (Git Bash / MSYS2 / Cygwin)**: Use the **macOS/Linux** `node -e '...'` script above — Git Bash provides `node`, `cat`, and the same variable expansion. The `$CLAUDE_CONFIG_DIR` and `$HOME` paths work identically.

**Windows (PowerShell)** — use only when Shell is `powershell`, `pwsh`, or `cmd` AND `$OSTYPE` is NOT `msys`/`cygwin`:
```powershell
$claudeDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME ".claude" }
$settingsPath = Join-Path $claudeDir "settings.json"

$baseUrl = ""
$apiKey = ""
$deepseekKey = ""
$zhipuKey = ""
if (Test-Path $settingsPath) {
  try {
    $s = Get-Content $settingsPath -Raw | ConvertFrom-Json
    if ($s.env) {
      $baseUrl = $s.env.ANTHROPIC_BASE_URL ?? ""
      $apiKey = $s.env.ANTHROPIC_API_KEY ?? ""
      $deepseekKey = $s.env.DEEPSEEK_API_KEY ?? ""
      $zhipuKey = $s.env.ZHIPU_API_KEY ?? ""
    }
  } catch {}
}

# Strict hostname match via the node URL parser.
$provider = & node -e "
const u = process.argv[1] || '';
let p = 'unknown';
try {
  const h = new URL(u).hostname.toLowerCase();
  if (h === 'api.deepseek.com' || h.endsWith('.deepseek.com')) p = 'deepseek';
  else if (h === 'api.z.ai' || h.endsWith('.z.ai') ||
           h === 'open.bigmodel.cn' || h.endsWith('.bigmodel.cn')) p = 'zhipu';
} catch {}
console.log(p);
" $baseUrl 2>$null
if (-not $provider) { $provider = 'unknown' }

Write-Host "Base URL: $baseUrl"
Write-Host "Provider: $provider"
Write-Host "API key: $(if ($apiKey) { 'found' } else { 'missing' })"
Write-Host "Standalone DEEPSEEK_API_KEY: $(if ($deepseekKey) { 'found' } else { 'missing' })"
Write-Host "Standalone ZHIPU_API_KEY: $(if ($zhipuKey) { 'found' } else { 'missing' })"
```

### Resolving conflicts

Unified mode (ANTHROPIC_API_KEY + hostname match on ANTHROPIC_BASE_URL) takes precedence over standalone DEEPSEEK_API_KEY / ZHIPU_API_KEY. Standalone keys are fallback only. Run through these checks in order and stop at the first match:

1. **`provider` is `deepseek` or `zhipu`** AND `ANTHROPIC_API_KEY` is present AND `ANTHROPIC_API_KEY` does NOT start with `sk-ant-` → auto-configure unified mode. If a stale standalone key (`DEEPSEEK_API_KEY` / `ZHIPU_API_KEY`) is also set, tell the user:

   > Detected {provider} via ANTHROPIC_BASE_URL — configuring unified usage display. The standalone {DEEPSEEK_API_KEY/ZHIPU_API_KEY} in your settings is unused; consider removing it so a single key is the source of truth.

   Proceed with sub-steps below using `ANTHROPIC_API_KEY` (writes `usage-snapshot.json`).

2. **`provider` is `deepseek` or `zhipu`** but `ANTHROPIC_API_KEY` looks like an Anthropic key (starts with `sk-ant-`) → the URL and key don't match. Tell the user:

   > `ANTHROPIC_BASE_URL` points to {provider}, but `ANTHROPIC_API_KEY` looks like an Anthropic key. Update either the URL or the key in `~/.claude/settings.json`, then re-run `/claude-hud:setup`.

3. **`provider` is `unknown`** AND both `DEEPSEEK_API_KEY` and `ZHIPU_API_KEY` are set → conflict. Ask the user which provider they want, unset the other key, then re-run setup.

4. **`provider` is `unknown`** AND exactly one standalone key (`DEEPSEEK_API_KEY` or `ZHIPU_API_KEY`) is set → standalone fallback. Tell the user:

   > ANTHROPIC_BASE_URL does not point to a known provider hostname; falling back to standalone {key}. Consider pointing ANTHROPIC_BASE_URL directly at the provider so a single key is the source of truth.

   Continue with sub-steps below using the standalone key (DeepSeek writes `deepseek-snapshot.json`, ZhipuAI writes `usage-snapshot.json`).

5. **`provider` is detected but `ANTHROPIC_API_KEY` is missing AND no matching standalone key** → tell the user:

   > Detected {provider} but `ANTHROPIC_API_KEY` not found in settings. Please configure it in `~/.claude/settings.json` under `env`, then re-run `/claude-hud:setup`.

   Continue to Step 5.

6. **No provider detected and no standalone key** → skip this step entirely, continue to Step 5.

### Auto-configure sub-steps

**4.5a: Copy unified fetch script**

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PLUGIN_DIR=$(ls -d "$CLAUDE_DIR"/plugins/cache/*/claude-hud/*/ 2>/dev/null | sort -V | tail -1)
SCRIPT_DEST="$CLAUDE_DIR/plugins/claude-hud"
mkdir -p "$SCRIPT_DEST"

FETCH_JS="$PLUGIN_DIR/scripts/fetch-usage.js"
if [ -f "$FETCH_JS" ]; then
  cp "$FETCH_JS" "$SCRIPT_DEST/fetch-usage.js"
  echo "OK: fetch script installed"
else
  echo "WARN: fetch script not found in plugin, skipping"
fi
```

**4.5b: Test API connection**

```bash
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
ANTHROPIC_API_KEY="$API_KEY" ANTHROPIC_BASE_URL="$BASE_URL" node "$CLAUDE_DIR/plugins/claude-hud/fetch-usage.js" 2>/dev/null && echo "OK: API connected" || echo "WARN: API test failed"
cat "$CLAUDE_DIR/plugins/claude-hud/usage-snapshot.json" 2>/dev/null
```

If the test fails (no snapshot written, or exit code non-zero), **do NOT proceed to 4.5c/4.5d**. The detection likely matched a URL that isn't actually that provider, or the API key doesn't match. Tell the user:

> Provider auto-detect picked {provider}, but the test API call failed. Skipping usage-display configuration to avoid a broken hook. If you do want this provider, verify `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` in `~/.claude/settings.json`, then re-run `/claude-hud:setup` (or run `/claude-hud:usage-setup` to retry just this step).

Then continue to Step 5.

**4.5c: Update config.json** (merge with what was written in Step 4)

Add to the existing `plugins/claude-hud/config.json`:

```json
{
  "display": {
    "showUsage": true,
    "usageBarEnabled": true,
    "sevenDayThreshold": 0,
    "externalUsagePath": "<absolute path>",
    "externalUsageFreshnessMs": 1800000
  }
}
```

**macOS/Linux** (also **Windows + Git Bash**): Replace `<absolute path>` with `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/usage-snapshot.json` (no `~`).
**Windows (PowerShell)**: Replace `<absolute path>` with `Join-Path $claudeDir "plugins\claude-hud\usage-snapshot.json"` (fully expanded, no `~`).

**4.5d: Update settings.json** (merge with what was written in Step 3)

Add to the existing settings:

1. Add `ANTHROPIC_API_KEY` to `env` if not already there (same value as the detected key).

2. Add the fetch hook to `hooks.PreToolUse`. If a PreToolUse entry with matcher `Bash|Read|Write|Edit` already exists, append the hook to its `hooks` array if not already present. Remove any old `fetch-zhipu-usage.sh`, `fetch-deepseek-usage.sh`, or `fetch-usage.sh` hooks. Otherwise add the full entry.

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|Read|Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "node ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/claude-hud/fetch-usage.js",
        "async": true
      }]
    }]
  }
}
```

After completing these sub-steps, tell the user based on the detected provider:

**For DeepSeek**: "DeepSeek balance display configured — your account balance (e.g. ¥6.35) will appear in the HUD."

**For ZhipuAI**: "ZhipuAI usage display configured — 5h and 7d quota bars will appear in the HUD."

**When switching providers**: Just change `ANTHROPIC_BASE_URL` and `ANTHROPIC_API_KEY` in settings — the fetch script auto-detects the new provider. No need to re-run setup.

---

## Step 5: Verify & Finish

**First, confirm the user has restarted Claude Code** since Step 3 wrote the config. If they haven't, ask them to restart before proceeding — the HUD cannot appear in the same session where setup was run.
 
Use AskUserQuestion:
- Question: "Setup complete! The HUD should appear below your input field. Is it working?"
- Options: "Yes, it's working" / "No, something's wrong"

**If yes**: Ask the user if they'd like to ⭐ star the claude-hud repository on GitHub to support the project. If they agree and `gh` CLI is available, first check whether their `gh` version supports `gh repo star`. If it does, run `gh repo star jarrodwatts/claude-hud`. Otherwise fall back to `gh api -X PUT /user/starred/jarrodwatts/claude-hud`. Only run the star command if they explicitly say yes.

**If no**: Debug systematically:

1. **Restart Claude Code** (most common cause on macOS):
    - The statusLine config requires a restart to take effect
    - Quit Claude Code completely and run `claude` again, then re-run `/claude-hud:setup` to verify
    - If you've already restarted, continue below

2. **Verify config was applied**:
   - Read settings file (`${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json` on bash, or `settings.json` inside `$env:CLAUDE_CONFIG_DIR` when set, otherwise `Join-Path $HOME ".claude"` on PowerShell)
   - Check statusLine.command exists and looks correct
   - If command contains a hardcoded version path (not using the dynamic version-lookup command), it may be a stale config from a previous setup

3. **Test the command manually** and capture error output:
   ```bash
   {GENERATED_COMMAND} 2>&1
   ```

4. **Common issues to check**:

   **"command not found" or empty output**:
   - Runtime path might be wrong: `ls -la {RUNTIME_PATH}`
   - On macOS with mise/nvm/asdf: the absolute path may have changed after a runtime update
   - Symlinks may be stale: `command -v node` often returns a symlink that can break after version updates
   - Solution: re-detect the runtime path (`command -v node` on Windows, `command -v bun` or `command -v node` on macOS/Linux), and verify with `realpath {RUNTIME_PATH}` (or `readlink -f {RUNTIME_PATH}`) to get the true absolute path

   **"No such file or directory" for plugin**:
   - Plugin might not be installed: `ls "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/`
   - Solution: reinstall plugin via marketplace

   **Windows shell mismatch (for example, "bash not recognized")**:
   - Command format does not match `Platform:` + `Shell:`
   - Solution: re-run Step 1 branch logic and use the matching variant

   **Windows: HUD shows only "initializing..." with no error (PowerShell shell, MSYS/Cygwin command environment)**:
   - Root cause: `Shell: powershell` with `$OSTYPE=msys` or `$OSTYPE=cygwin`, causing bash to process the command before PowerShell
   - Check: run `echo $OSTYPE` in the Bash tool — if it returns `msys` or `cygwin`, this is the issue
   - Solution: re-run setup; when OSTYPE is `msys`/`cygwin`, follow the Windows + Git Bash path in Step 1

   **Windows + PowerShell: HUD silent or "initializing..." with no error in any log (OSTYPE is not msys/cygwin)**:
   - Symptoms: HUD stays at "initializing..." or shows nothing. Running the generated command interactively in a PowerShell prompt produces the expected HUD output, but the version invoked through Claude Code does not.
   - Root cause: either (a) `[Console]::WindowWidth` threw `System.IO.IOException: The handle is invalid.` because the subprocess Claude Code spawns has no console handle, or (b) the cache glob `plugins\cache\*\claude-hud` (with no trailing `\*`) matched the `claude-hud` directory itself, leaving `$pluginDir` as `$null` and `Join-Path` throwing `Cannot bind argument to parameter 'Path' because it is null`.
   - Check: pipe stdin through `cmd.exe` to mirror Claude Code's invocation:
     ```powershell
     '{}' | & cmd.exe /c '{GENERATED_COMMAND}'
     ```
     If you see either error, the existing setup predates the wrapper-based command format. Re-run `/claude-hud:setup` to regenerate `statusline.ps1` with the multi-method width detection (`[Console]::WindowWidth` → `$Host.UI.RawUI` → `mode con`) and the corrected version-dir glob. See [#521](https://github.com/jarrodwatts/claude-hud/issues/521).

   **Windows: PowerShell execution policy error**:
   - Run: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

   **Permission denied**:
   - Runtime not executable: `chmod +x {RUNTIME_PATH}`

   **WSL confusion**:
   - If using WSL, ensure plugin is installed in Linux environment, not Windows
   - Check: `ls "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/claude-hud/`

5. **If still stuck**: Show the user the exact command that was generated and the error, so they can report it or debug further
