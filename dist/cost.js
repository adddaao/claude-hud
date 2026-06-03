import { isBedrockModelId, isVertexModelId } from './stdin.js';
const TOKENS_PER_MILLION = 1_000_000;
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;
// Patterns are tried in order; the first match wins. Families with more specific
// model lines (Haiku 4.x differs from Haiku 3.5) must come before any broader
// fallback patterns to avoid silent under-pricing.
const MODEL_PRICING = [
    { pattern: /\bopus 4(?: \d+)?\b/i, pricing: { inputUsdPerMillion: 15, outputUsdPerMillion: 75 } },
    { pattern: /\bsonnet 4(?: \d+)?\b/i, pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
    { pattern: /\bsonnet 3 7\b/i, pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
    { pattern: /\bsonnet 3 5\b/i, pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
    { pattern: /\bhaiku 4(?: \d+)?\b/i, pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 5 } },
    { pattern: /\bhaiku 3 5\b/i, pricing: { inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 } },
    // Enterprise plan aliases (e.g. opusplan, sonnetplan, haikuplan)
    { pattern: /\bopusplan\b/i, pricing: { inputUsdPerMillion: 15, outputUsdPerMillion: 75 } },
    { pattern: /\bsonnetplan\b/i, pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 } },
    { pattern: /\bhaikuplan\b/i, pricing: { inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 } },
    // DeepSeek models (v4-pro before general to avoid under-pricing)
    { pattern: /\bdeepseek[\s.]*v\s*4[\s.]*pro\b/i, pricing: { inputUsdPerMillion: 1.74, outputUsdPerMillion: 3.48 } },
    { pattern: /\bdeepseek\b/i, pricing: { inputUsdPerMillion: 0.14, outputUsdPerMillion: 0.28 } },
    // GLM / Zhipu models
    { pattern: /\bglm[\s-]*4[\s-]*plus\b/i, pricing: { inputUsdPerMillion: 7.14, outputUsdPerMillion: 7.14 } },
    { pattern: /\bglm[\s-]*4[\s-]*alltools\b/i, pricing: { inputUsdPerMillion: 7.14, outputUsdPerMillion: 7.14 } },
    { pattern: /\bglm[\s-]*4[\s-]*long\b/i, pricing: { inputUsdPerMillion: 0.14, outputUsdPerMillion: 0.14 } },
    { pattern: /\bglm[\s-]*4[\s-]*flash\b/i, pricing: { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.1 } },
    { pattern: /\bglm[\s-]*4[\s-]*air\b/i, pricing: { inputUsdPerMillion: 0.14, outputUsdPerMillion: 0.14 } },
    { pattern: /\bglm[\s-]*4\b/i, pricing: { inputUsdPerMillion: 14.3, outputUsdPerMillion: 14.3 } },
    { pattern: /\bchatglm\b/i, pricing: { inputUsdPerMillion: 0.14, outputUsdPerMillion: 0.14 } },
];
function normalizeModelName(modelName) {
    return modelName
        .toLowerCase()
        .replace(/^claude\s+/, '')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[._-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function matchModelPricing(modelName) {
    const normalized = normalizeModelName(modelName);
    for (const entry of MODEL_PRICING) {
        if (entry.pattern.test(normalized)) {
            return entry.pricing;
        }
    }
    return null;
}
function calculateUsd(tokens, usdPerMillion) {
    return (tokens * usdPerMillion) / TOKENS_PER_MILLION;
}
function getModelPricing(stdin, overrides) {
    const candidates = [
        stdin.model?.display_name?.trim(),
        stdin.model?.id?.trim(),
    ];
    // Config overrides take priority (tried in order, first match wins)
    if (overrides && overrides.length > 0) {
        for (const candidate of candidates) {
            if (!candidate)
                continue;
            const normalized = normalizeModelName(candidate);
            for (const override of overrides) {
                try {
                    const re = new RegExp(override.pattern, 'i');
                    if (re.test(normalized)) {
                        return { inputUsdPerMillion: override.inputUsdPerMillion, outputUsdPerMillion: override.outputUsdPerMillion };
                    }
                }
                catch {
                    // Invalid regex pattern — skip
                }
            }
        }
    }
    // Fall back to hardcoded defaults
    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        const pricing = matchModelPricing(candidate);
        if (pricing) {
            return pricing;
        }
    }
    return null;
}
export function estimateSessionCost(stdin, sessionTokens, overrides) {
    if (!sessionTokens) {
        return null;
    }
    if (isBedrockModelId(stdin.model?.id)) {
        return null;
    }
    if (isVertexModelId(stdin.model?.id)) {
        return null;
    }
    const pricing = getModelPricing(stdin, overrides);
    if (!pricing) {
        return null;
    }
    const totalTokens = sessionTokens.inputTokens
        + sessionTokens.cacheCreationTokens
        + sessionTokens.cacheReadTokens
        + sessionTokens.outputTokens;
    if (totalTokens === 0) {
        return null;
    }
    const inputUsd = calculateUsd(sessionTokens.inputTokens, pricing.inputUsdPerMillion);
    const cacheCreationUsd = calculateUsd(sessionTokens.cacheCreationTokens, pricing.inputUsdPerMillion * CACHE_WRITE_MULTIPLIER);
    const cacheReadUsd = calculateUsd(sessionTokens.cacheReadTokens, pricing.inputUsdPerMillion * CACHE_READ_MULTIPLIER);
    const outputUsd = calculateUsd(sessionTokens.outputTokens, pricing.outputUsdPerMillion);
    return {
        totalUsd: inputUsd + cacheCreationUsd + cacheReadUsd + outputUsd,
        inputUsd,
        cacheCreationUsd,
        cacheReadUsd,
        outputUsd,
    };
}
function getNativeCostUsd(stdin) {
    const nativeCost = stdin.cost?.total_cost_usd;
    if (typeof nativeCost !== 'number' || !Number.isFinite(nativeCost)) {
        return null;
    }
    if (isBedrockModelId(stdin.model?.id)) {
        return null;
    }
    if (isVertexModelId(stdin.model?.id)) {
        return null;
    }
    return nativeCost;
}
export function resolveSessionCost(stdin, sessionTokens, overrides) {
    const nativeCostUsd = getNativeCostUsd(stdin);
    if (nativeCostUsd !== null) {
        return {
            totalUsd: nativeCostUsd,
            source: 'native',
        };
    }
    const estimate = estimateSessionCost(stdin, sessionTokens, overrides);
    if (!estimate) {
        return null;
    }
    return {
        totalUsd: estimate.totalUsd,
        source: 'estimate',
    };
}
export function formatUsd(amount) {
    if (amount >= 1) {
        return `$${amount.toFixed(2)}`;
    }
    if (amount >= 0.1) {
        return `$${amount.toFixed(3)}`;
    }
    return `$${amount.toFixed(4)}`;
}
//# sourceMappingURL=cost.js.map