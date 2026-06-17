/**
 * @file DialogResolution — promise-resolution plumbing for ApplicationV2 dialogs.
 *
 * Several dialogs (origin-detail / origin-path-choice / origin-roll, npc/quick-create,
 * batch / threat-scaler) hand-rolled the same shape: a nullable resolver field,
 * `new Promise(resolve => { dialog._resolvePromise = resolve; render(); })`,
 * resolve-on-confirm / resolve-on-cancel, and a `close()` that resolves a default
 * value when the dialog is dismissed. The field name even drifted (`_resolve` vs
 * `_resolvePromise`). This helper owns that plumbing once (#287, Direction #4).
 *
 * It is a **composition** helper, not a class mixin: stacking a generic mixin over
 * `HandlebarsApplicationMixin(ApplicationV2)` erodes the base type down to
 * `ApplicationV2.Any`, which cascades type loss into every `super._prepareContext` /
 * static `DEFAULT_OPTIONS` the dialog already relies on. Holding a
 * `DialogResolution<T>` field (has-a) keeps each dialog's existing typing intact
 * while still centralizing the resolver logic, and it is independently unit-testable.
 *
 * Usage:
 *   readonly #resolution = new DialogResolution<MyResult | null>(null);
 *
 *   static async show(): Promise<MyResult | null> {
 *     const dialog = new MyDialog();
 *     const result = dialog.#resolution.track();
 *     await dialog.render({ force: true });
 *     return result;
 *   }
 *   static #confirm(this: MyDialog): void { this.#resolution.resolve(this.result); void this.close(); }
 *   // cancel / dismiss: `void this.close()`, and in close(): `this.#resolution.resolveDefault();`
 */
export default class DialogResolution<T> {
    #resolve: ((value: T) => void) | null = null;

    /**
     * @param defaultValue  Value resolved when the dialog is dismissed without an
     *                      explicit result (the cancelled marker) — `null` for the
     *                      roll / choice dialogs, `{ selected: false, origin: null }`
     *                      for origin-detail.
     */
    constructor(private readonly defaultValue: T) {}

    /**
     * Begin tracking a resolution and return the promise the caller awaits. Pair with
     * `dialog.render({ force: true })` after calling.
     */
    async track(): Promise<T> {
        return new Promise<T>((resolve) => {
            this.#resolve = resolve;
        });
    }

    /**
     * Resolve the pending promise (if any) with a concrete value and clear it, so a
     * later `resolve` / `resolveDefault` (e.g. from `close()`) does not fire twice.
     */
    resolve(value: T): void {
        if (this.#resolve !== null) {
            this.#resolve(value);
            this.#resolve = null;
        }
    }

    /** Resolve with the cancelled-marker default. Safe to call from `close()` unconditionally. */
    resolveDefault(): void {
        this.resolve(this.defaultValue);
    }

    /** Whether a resolution is still pending (no confirm/cancel/dismiss has fired yet). */
    get pending(): boolean {
        return this.#resolve !== null;
    }
}
