import { isLimitReached } from "../../types.js";
import { shouldHideUsage } from "../../stdin.js";
import { critical, label, getQuotaColor, quotaBar, RESET, DIM } from "../colors.js";
import { getAdaptiveBarWidth } from "../../utils/terminal.js";
import { t } from "../../i18n/index.js";
import { progressLabel } from "./label-align.js";
import { formatResetTime } from "../format-reset-time.js";
const FIVE_HOUR_WINDOW_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export function renderUsageLine(ctx, alignLabels = false) {
    const display = ctx.config?.display;
    const colors = ctx.config?.colors;
    if (display?.showUsage === false) {
        return null;
    }
    if (!ctx.usageData) {
        return null;
    }
    if (shouldHideUsage(ctx.stdin)) {
        return null;
    }
    const stale = ctx.usageData.stale === true;
    const hasUsageData = ctx.usageData.fiveHour !== null || ctx.usageData.sevenDay !== null;
    const usageLabel = progressLabel(hasUsageData ? "label.usage" : "label.balance", colors, alignLabels);
    const renderBalance = (text) => stale ? label(text, colors) : `${getQuotaColor(0, colors)}${text}${RESET}`;
    if (!hasUsageData && ctx.usageData.balanceLabel) {
        return `${usageLabel} ${renderBalance(ctx.usageData.balanceLabel)}`;
    }
    const balancePrefix = ctx.usageData.balanceLabel ? `${renderBalance(ctx.usageData.balanceLabel)} ` : '';
    const timeFormat = normalizeTimeFormat(display?.timeFormat);
    const showResetLabel = display?.showResetLabel ?? true;
    const resetsKey = limitResetTimeFormat(timeFormat) === 'absolute' ? "format.resets" : "format.resetsIn";
    const usageCompact = display?.usageCompact ?? false;
    const usageValueMode = display?.usageValue ?? 'percent';
    if (isLimitReached(ctx.usageData)) {
        const limitTimeFormat = limitResetTimeFormat(timeFormat);
        const resetTime = ctx.usageData.fiveHour === 100
            ? formatResetTime(ctx.usageData.fiveHourResetAt, limitTimeFormat)
            : formatResetTime(ctx.usageData.sevenDayResetAt, limitTimeFormat);
        if (usageCompact) {
            return critical(`⚠ Limit${resetTime ? ` (${resetTime})` : ""}`, colors);
        }
        const resetSuffix = resetTime
            ? showResetLabel
                ? ` (${t(resetsKey)} ${resetTime})`
                : ` (${resetTime})`
            : "";
        return `${usageLabel} ${critical(`⚠ ${t("status.limitReached")}${resetSuffix}`, colors)}`;
    }
    const threshold = display?.usageThreshold ?? 0;
    const fiveHour = ctx.usageData.fiveHour;
    const sevenDay = ctx.usageData.sevenDay;
    const effectiveUsage = Math.max(fiveHour ?? 0, sevenDay ?? 0);
    if (effectiveUsage < threshold) {
        if (ctx.usageData.balanceLabel) {
            return `${usageLabel} ${renderBalance(ctx.usageData.balanceLabel)}`;
        }
        return null;
    }
    const sevenDayThreshold = display?.sevenDayThreshold ?? 80;
    if (usageCompact) {
        const fiveHourPart = fiveHour !== null
            ? formatCompactWindowPart("5h", fiveHour, ctx.usageData.fiveHourResetAt, FIVE_HOUR_WINDOW_MS, timeFormat, colors, usageValueMode, stale)
            : null;
        const sevenDayPart = (sevenDay !== null && (fiveHour === null || sevenDay >= sevenDayThreshold))
            ? formatCompactWindowPart("7d", sevenDay, ctx.usageData.sevenDayResetAt, SEVEN_DAY_WINDOW_MS, timeFormat, colors, usageValueMode, stale)
            : null;
        if (fiveHourPart && sevenDayPart) {
            return `${usageLabel} ${balancePrefix}${fiveHourPart} | ${sevenDayPart}`;
        }
        return fiveHourPart
            ? `${usageLabel} ${balancePrefix}${fiveHourPart}`
            : sevenDayPart
                ? `${usageLabel} ${balancePrefix}${sevenDayPart}`
                : null;
    }
    const usageBarEnabled = display?.usageBarEnabled ?? true;
    const barWidth = getAdaptiveBarWidth();
    if (fiveHour === null && sevenDay !== null) {
        const weeklyOnlyPart = formatUsageWindowPart({
            label: t("label.weekly"),
            labelKey: "label.weekly",
            percent: sevenDay,
            resetAt: ctx.usageData.sevenDayResetAt,
            windowMs: SEVEN_DAY_WINDOW_MS,
            colors,
            usageBarEnabled,
            barWidth,
            timeFormat,
            showResetLabel,
            forceLabel: true,
            alignLabels,
            usageValueMode,
            stale,
        });
        return `${usageLabel} ${balancePrefix}${weeklyOnlyPart}`;
    }
    const fiveHourPart = formatUsageWindowPart({
        label: "5h",
        percent: fiveHour,
        resetAt: ctx.usageData.fiveHourResetAt,
        windowMs: FIVE_HOUR_WINDOW_MS,
        colors,
        usageBarEnabled,
        barWidth,
        timeFormat,
        showResetLabel,
        usageValueMode,
        stale,
    });
    if (sevenDay !== null && sevenDay >= sevenDayThreshold) {
        const sevenDayPart = formatUsageWindowPart({
            label: t("label.weekly"),
            labelKey: "label.weekly",
            percent: sevenDay,
            resetAt: ctx.usageData.sevenDayResetAt,
            windowMs: SEVEN_DAY_WINDOW_MS,
            colors,
            usageBarEnabled,
            barWidth,
            timeFormat,
            showResetLabel,
            forceLabel: true,
            alignLabels,
            usageValueMode,
            stale,
        });
        return `${usageLabel} ${balancePrefix}${fiveHourPart} | ${sevenDayPart}`;
    }
    return `${usageLabel} ${balancePrefix}${fiveHourPart}`;
}
function formatCompactWindowPart(windowLabel, percent, resetAt, windowMs, timeFormat, colors, usageValueMode = 'percent', stale = false) {
    const usageDisplay = formatUsagePercent(percent, colors, usageValueMode, stale);
    const reset = formatWindowTime(resetAt, windowMs, timeFormat);
    const styledLabel = label(`${windowLabel}:`, colors);
    return reset
        ? `${styledLabel} ${usageDisplay} ${label(`(${reset})`, colors)}`
        : `${styledLabel} ${usageDisplay}`;
}
function formatUsagePercent(percent, colors, mode = 'percent', stale = false) {
    if (percent === null) {
        return label("--", colors);
    }
    if (stale) {
        const displayPercent = mode === 'remaining' ? Math.max(0, 100 - percent) : percent;
        return `${DIM}${displayPercent}%${RESET}`;
    }
    const color = getQuotaColor(percent, colors);
    const displayPercent = mode === 'remaining' ? Math.max(0, 100 - percent) : percent;
    return `${color}${displayPercent}%${RESET}`;
}
function dimBar(percent, width, colors) {
    const safeWidth = Number.isFinite(width) ? Math.max(0, Math.round(width)) : 0;
    const safePercent = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 0;
    const filled = Math.round((safePercent / 100) * safeWidth);
    const empty = safeWidth - filled;
    const filledChar = colors?.barFilled ?? '█';
    const emptyChar = colors?.barEmpty ?? '░';
    return `${DIM}${filledChar.repeat(filled)}${emptyChar.repeat(empty)}${RESET}`;
}
function formatUsageWindowPart({ label: windowLabel, labelKey, percent, resetAt, windowMs, colors, usageBarEnabled, barWidth, timeFormat = 'relative', showResetLabel, forceLabel = false, alignLabels = false, usageValueMode = 'percent', stale = false, }) {
    const usageDisplay = formatUsagePercent(percent, colors, usageValueMode, stale);
    const reset = formatWindowTime(resetAt, windowMs, timeFormat);
    const styledLabel = labelKey
        ? progressLabel(labelKey, colors, alignLabels)
        : label(windowLabel, colors);
    const showResetWording = timeFormat !== 'elapsed' && timeFormat !== 'elapsedAndAbsolute';
    const resetsKey = timeFormat === 'absolute' ? "format.resets" : "format.resetsIn";
    const resetSuffix = reset
        ? showResetLabel && showResetWording
            ? `(${t(resetsKey)} ${reset})`
            : `(${reset})`
        : "";
    if (usageBarEnabled) {
        const bar = stale ? dimBar(percent ?? 0, barWidth, colors) : quotaBar(percent ?? 0, barWidth, colors);
        const body = resetSuffix
            ? `${bar} ${usageDisplay} ${resetSuffix}`
            : `${bar} ${usageDisplay}`;
        return forceLabel ? `${styledLabel} ${body}` : body;
    }
    return resetSuffix
        ? `${styledLabel} ${usageDisplay} ${resetSuffix}`
        : `${styledLabel} ${usageDisplay}`;
}
function normalizeTimeFormat(value) {
    if (value === 'absolute'
        || value === 'both'
        || value === 'elapsed'
        || value === 'elapsedAndAbsolute') {
        return value;
    }
    return 'relative';
}
function limitResetTimeFormat(timeFormat) {
    if (timeFormat === 'elapsedAndAbsolute') {
        return 'absolute';
    }
    if (timeFormat === 'elapsed') {
        return 'relative';
    }
    return timeFormat;
}
function formatWindowTime(resetAt, windowMs, timeFormat) {
    if (timeFormat === 'elapsed') {
        return formatElapsedWindow(resetAt, windowMs);
    }
    if (timeFormat === 'elapsedAndAbsolute') {
        const elapsed = formatElapsedWindow(resetAt, windowMs);
        const absolute = formatResetTime(resetAt, 'absolute');
        if (elapsed && absolute) {
            return `${elapsed}, ${absolute}`;
        }
        return elapsed || absolute;
    }
    return formatResetTime(resetAt, timeFormat);
}
function formatElapsedWindow(resetAt, windowMs) {
    if (!resetAt) {
        return '';
    }
    const windowStart = resetAt.getTime() - windowMs;
    const rawElapsed = ((Date.now() - windowStart) / windowMs) * 100;
    const elapsed = Math.max(0, Math.min(100, Math.round(rawElapsed)));
    return `${elapsed}% elapsed`;
}
//# sourceMappingURL=usage.js.map