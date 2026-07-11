// CJK terminals render East Asian Ambiguous-width chars (box drawing,
// block elements, arrows, etc.) as 2 cells. The HUD bar/separator/icon
// glyphs fall in those ranges, so width math must follow suit when the
// terminal is in a CJK locale — otherwise wrap calculations under-report
// visual width and the terminal itself wraps.
// https://www.unicode.org/reports/tr11/
//
// IMPORTANT: geometry must follow the *terminal* locale, not the HUD
// display language. `language: zh` only selects translation strings; it
// does NOT mean the terminal renders ambiguous glyphs as wide. Tying the
// two together (e.g. a zh UI on an en_US Ghostty terminal, which renders
// ambiguous chars narrow) makes the HUD over-count cell width and wrap
// lines early, leaving large trailing gaps. So we detect only from the
// system locale signals below.
function detectCjkTerminal() {
    // 1. Detect system locale via Intl (works on all platforms,
    //    returns e.g. 'zh-CN' on Chinese Windows regardless of env vars)
    try {
        const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
        if (/^zh|^ja|^ko/i.test(locale))
            return true;
    }
    catch { }
    // 2. Check LANG / LC_* environment variables (Git Bash on Windows, Linux, macOS)
    const envLang = [process.env.LC_ALL, process.env.LC_CTYPE, process.env.LANG]
        .find(v => v && v.length > 0);
    if (envLang && /zh|ja|ko/i.test(envLang))
        return true;
    return false;
}
export function isCjkAmbiguousWide() {
    return detectCjkTerminal();
}
export function isWideCodePoint(codePoint) {
    return codePoint >= 0x1100 && (codePoint <= 0x115F || // Hangul Jamo
        codePoint === 0x2329 ||
        codePoint === 0x232A ||
        (codePoint >= 0x2E80 && codePoint <= 0xA4CF && codePoint !== 0x303F) ||
        (codePoint >= 0xAC00 && codePoint <= 0xD7A3) ||
        (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
        (codePoint >= 0xFE10 && codePoint <= 0xFE19) ||
        (codePoint >= 0xFE30 && codePoint <= 0xFE6F) ||
        (codePoint >= 0xFF00 && codePoint <= 0xFF60) ||
        (codePoint >= 0xFFE0 && codePoint <= 0xFFE6) ||
        (codePoint >= 0x1F300 && codePoint <= 0x1FAFF) ||
        (codePoint >= 0x20000 && codePoint <= 0x3FFFD));
}
// East Asian Ambiguous-width ranges actually emitted by the HUD:
// box drawing (│ ─), block elements (█ ░), geometric shapes (◐ ● ▸),
// arrows (↑ ↓ →), math operators (≤ ≥), misc symbols (⚠), dingbats
// (✓ ✘), general punctuation (— …), misc technical (⏱).
export function isAmbiguousWideCodePoint(codePoint) {
    if (codePoint < 0x2010)
        return false;
    return ((codePoint >= 0x2010 && codePoint <= 0x2027) ||
        (codePoint >= 0x2030 && codePoint <= 0x205E) ||
        (codePoint >= 0x2190 && codePoint <= 0x21FF) ||
        (codePoint >= 0x2200 && codePoint <= 0x22FF) ||
        (codePoint >= 0x2300 && codePoint <= 0x23FF) ||
        (codePoint >= 0x2460 && codePoint <= 0x24FF) ||
        (codePoint >= 0x2500 && codePoint <= 0x259F) ||
        (codePoint >= 0x25A0 && codePoint <= 0x25FF) ||
        (codePoint >= 0x2600 && codePoint <= 0x26FF) ||
        (codePoint >= 0x2700 && codePoint <= 0x27BF));
}
export function codePointCellWidth(codePoint, ambiguousWide) {
    if (isWideCodePoint(codePoint))
        return 2;
    if (ambiguousWide && isAmbiguousWideCodePoint(codePoint))
        return 2;
    return 1;
}
//# sourceMappingURL=width.js.map