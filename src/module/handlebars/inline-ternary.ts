/**
 * The `iff` Handlebars helper's logic: `(iff cond "yes" "no")`, with the
 * `"no"` branch optional (#229).
 *
 * Handlebars always appends its options object as the helper's LAST argument.
 * The two-argument form `(iff cond "yes")` therefore arrives as
 * `[cond, "yes", options]`, and reading the third positional argument as the
 * false branch returned that options object — which a class attribute then
 * printed as `[object Object]` on every vital panel whose condition was false.
 * Dropping the trailing options object before reading the branches is what
 * makes the false branch genuinely default to `''`.
 *
 * Truthiness matches the other system helpers: only `undefined`, `null`,
 * `false`, `0` and `''` are false.
 */
export function inlineTernary<T>(helperArgs: readonly T[]): T | '' {
    const [cond, ifTrue, ifFalse] = helperArgs.slice(0, -1);
    const truthy = cond !== undefined && cond !== null && cond !== false && cond !== 0 && cond !== '';
    return (truthy ? ifTrue : ifFalse) ?? '';
}
