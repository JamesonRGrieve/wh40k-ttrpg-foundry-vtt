/**
 * The `safeAttrs` Handlebars helper's markup builder, shared by the runtime
 * helper registry and the Storybook / Vitest template support so both render
 * `system-card.hbs`'s `rootAttrs` identically.
 *
 * Builds `name="value"` attribute pairs from alternating key/value args (the
 * trailing Handlebars options object already dropped). Values are stringified
 * (a boolean renders "true"/"false", matching an inline {{#if}}…{{else}}…) and
 * escaped with `escapeValue`; pairs with an empty / non-string name or a
 * non-primitive value are skipped. The caller wraps the result in a SafeString
 * so it is not double-escaped.
 */
export function buildSafeAttrs<T>(pairs: readonly T[], escapeValue: (value: string) => string): string {
    const out: string[] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) {
        const name = pairs[i];
        const value = pairs[i + 1];
        if (typeof name !== 'string' || name === '') continue;
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
        out.push(`${name}="${escapeValue(String(value))}"`);
    }
    return out.join(' ');
}
