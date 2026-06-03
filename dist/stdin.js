import { AUTOCOMPACT_BUFFER_PERCENT } from './constants.js';
const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 250;
const DEFAULT_IDLE_TIMEOUT_MS = 30;
const DEFAULT_MAX_STDIN_BYTES = 256 * 1024;
export async function readStdin(stream = process.stdin, options = {}) {
    if (stream.isTTY) {
        return null;
    }
    const firstByteTimeoutMs = options.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS;
    const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_STDIN_BYTES;
    try {
        stream.setEncoding('utf8');
    }
    catch {
        return null;
    }
    return await new Promise((resolve) => {
        let raw = '';
        let settled = false;
        let sawData = false;
        let firstByteTimer;
        let idleTimer;
        const cleanup = () => {
            if (firstByteTimer) {
                clearTimeout(firstByteTimer);
                firstByteTimer = undefined;
            }
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = undefined;
            }
            stream.off('data', onData);
            stream.off('end', onEnd);
            stream.off('error', onError);
            stream.pause();
        };
        const finish = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(value);
        };
        const tryParse = () => {
            const trimmed = raw.trim();
            if (!trimmed) {
                return null;
            }
            try {
                return JSON.parse(trimmed);
            }
            catch {
                return undefined;
            }
        };
        const scheduleIdleParse = () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
            }
            idleTimer = setTimeout(() => {
                const parsed = tryParse();
                finish(parsed ?? null);
            }, idleTimeoutMs);
        };
        const onData = (chunk) => {
            sawData = true;
            if (firstByteTimer) {
                clearTimeout(firstByteTimer);
                firstByteTimer = undefined;
            }
            raw += String(chunk);
            if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
                finish(null);
                return;
            }
            const parsed = tryParse();
            if (parsed !== undefined) {
                finish(parsed);
                return;
            }
            scheduleIdleParse();
        };
        const onEnd = () => {
            const parsed = tryParse();
            finish(parsed ?? null);
        };
        const onError = () => {
            finish(null);
        };
        firstByteTimer = setTimeout(() => {
            if (!sawData) {
                finish(null);
            }
        }, firstByteTimeoutMs);
        stream.on('data', onData);
        stream.on('end', onEnd);
        stream.on('error', onError);
    });
}
export function getTotalTokens(stdin) {
    const usage = stdin.context_window?.current_usage;
    return ((usage?.input_tokens ?? 0) +
        (usage?.cache_creation_input_tokens ?? 0) +
        (usage?.cache_read_input_tokens ?? 0));
}
/**
 * Get native percentage from Claude Code v2.1.6+ if available.
 * Returns null if not available or invalid, triggering fallback to manual calculation.
 *
 * A value of 0 is treated as "not yet populated": on a fresh session Claude Code
 * may emit used_percentage=0 before the first API response arrives, while
 * current_usage already contains the real initial-context tokens (system prompt,
 * tools, memory files, etc.).  Falling through to the token-based calculation
 * ensures those tokens are reflected in the context bar from the very first tick.
 */
function getNativePercent(stdin) {
    const nativePercent = stdin.context_window?.used_percentage;
    if (typeof nativePercent === 'number' && !Number.isNaN(nativePercent) && nativePercent > 0) {
        return Math.min(100, Math.max(0, Math.round(nativePercent)));
    }
    return null;
}
export function getContextPercent(stdin) {
    // Prefer native percentage (v2.1.6+) - accurate and matches /context
    const native = getNativePercent(stdin);
    if (native !== null) {
        return native;
    }
    // Fallback: manual calculation without buffer
    const size = stdin.context_window?.context_window_size;
    if (!size || size <= 0) {
        return 0;
    }
    const totalTokens = getTotalTokens(stdin);
    return Math.min(100, Math.round((totalTokens / size) * 100));
}
export function getBufferedPercent(stdin) {
    // Prefer native percentage (v2.1.6+) so the HUD matches Claude Code's
    // own context output. The buffered fallback only approximates older versions.
    const native = getNativePercent(stdin);
    if (native !== null) {
        return native;
    }
    // Fallback: manual calculation with buffer for older Claude Code versions
    const size = stdin.context_window?.context_window_size;
    if (!size || size <= 0) {
        return 0;
    }
    const totalTokens = getTotalTokens(stdin);
    // Scale buffer by raw usage: no buffer at ≤5% (e.g. after /clear),
    // full buffer at ≥50%. Autocompact doesn't kick in at very low usage.
    const rawRatio = totalTokens / size;
    const LOW = 0.05;
    const HIGH = 0.50;
    const scale = Math.min(1, Math.max(0, (rawRatio - LOW) / (HIGH - LOW)));
    const buffer = size * AUTOCOMPACT_BUFFER_PERCENT * scale;
    return Math.min(100, Math.round(((totalTokens + buffer) / size) * 100));
}
// Enterprise plan alias → human-readable display name
const ENTERPRISE_ALIAS_LABELS = {
    opusplan: 'Claude Opus',
    sonnetplan: 'Claude Sonnet',
    haikuplan: 'Claude Haiku',
};
export function getModelName(stdin) {
    const displayName = stdin.model?.display_name?.trim();
    if (displayName) {
        return displayName;
    }
    const modelId = stdin.model?.id?.trim();
    if (!modelId) {
        return 'Unknown';
    }
    // Resolve enterprise plan aliases to readable labels
    const enterpriseLabel = ENTERPRISE_ALIAS_LABELS[modelId.toLowerCase()];
    if (enterpriseLabel) {
        return enterpriseLabel;
    }
    // Proxy/relay model IDs with vendor prefix (e.g. Pro/zai-org/GLM-4.7, deepseek/deepseek-chat)
    // Must be checked before specific provider IDs to handle slash-separated formats
    const proxyLabel = normalizeProxyModelLabel(modelId);
    if (proxyLabel) {
        return proxyLabel;
    }
    // DeepSeek model IDs (e.g. deepseek-chat, deepseek-coder, deepseek-reasoner)
    if (isDeepSeekModelId(modelId)) {
        return normalizeDeepSeekLabel(modelId);
    }
    // GLM / Zhipu model IDs (e.g. glm-4-plus, glm-4-air, chatglm3-turbo)
    if (isGlmModelId(modelId)) {
        return normalizeGlmLabel(modelId);
    }
    const normalizedBedrockLabel = normalizeBedrockModelLabel(modelId);
    return normalizedBedrockLabel ?? modelId;
}
export function isBedrockModelId(modelId) {
    if (!modelId) {
        return false;
    }
    const normalized = modelId.toLowerCase();
    return normalized.includes('anthropic.claude-');
}
// Vertex AI model IDs use '@' as version separator (e.g. claude-3-5-sonnet@20241022)
export function isVertexModelId(modelId) {
    if (!modelId) {
        return false;
    }
    return modelId.includes('@');
}
const ENTERPRISE_MODEL_IDS = new Set(['opusplan', 'sonnetplan', 'haikuplan']);
export function isEnterpriseModelId(modelId) {
    if (!modelId) {
        return false;
    }
    return ENTERPRISE_MODEL_IDS.has(modelId.toLowerCase());
}
export function isDeepSeekModelId(modelId) {
    if (!modelId) {
        return false;
    }
    return /^deepseek/i.test(modelId);
}
export function isGlmModelId(modelId) {
    if (!modelId) {
        return false;
    }
    return /^(glm|chatglm)/i.test(modelId);
}
function detectProviderFromBaseUrl() {
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (!baseUrl)
        return null;
    let host;
    try {
        host = new URL(baseUrl).hostname.toLowerCase();
    }
    catch {
        return null;
    }
    if (!host)
        return null;
    if (host === 'api.deepseek.com' || host.endsWith('.deepseek.com'))
        return 'DeepSeek';
    if (host === 'api.z.ai' || host.endsWith('.z.ai'))
        return 'Zhipu';
    if (host === 'open.bigmodel.cn' || host.endsWith('.bigmodel.cn'))
        return 'Zhipu';
    if (host === 'api.siliconflow.cn' || host.endsWith('.siliconflow.cn'))
        return 'SiliconFlow';
    if (host === 'openrouter.ai' || host.endsWith('.openrouter.ai'))
        return 'OpenRouter';
    return null;
}
export function getProviderLabel(stdin) {
    if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
        return 'Bedrock';
    }
    if (process.env.CLAUDE_CODE_USE_VERTEX === '1') {
        return 'Vertex';
    }
    if (isEnterpriseModelId(stdin.model?.id)) {
        return 'Enterprise';
    }
    // Unified mode: ANTHROPIC_BASE_URL hostname → provider
    const urlProvider = detectProviderFromBaseUrl();
    if (urlProvider) {
        return urlProvider;
    }
    // cc-switch standalone mode: dedicated API keys without ANTHROPIC_BASE_URL
    if (process.env.DEEPSEEK_API_KEY) {
        return 'DeepSeek';
    }
    if (process.env.ZHIPU_API_KEY) {
        return 'Zhipu';
    }
    // Fallback: model ID prefix
    if (isDeepSeekModelId(stdin.model?.id)) {
        return 'DeepSeek';
    }
    if (isGlmModelId(stdin.model?.id)) {
        return 'Zhipu';
    }
    return null;
}
export function shouldHideUsage(stdin) {
    const provider = getProviderLabel(stdin);
    return provider === 'Bedrock' || isBedrockModelId(stdin.model?.id);
}
function parseRateLimitPercent(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }
    return Math.round(Math.min(100, Math.max(0, value)));
}
function parseRateLimitResetAt(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }
    return new Date(value * 1000);
}
export function getUsageFromStdin(stdin) {
    const rateLimits = stdin.rate_limits;
    if (!rateLimits) {
        return null;
    }
    const fiveHour = parseRateLimitPercent(rateLimits.five_hour?.used_percentage);
    const sevenDay = parseRateLimitPercent(rateLimits.seven_day?.used_percentage);
    if (fiveHour === null && sevenDay === null) {
        return null;
    }
    return {
        fiveHour,
        sevenDay,
        fiveHourResetAt: parseRateLimitResetAt(rateLimits.five_hour?.resets_at),
        sevenDayResetAt: parseRateLimitResetAt(rateLimits.seven_day?.resets_at),
    };
}
/**
 * Strips redundant context-window size suffixes from model display names.
 *
 * Claude Code may include the context window size in the display name
 * (e.g. "Opus 4.6 (1M context)"), but the HUD already shows context
 * usage via the context bar — so the parenthetical is redundant.
 */
export function stripContextSuffix(name) {
    return name.replace(/\s*\([^)]*\bcontext\b[^)]*\)/i, '').trim();
}
/**
 * Formats a model name according to the user's chosen display settings.
 *
 * When `override` is set, it replaces the model name entirely.
 * Otherwise, `format` controls how the raw name is abbreviated:
 *
 *   full:    Return raw name unchanged   (e.g. "Opus 4.6 (1M context)")
 *   compact: Strip context-window suffix (e.g. "Opus 4.6")
 *   short:   Strip context suffix AND leading "Claude " prefix (e.g. "Opus 4.6")
 */
export function formatModelName(name, format, override) {
    if (override) {
        return override;
    }
    if (!format || format === 'full') {
        return name;
    }
    let result = stripContextSuffix(name);
    if (format === 'short') {
        result = result.replace(/^Claude\s+/i, '');
    }
    return result;
}
function normalizeDeepSeekLabel(modelId) {
    const id = modelId.toLowerCase();
    // deepseek-v3-0324, deepseek-v3 etc.
    if (/^deepseek-v\s*(\d+)/i.test(id) || /^deepseek\s+v\s*(\d+)/i.test(id)) {
        const match = id.match(/v\s*(\d+)/);
        const version = match ? match[1] : '';
        return version ? `DeepSeek V${version}` : 'DeepSeek';
    }
    // deepseek-r1-0528, deepseek-r1 etc.
    if (/^deepseek-r\s*(\d+)/i.test(id) || /^deepseek\s+r\s*(\d+)/i.test(id)) {
        const match = id.match(/r\s*(\d+)/);
        const version = match ? match[1] : '';
        return version ? `DeepSeek R${version}` : 'DeepSeek R1';
    }
    // deepseek-reasoner
    if (id.includes('reasoner')) {
        return 'DeepSeek R1';
    }
    // deepseek-chat
    if (id === 'deepseek-chat') {
        return 'DeepSeek V3';
    }
    // deepseek-coder
    if (id === 'deepseek-coder') {
        return 'DeepSeek Coder';
    }
    // Fallback: capitalize first letter of each segment
    return modelId.split(/[-_\s]+/).map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ');
}
function normalizeGlmLabel(modelId) {
    const id = modelId.toLowerCase();
    // glm-5.1, glm-4-plus, glm-4-air, glm-4-flash, glm-4-long, glm-4-alltools, glm-3-turbo
    const glmMatch = id.match(/^glm-?(\d+(?:\.\d+)*)[-]?([\w]*)/);
    if (glmMatch) {
        const version = glmMatch[1];
        const variant = glmMatch[2];
        if (!variant)
            return `GLM-${version}`;
        return `GLM-${version} ${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
    }
    // chatglm3-turbo, chatglm2-6b etc.
    if (id.startsWith('chatglm')) {
        const rest = id.slice(7); // after "chatglm"
        const numMatch = rest.match(/^(\d+(?:\.\d+)*)/);
        if (numMatch) {
            const version = numMatch[1];
            const variant = rest.slice(version.length).replace(/^[-_]/, '');
            if (!variant)
                return `ChatGLM ${version}`;
            return `ChatGLM ${version} ${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
        }
        return 'ChatGLM';
    }
    return modelId.split(/[-_\s]+/).map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join(' ');
}
/**
 * Normalize proxy/relay model IDs with vendor prefixes.
 * Examples: Pro/zai-org/GLM-4.7 → GLM-4.7, deepseek/deepseek-chat → DeepSeek V3
 */
function normalizeProxyModelLabel(modelId) {
    // Match patterns like "Vendor/Org/Model" or "vendor/model"
    const slashMatch = modelId.match(/^(?:[\w.-]+\/)+([\w.-]+)$/);
    if (!slashMatch)
        return null;
    const lastSegment = slashMatch[1];
    // Check if the last segment (or full ID) contains a known model family
    const fullLower = modelId.toLowerCase();
    if (/\bglm\b/i.test(lastSegment) || /\bchatglm\b/i.test(lastSegment)) {
        return normalizeGlmLabel(lastSegment);
    }
    if (/deepseek/i.test(lastSegment) || /deepseek/i.test(fullLower)) {
        return normalizeDeepSeekLabel(lastSegment);
    }
    if (/^claude/i.test(lastSegment)) {
        return lastSegment;
    }
    // Generic: return the last segment cleaned up
    return lastSegment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function normalizeBedrockModelLabel(modelId) {
    if (!isBedrockModelId(modelId)) {
        return null;
    }
    const lowercaseId = modelId.toLowerCase();
    const claudePrefix = 'anthropic.claude-';
    const claudeIndex = lowercaseId.indexOf(claudePrefix);
    if (claudeIndex === -1) {
        return null;
    }
    let suffix = lowercaseId.slice(claudeIndex + claudePrefix.length);
    suffix = suffix.replace(/-v\d+:\d+$/, '');
    suffix = suffix.replace(/-\d{8}$/, '');
    const tokens = suffix.split('-').filter(Boolean);
    if (tokens.length === 0) {
        return null;
    }
    const familyIndex = tokens.findIndex((token) => token === 'haiku' || token === 'sonnet' || token === 'opus');
    if (familyIndex === -1) {
        return null;
    }
    const family = tokens[familyIndex];
    const beforeVersion = readNumericVersion(tokens, familyIndex - 1, -1).reverse();
    const afterVersion = readNumericVersion(tokens, familyIndex + 1, 1);
    const versionParts = beforeVersion.length >= afterVersion.length ? beforeVersion : afterVersion;
    const version = versionParts.length ? versionParts.join('.') : null;
    const familyLabel = family[0].toUpperCase() + family.slice(1);
    return version ? `Claude ${familyLabel} ${version}` : `Claude ${familyLabel}`;
}
function readNumericVersion(tokens, startIndex, step) {
    const parts = [];
    for (let i = startIndex; i >= 0 && i < tokens.length; i += step) {
        if (!/^\d+$/.test(tokens[i])) {
            break;
        }
        parts.push(tokens[i]);
        if (parts.length === 2) {
            break;
        }
    }
    return parts;
}
//# sourceMappingURL=stdin.js.map