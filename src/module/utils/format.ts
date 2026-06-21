/**
 * Content-agnostic display formatters (#280).
 *
 * Pure number/string formatting primitives shared by TypeScript call sites and
 * the Handlebars `signedNumber` helper, so the "+N / -N" convention lives in one
 * place (and a future locale-aware sign only changes here).
 */

/**
 * Format a number with an explicit sign: `+5`, `-3`, `+0`. Non-finite input
 * (`NaN`, `Infinity`) is treated as `0` → `+0`, matching the long-standing
 * `signedNumber` Handlebars helper this centralizes.
 */
export function formatSigned(n: number): string {
    const num = Number.isFinite(n) ? n : 0;
    return num >= 0 ? `+${num}` : `${num}`;
}

/**
 * Upper-case the first character of a string, leaving the rest untouched. The
 * single source for the `s.charAt(0).toUpperCase() + s.slice(1)` idiom that was
 * reimplemented across helpers / config / documents / utils (#358). Distinct
 * from Foundry's `String.prototype.capitalize`: this is a plain function so
 * non-string-prototype call sites and pure modules can share it. An empty
 * string returns empty.
 */
export function capitalize(text: string): string {
    if (text === '') return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}
