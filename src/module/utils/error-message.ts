/**
 * @file Caught-value message extraction.
 *
 * `catch` bindings are typed `unknown` under strict TypeScript
 * (`useUnknownInCatchVariables`), so reading `.message` off them requires a
 * narrowing — not an `as Error` cast, which throws away type information and
 * registers as an untyped hole under `type-coverage`. {@link errorMessage}
 * narrows structurally and falls back to `String(...)` for thrown non-Error
 * values (strings, plain objects, `undefined`), so call sites stay fully typed.
 */

/**
 * Extract a human-readable message from an arbitrary caught value.
 *
 * @param error A value from a `catch` binding (type `unknown`) or any thrown value.
 * @returns `error.message` when it is an {@link Error}; the string itself when it
 *          is a string; otherwise `String(error)`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: caught values are `unknown` by language design; this IS the narrowing boundary that turns them into a string (instanceof/typeof guards below)
export function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return String(error);
}
