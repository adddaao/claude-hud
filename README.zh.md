# Claude HUD

一个 Claude Code 插件，实时显示正在发生的事情——上下文使用率、活跃工具、运行中的 Agent 和待办进度。始终在你的输入下方可见。

[![License](https://img.shields.io/github/license/jarrodwatts/claude-hud?v=2)](LICENSE)
[![Stars](https://img.shields.io/github/stars/jarrodwatts/claude-hud)](https://github.com/jarrodwatts/claude-hud/stargazers)

![Claude HUD in action](claude-hud-preview-5-2.png)

> 🌐 [English README](README.md) | 中文文档

# 第三方模型用量接入

Claude HUD 支持在非 Anthropic 官方模型（如 ZhipuAI、DeepSeek）下显示用量信息。通过一个统一的 fetch 脚本自动检测当前提供商并拉取数据。

## 支持的提供商

| 提供商 | 检测条件 | 显示内容 |
|--------|---------|---------|
| ZhipuAI（智谱） | `ANTHROPIC_BASE_URL` 含 `z.ai` 或 `bigmodel` | 5 小时 / 7 天用量百分比进度条 + 套餐等级 |
| DeepSeek | `ANTHROPIC_BASE_URL` 含 `deepseek` | 账户余额（如 ¥6.35） |

## 前提条件

在 Claude Code 的 `~/.claude/settings.json` 中已配置好以下字段：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com",
    "ANTHROPIC_API_KEY": "sk-xxx"
  }
}
```

没配好的话 setup 会直接提示，不需要你额外操作。

## 一键配置

```
/claude-hud:usage-setup
```

这个命令会自动完成：

1. **检测提供商** — 读 `ANTHROPIC_BASE_URL` 判断是 ZhipuAI 还是 DeepSeek
2. **验证 API Key** — 没配就提示，配了就测试连接
3. **安装 fetch 脚本** — 复制 `fetch-usage.js` 到插件目录
4. **写配置** — 更新 `config.json` 的 `externalUsagePath` 指向 snapshot 文件
5. **注册 Hook** — 在 `settings.json` 添加 `PreToolUse` hook，每次工具调用时异步刷新数据

重启 Claude Code 后生效。

## 切换提供商

只需要改 `settings.json` 里的 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_API_KEY`。同一个 fetch 脚本自动适配新提供商，不需要重跑 setup。

```json
// 切到 DeepSeek
{ "env": { "ANTHROPIC_BASE_URL": "https://api.deepseek.com", "ANTHROPIC_API_KEY": "sk-deepseek-xxx" } }

// 切到 ZhipuAI
{ "env": { "ANTHROPIC_BASE_URL": "https://open.bigmodel.cn/api/paas/v4", "ANTHROPIC_API_KEY": "xxx.zhipu-xxx" } }
```

## 费用估算

费用估算支持 Anthropic 全系模型 + DeepSeek（V4 Flash / V4 Pro）。价格按官网硬编码，可通过 config 覆盖：

```json
{
  "pricing": [
    { "pattern": "deepseek.*v4.*pro", "inputUsdPerMillion": 1.74, "outputUsdPerMillion": 3.48 },
    { "pattern": "deepseek", "inputUsdPerMillion": 0.14, "outputUsdPerMillion": 0.28 }
  ]
}
```

`pattern` 是匹配模型名的正则表达式，按顺序匹配，第一个命中的生效。未匹配到的模型使用内置默认价格。

---

## 第一次安装流程

适用于一台什么都没装过的机器。步骤 0 在系统 shell 里完成（装 Claude Code 和 Node.js），步骤 1–4 在 Claude Code 会话里完成。

### 步骤 0：准备运行环境

需要先装好 Claude Code 本身和 Node.js（HUD 用 Node.js 跑）。

**0a — 安装 Claude Code（v1.0.80 或更新版本）**

参照官方文档安装：<https://docs.claude.com/en/docs/claude-code/setup>

安装完成后在终端运行 `claude` 能进入交互界面即代表 OK。

**0b — 安装 Node.js 18+（或 Bun）**

| 平台 | 推荐命令 |
|------|---------|
| macOS | `brew install node` |
| Linux (Debian/Ubuntu) | `sudo apt-get install -y nodejs` |
| Linux (Fedora/RHEL) | `sudo dnf install -y nodejs` |
| Linux (Arch) | `sudo pacman -S nodejs` |
| Windows | `winget install OpenJS.NodeJS.LTS` |

也可以直接从 <https://nodejs.org/> 下载安装包。装完之后 `node -v` 应该返回 `v18` 或更高。

Windows 上 **不支持 Bun**，必须用 Node.js。macOS / Linux 上二选一即可。

**0c — 登录 Claude Code**

第一次运行 `claude` 时按提示登录账号、选好工作目录，确认能在终端里看到 Claude Code 的输入框。

如果使用第三方提供商（ZhipuAI / DeepSeek），现在就把 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_API_KEY` 填到 `~/.claude/settings.json` 的 `env` 字段里——后续步骤 3 会自动识别。Anthropic 官方账号跳过这一步。

### 步骤 1：添加插件市场

```
/plugin marketplace add adddaao/claude-hud
```

这会把 `adddaao/claude-hud` 注册为本地可用的插件来源。

### 步骤 2：安装插件

<details>
<summary><strong>⚠️ Linux 用户：请先点击此处</strong></summary>

在 Linux 上，`/tmp` 通常是独立的文件系统（tmpfs），这会导致插件安装失败并报错：
```
EXDEV: cross-device link not permitted
```

**修复方法**：在启动 Claude Code 前设置 TMPDIR：
```bash
mkdir -p ~/.cache/tmp && TMPDIR=~/.cache/tmp claude
```

然后在该会话中运行下面的安装命令。这是 [Claude Code 平台的限制](https://github.com/anthropics/claude-code/issues/14799)。

</details>

```
/plugin install claude-hud
```

安装完成后，重新加载插件以激活命令：

```
/reload-plugins
```

### 步骤 3：配置状态栏

```
/claude-hud:setup
```

这个命令会**自动检测平台**（Windows / macOS / Linux）和 Shell 类型，并根据环境自动适配。Windows 用户无需任何额外操作。

它会自动完成：

1. **自动检测平台与运行时** — 识别 Windows / macOS / Linux，以及 Shell 类型（bash / PowerShell / Git Bash）。Windows 下自动使用 `tput cols` 获取终端宽度（而非不兼容的 `stty size`），确保状态栏正确显示
2. 在 `~/.claude/settings.json` 中写入 `statusLine` 字段，指向当前最新版本的 claude-hud 入口
3. **自动检测 `ANTHROPIC_BASE_URL`**：如果是 ZhipuAI / DeepSeek 等第三方提供商，会同时安装 fetch 脚本、写入 `externalUsagePath`、注册 PreToolUse hook，一步到位
4. 引导你选择布局预设和可选元素（工具、Agent、待办等）

后续插件升级时无需重新执行 setup——启动脚本会自动定位到最新版本。

<details>
<summary><strong>⚠️ Windows 用户：点击查看注意事项</strong></summary>

**平台自动检测**：`/claude-hud:setup` 会自动检测 Windows 环境并做适配处理：
- **Git Bash / MSYS2 / Cygwin**：自动使用 bash 命令 + `tput cols` 获取终端宽度，兼容 Windows 无 `/dev/tty` 的环境
- **PowerShell / cmd**：自动使用 PowerShell 命令 + `.ps1` wrapper 获取终端宽度
- **WSL**：自动使用 Linux 路径处理

**运行时要求**：在 Windows 上，Claude HUD setup 支持的运行时是 Node.js LTS。如果 setup 提示未找到 JavaScript 运行时，请先为你的 shell 安装 Node.js：
```powershell
winget install OpenJS.NodeJS.LTS
```
然后重启 shell 并再次运行 `/claude-hud:setup`。

</details>

### 步骤 4：重启 Claude Code

完整重启 Claude Code（macOS 上需完全退出后再次运行 `claude`），新的 statusLine 配置才会生效。重启后 HUD 会出现在输入框下方。

### 后续升级

插件市场拉取到新版本后，重新执行 `/plugin install claude-hud` + `/reload-plugins` 即可。`statusLine` 配置写入的是自动解析最新版本的启动脚本，不需要再次运行 `/claude-hud:setup`。

### 何时需要单独运行 `/claude-hud:usage-setup`

`/claude-hud:setup` 已经内置了第三方提供商的自动配置，下面这些场景才需要单独执行 `/claude-hud:usage-setup`：

- 切换提供商（如 DeepSeek ↔ ZhipuAI）后，更新 fetch 脚本和快照路径
- `ANTHROPIC_API_KEY` 失效或被替换，需要重新验证连通性
- 首次安装时还没有 `ANTHROPIC_BASE_URL`，事后才接入第三方提供商

Anthropic 官方账号永远不需要执行这一步。

---

## 什么是 Claude HUD？

Claude HUD 让你在 Claude Code 会话中获得更清晰的洞察。

| 你看到的内容 | 为什么重要 |
|--------------|------------|
| **项目路径** | 知道你当前在哪个项目中（可配置 1-3 级目录深度） |
| **上下文健康度** | 在上下文窗口满之前准确了解还剩多少 |
| **工具活动** | 实时观察 Claude 读取、编辑和搜索文件 |
| **Agent 追踪** | 查看哪些子 Agent 正在运行以及它们在做什么 |
| **待办进度** | 实时跟踪任务完成情况 |

## 显示效果

### 默认（2 行）
```
[Opus] │ my-project git:(main*)
上下文 █████░░░░░ 45% │ 使用率 ██░░░░░░░░ 25%（1小时30分 / 5小时）
```
- **第 1 行** — 模型、提供商标签（如能正面识别，例如 `Bedrock`、`Vertex`）、项目路径、git 分支
- **第 2 行** — 上下文进度条（绿 → 黄 → 红）和使用率限制

### 可选行（通过 `/claude-hud:configure` 启用）
```
◐ Edit: auth.ts | ✓ Read ×3 | ✓ Grep ×2        ← 工具活动
◐ explore [haiku]: 查找认证代码（2分15秒）       ← Agent 状态
▸ 修复认证漏洞（2/5）                             ← 待办进度
```

---

## 工作原理

Claude HUD 使用 Claude Code 原生的 **statusline API**——无需独立窗口，不需要 tmux，在任何终端都能工作。

```
Claude Code → stdin JSON → claude-hud → stdout → 在终端中显示
           ↘ transcript JSONL（工具、Agent、待办）
```

**核心特性：**
- 来自 Claude Code 的原生 Token 数据（非估算）
- 适配 Claude Code 报告的上下文窗口大小，包括最新的 1M 上下文会话
- 解析转录文件以获取工具/Agent 活动
- 约每 300ms 更新一次

---

## 配置

随时自定义你的 HUD：

```
/claude-hud:configure
```

引导式配置涵盖布局、语言和常用显示开关。高级选项如自定义颜色和阈值仍然保留，但你需要直接编辑配置文件来设置它们：

- **首次设置**：选择预设（完整/核心/极简），选择标签语言，然后微调各个元素
- **随时自定义**：开关各项、调整 Git 显示样式、切换布局或更改标签语言
- **保存前预览**：在提交更改前精确预览 HUD 的效果

### 预设

| 预设 | 显示内容 |
|------|----------|
| **完整（Full）** | 全部启用——工具、Agent、待办、Git、使用率、时长 |
| **核心（Essential）** | 活动行 + Git 状态，减少信息冗余 |
| **极简（Minimal）** | 仅核心——只有模型名称和上下文进度条 |

选择预设后，你可以单独开启或关闭各个元素。

### 手动配置

直接编辑 `~/.claude/plugins/claude-hud/config.json` 来配置高级选项，如 `colors.*`、`pathLevels`、`maxWidth`、阈值覆盖、`display.timeFormat` 以及 `display.promptCacheTtlSeconds`。运行 `/claude-hud:configure` 时会保留这些手动设置，同时你仍可更改 `language`、布局和常用引导式开关。

中文 HUD 标签作为显式 opt-in 选项提供。除非你在 `/claude-hud:configure` 中选择 `中文` 或在配置中设置 `language`，否则默认使用英文。短别名 `zh` 仍然有效，新的引导式配置会写入规范值 `zh-Hans`。

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `language` | `en` \| `zh` \| `zh-Hans` | `en` | HUD 标签语言。默认为英文；设为 `zh` 或 `zh-Hans` 启用简体中文标签 |
| `lineLayout` | string | `expanded` | 布局：`expanded`（多行）或 `compact`（单行） |
| `pathLevels` | 1-3 | 1 | 项目路径显示的目录层级数 |
| `maxWidth` | number \| `null` | `null` | 可选的回退宽度，仅在终端宽度检测完全失败时使用 |
| `forceMaxWidth` | boolean | false | 当设置了 `maxWidth` 时始终使用它，即使终端宽度检测返回更小的值 |
| `elementOrder` | string[] | `["project","context","usage","promptCache","memory","environment","tools","agents","todos","sessionTime"]` | 展开模式下元素的顺序。省略的条目在展开模式下隐藏。现有配置会保留其显式顺序直到更新 |
| `display.mergeGroups` | string[][] | `[["context","usage"]]` | 展开模式下相邻时应共享一行的元素分组。设为 `[]` 可禁用合并行 |
| `gitStatus.enabled` | boolean | true | 在 HUD 中显示 git 分支 |
| `gitStatus.showDirty` | boolean | true | 显示 `*` 表示未提交的更改 |
| `gitStatus.showAheadBehind` | boolean | false | 显示 `↑N ↓N` 表示领先/落后远程的提交数 |
| `gitStatus.pushWarningThreshold` | number | 0 | 当未推送提交数达到此值时，用警告色显示 ahead 计数（`0` 表示禁用） |
| `gitStatus.pushCriticalThreshold` | number | 0 | 当未推送提交数达到此值时，用严重色显示 ahead 计数（`0` 表示禁用） |
| `gitStatus.showFileStats` | boolean | false | 显示文件变更数量 `!M +A ✘D ?U` |
| `gitStatus.branchOverflow` | `truncate` \| `wrap` | `truncate` | 保持当前截断行为，或在可能时让 git 块以自己的换行边界单独换到下一行 |
| `display.showModel` | boolean | true | 显示模型名称 `[Opus]` |
| `display.showAddedDirs` | boolean | true | 显示来自 `/add-dir` 的额外工作区目录（如 `+sparkle +lib-foo`）；空数组不显示任何内容。在两种布局中最多渲染 5 个目录（溢出显示为 `+N more`），基名截断为 24 个字符并加 `…` |
| `display.addedDirsLayout` | `inline` \| `line` | `inline` | `inline` 将目录放在项目名称旁边，每个目录带 `+name` 前缀；`line` 在单独的 `Added dirs: name1, name2` 行渲染（无 `+` 前缀，逗号分隔） |
| `display.showContextBar` | boolean | true | 显示可视化上下文进度条 `████░░░░░░` |
| `display.contextValue` | `percent` \| `tokens` \| `remaining` \| `both` | `percent` | 上下文显示格式（`45%`、`45k/200k`、剩余 `55%` 或 `45% (45k/200k)`） |
| `display.showConfigCounts` | boolean | false | 显示 CLAUDE.md、rules、MCPs、hooks 数量 |
| `display.showCost` | boolean | false | 使用 Claude Code 原生提供的 `cost.total_cost_usd` 显示会话费用（可用时），并附带本地估算回退方案 |
| `display.showOutputStyle` | boolean | false | 从配置文件显示当前 Claude Code `outputStyle`，格式为 `style: <名称>` |
| `display.showDuration` | boolean | false | 显示会话时长 `⏱️ 5m` |
| `display.showSpeed` | boolean | false | 显示输出 Token 速度 `out: 42.1 tok/s` |
| `display.showUsage` | boolean | true | 显示 Claude 订阅用户的使用率限制（可用时） |
| `display.usageValue` | `percent` \| `remaining` | `percent` | 使用率显示格式（已使用 `25%`，或剩余 `75%`） |
| `display.usageBarEnabled` | boolean | true | 将使用率显示为可视化进度条而非文本 |
| `display.usageCompact` | boolean | false | 以较短的文本形式显示使用率，如 `5h: 25% (1h 30m)`；优先于 `display.usageBarEnabled` |
| `display.showResetLabel` | boolean | true | 在使用率倒计时前显示 `resets in` 前缀 |
| `display.timeFormat` | `relative` \| `absolute` \| `both` \| `elapsed` \| `elapsedAndAbsolute` | `relative` | 控制使用率窗口时间的显示方式：仅倒计时（`resets in 2h 30m`）、墙钟重置时间（`resets at 14:30`）、两者同时显示、窗口已过百分比（`53% elapsed`），或已过百分比加墙钟重置时间 |
| `display.sevenDayThreshold` | 0-100 | 80 | 当 7 天使用率 ≥ 阈值时显示（0 = 始终显示） |
| `display.externalUsagePath` | string | `""` | 可选的本地使用率快照文件路径，仅在 stdin `rate_limits` 缺失时使用 |
| `display.externalUsageWritePath` | string | `""` | 可选的绝对 `.json` 路径，父目录必须已存在。当 stdin `rate_limits` 存在时，ClaudeHUD 会写入私有权限快照供其他本地工具读取。相对路径、非 json 文件和缺失父目录会被忽略 |
| `display.externalUsageFreshnessMs` | number | `300000` | 外部使用率快照允许的最长存活时间，超时后会被忽略 |
| `display.showTokenBreakdown` | boolean | true | 在高上下文时（85%+）显示 Token 详情 |
| `display.showTools` | boolean | false | 显示工具活动行 |
| `display.toolNameMaxLength` | number | `0` | 工具名称最大显示长度。`0` 保留完整名称；截断 MCP 名称时可能缩短为最后一段 |
| `display.toolsMaxVisible` | number | `4` | 工具行最多显示的已完成工具数。`0` 表示不限制 |
| `display.showAgents` | boolean | false | 显示 Agent 活动行 |
| `display.showTodos` | boolean | false | 显示待办进度行 |
| `display.showSessionName` | boolean | false | 显示会话 slug 或 `/rename` 设置的自定义标题 |
| `display.showAdvisor` | boolean | false | 在 project 行内联显示 Claude Code `/advisor` 配置的顾问模型，例如 `Advisor: Opus 4.7`。来自 Claude Code 写入每条 assistant transcript 记录的 `advisorModel` 字段；渲染前会做控制字符/双向标记/ANSI 过滤并截断到 64 字符 |
| `display.advisorOverride` | string | `""` | 手动覆盖顾问显示文本。非空时优先于 transcript 检测，同样会做过滤和截断 |
| `display.showSessionStartDate` | boolean | false | 显示 transcript 会话开始时间戳 |
| `display.showLastResponseAt` | boolean | false | 显示最后一次 assistant 响应写入的时间距现在多久 |
| `display.showClaudeCodeVersion` | boolean | false | 显示已安装的 Claude Code 版本，如 `CC v2.1.81` |
| `display.showMemoryUsage` | boolean | false | 在展开布局中显示近似系统 RAM 使用行 |
| `display.showPromptCache` | boolean | false | 根据 transcript 中最后一次 assistant 响应时间显示 prompt cache 倒计时 |
| `display.promptCacheTtlSeconds` | number | `300` | Prompt cache TTL 秒数。Pro 保持默认值，Max 可设为 `3600` |
| `colors.context` | 颜色值 | `green` | 上下文进度条和百分比的基础颜色 |
| `colors.usage` | 颜色值 | `brightBlue` | 使用率进度条和低于警告阈值时百分比的颜色 |
| `colors.warning` | 颜色值 | `yellow` | 上下文阈值和使用率警告文本的警告颜色 |
| `colors.usageWarning` | 颜色值 | `brightMagenta` | 使用率进度条和接近阈值时百分比的警告颜色 |
| `colors.critical` | 颜色值 | `red` | 达到限制状态和严重阈值的颜色 |
| `colors.model` | 颜色值 | `cyan` | 模型徽章颜色，如 `[Opus]` |
| `colors.project` | 颜色值 | `yellow` | 项目路径的颜色 |
| `colors.git` | 颜色值 | `magenta` | Git 包装文本的颜色，如 `git:(` 和 `)` |
| `colors.gitBranch` | 颜色值 | `cyan` | Git 分支和分支状态文本的颜色 |
| `colors.label` | 颜色值 | `dim` | 标签和次要元数据的颜色，如 `Context`、`Usage`、计数和进度文本 |
| `colors.custom` | 颜色值 | `208` | 可选自定义行的颜色 |
| `colors.barFilled` | string | `█` | 进度条填充部分使用的字符 |
| `colors.barEmpty` | string | `░` | 进度条空白部分使用的字符 |
| `pricing` | `PricingOverride[]` | `[]` | 自定义模型定价覆盖。每条包含 `pattern`（匹配模型名的正则表达式）、`inputUsdPerMillion`（输入价格）和 `outputUsdPerMillion`（输出价格）。优先于内置定价。 |

`colors.barFilled` 和 `colors.barEmpty` 接受单个可见字素。控制字符、不可见格式字符（双向控制符、零宽连接符、变体选择符）、行/段落分隔符和非字符会被拒绝。宽字符（emoji、CJK）可能会影响进度条对齐，具体取决于终端。

支持的颜色名称：`dim`、`red`、`green`、`yellow`、`magenta`、`cyan`、`brightBlue`、`brightMagenta`。你也可以使用 256 色数字（`0-255`）或十六进制（`#rrggbb`）。

`display.showMemoryUsage` 为完全 opt-in 选项，仅在 `expanded` 布局下渲染。它报告本地机器的近似系统 RAM 使用情况，而非 Claude Code 或特定进程内的精确内存压力。由于可回收的 OS 缓存缓冲区仍可能被计入已用内存，该数字可能高估实际压力。

`display.showCost` 为完全 opt-in 选项。ClaudeHUD 优先使用 Claude Code 在 stdin 上提供的原生 `cost.total_cost_usd` 字段（可用时）。如果该字段缺失或对直连 Anthropic 会话无效，ClaudeHUD 会回退到现有的基于本地转录文件的估算方案，确保费用行在旧负载下仍能工作。原生字段在会话中首个 API 响应之前为空，因此费用显示可能在响应到达前保持隐藏。对于已知的路由提供商（如 Bedrock、Vertex AI），ClaudeHUD 也会隐藏费用显示，因为云提供商计费会话可能报告 `$0.00` 或省略该字段，即使会话并非真正免费。

`display.showPromptCache` 为完全 opt-in 选项。启用后，ClaudeHUD 会读取本地 transcript 中最后一次 assistant 响应的时间戳，并显示距离 prompt cache 过期还剩多久。默认 TTL 为 5 分钟（`300` 秒）。如果你想按 1 小时的 Max 风格窗口显示，可将 `display.promptCacheTtlSeconds` 设为 `3600`。如果 transcript 里还没有 assistant 时间戳，这个元素会继续隐藏。

### 使用率限制

当 Claude Code 在 stdin 上提供订阅用户 `rate_limits` 数据时，使用率显示**默认启用**。它会在第 2 行与上下文进度条一起显示你的使用率消耗。

将 `display.usageValue` 设为 `remaining` 可显示剩余配额而非已使用配额。警告颜色和 7 天阈值检查仍使用底层的已使用百分比。

ClaudeHUD 优先使用官方 statusline stdin 负载中的使用率数据。如果 `rate_limits` 缺失，你可以通过 `display.externalUsagePath` 显式启用本地 sidecar 快照回退，例如让代理程序写入 JSON 文件。只要 stdin 和 sidecar 同时存在，stdin 始终优先。

回退快照必须足够新（由 `display.externalUsageFreshnessMs` 控制），并且包含有效的 `updated_at`、以及 `five_hour` 窗口、`seven_day` 窗口或 `balance_label`。`balance_label` 是预付费提供商余额的可选文本；显示前会进行裁剪、长度限制和清理。非法 JSON、过期文件或非法时间戳都会被静默忽略。

如果希望 ClaudeHUD 将官方 stdin `rate_limits` 写入本地快照供其他工具使用，可设置 `display.externalUsageWritePath`。该路径必须为绝对路径、以 `.json` 结尾，并位于已存在的目录中。ClaudeHUD 会使用私有权限写入该文件，并静默忽略无效路径。

免费/仅限每周账户会单独显示每周窗口，而不是显示幽灵 `5h: --` 占位符。

当 7 天使用率超过 `display.sevenDayThreshold`（默认 80%）时会显示：

```
上下文 █████░░░░░ 45% │ 使用率 ██░░░░░░░░ 25%（1小时30分 / 5小时）| ██████████ 85%（2天 / 7天）
```

如需禁用，请将 `display.showUsage` 设为 `false`。

重置时间默认显示为相对倒计时。将 `display.timeFormat` 设为 `absolute` 可显示墙钟时间，设为 `both` 可同时显示两种形式，设为 `elapsed` 可显示当前使用率窗口已过百分比，设为 `elapsedAndAbsolute` 可同时显示已过百分比和墙钟重置时间。该设置目前只能手动编辑；`/claude-hud:configure` 会保留它，但不会修改它。

将 `display.showResetLabel` 设为 `false` 可使用较短的使用率倒计时格式，如 `(3h 17m)` 而非 `(resets in 3h 17m)`。

将 `display.usageCompact` 设为 `true` 可使用更短的使用率格式，如 `5h: 25% (1h 30m)`。紧凑模式优先于 `display.usageBarEnabled`。

**前提条件：**
- Claude Code 必须在当前会话的 stdin 上包含订阅用户 `rate_limits` 数据
- 不适用于仅使用 API 密钥的用户

**故障排查：** 如果使用率不显示：
- 确保你已使用 Claude 订阅账户登录（而非 API 密钥）
- 检查配置中的 `display.showUsage` 未设为 `false`
- API 用户看不到使用率显示（他们按 Token 付费，没有使用率限制）
- AWS Bedrock 模型显示 `Bedrock` 并隐藏使用率限制（使用率由 AWS 管理）
- Google Vertex AI 模型显示 `Vertex` 并隐藏费用估算（定价与 Anthropic 直连不同）
- Claude Code 可能在会话中首个模型响应之前将 `rate_limits` 留空
- 某些 Claude Code 构建版本和订阅层级即使在首个响应之后仍可能省略 `rate_limits`
- 如果你配置了 `display.externalUsagePath`，ClaudeHUD 会先尝试读取该本地快照，再决定是否隐藏使用率
- ClaudeHUD 不会回退到凭据抓取或未记录的 API 调用

回退快照示例：

```json
{
  "updated_at": "2026-04-20T12:00:00.000Z",
  "five_hour": {
    "used_percentage": 42,
    "resets_at": "2026-04-20T15:00:00.000Z"
  },
  "seven_day": {
    "used_percentage": 84,
    "resets_at": "2026-04-27T12:00:00.000Z"
  }
}
```

### 配置示例

```json
{
  "language": "zh",
  "lineLayout": "expanded",
  "pathLevels": 2,
  "elementOrder": ["project", "tools", "context", "usage", "memory", "environment", "agents", "todos", "sessionTime"],
  "gitStatus": {
    "enabled": true,
    "showDirty": true,
    "showAheadBehind": true,
    "showFileStats": true
  },
  "display": {
    "showTools": true,
    "showAgents": true,
    "showTodos": true,
    "showConfigCounts": true,
    "showDuration": true,
    "showMemoryUsage": true
  },
  "colors": {
    "context": "cyan",
    "usage": "cyan",
    "warning": "yellow",
    "usageWarning": "magenta",
    "critical": "red",
    "model": "cyan",
    "project": "yellow",
    "git": "magenta",
    "gitBranch": "cyan",
    "label": "dim",
    "custom": "#FF6600"
  },
  "pricing": [
    { "pattern": "deepseek.*v4.*pro", "inputUsdPerMillion": 1.74, "outputUsdPerMillion": 3.48 },
    { "pattern": "deepseek", "inputUsdPerMillion": 0.14, "outputUsdPerMillion": 0.28 }
  ]
}
```

### 显示示例

**1 级（默认）：** `[Opus] │ my-project git:(main)`

**2 级：** `[Opus] │ apps/my-project git:(main)`

**3 级：** `[Opus] │ dev/apps/my-project git:(main)`

**带脏状态指示器：** `[Opus] │ my-project git:(main*)`

**带领先/落后：** `[Opus] │ my-project git:(main ↑2 ↓1)`

**带文件统计：** `[Opus] │ my-project git:(main* !3 +1 ?2)`
- `!` = 修改的文件，`+` = 新增/暂存，`✘` = 删除，`?` = 未跟踪
- 计数为 0 的项会被省略，以保持显示整洁

### 故障排查

**配置不生效？**
- 检查 JSON 语法错误：无效的 JSON 会静默回退到默认值
- 确保值有效：`pathLevels` 必须是 1、2 或 3；`lineLayout` 必须是 `expanded` 或 `compact`；`maxWidth` 必须是正数
- 删除配置文件并运行 `/claude-hud:configure` 重新生成

**Git 状态缺失？**
- 验证你是否在 git 仓库中
- 检查配置中的 `gitStatus.enabled` 不为 `false`

**工具/Agent/待办行缺失？**
- 这些默认隐藏——在配置中通过 `showTools`、`showAgents`、`showTodos` 启用
- 它们也仅在有活动可显示时才会出现

**HUD 设置后不显示？**
- 重启 Claude Code 以加载新的 statusLine 配置
- 在 macOS 上，完全退出 Claude Code 并在终端中再次运行 `claude`

---

## 运行环境要求

- Claude Code v1.0.80+
- macOS/Linux：Node.js 18+ 或 Bun
- Windows：Node.js 18+

---

## 开发

```bash
git clone https://github.com/jarrodwatts/claude-hud
cd claude-hud
npm ci && npm run build
npm test
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 许可证

MIT — 详见 [LICENSE](LICENSE)

---

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=jarrodwatts/claude-hud&type=Date)](https://star-history.com/#jarrodwatts/claude-hud&Date)
