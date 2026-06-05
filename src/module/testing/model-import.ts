/**
 * Import a DataModel / Document module, resolving to `undefined` (with a console
 * warning) when it can't be loaded in the current environment instead of throwing.
 *
 * happy-dom lacks the `foundry.*` globals these modules evaluate at module-load
 * (`extends foundry.abstract.DataModel`, `foundry.data.fields.*`), so a direct
 * `import()` rejects. Callers do `const mod = await importModelOrSkip(import('./x'));
 * if (mod === undefined) return;` to skip cleanly — centralizing the import-or-skip
 * boilerplate that was copy-pasted (with its own `eslint-disable`) across ~60
 * model/document test files (#268).
 *
 * Takes the module promise directly (not a `() => Promise` thunk) so call sites
 * stay clear of `@typescript-eslint/promise-function-async`. Lives under
 * `src/module/testing/` (not `tests/lib/`) so co-located `src/**` test files can
 * import it without violating the main tsconfig's `rootDir: src`.
 */
export async function importModelOrSkip<T>(modulePromise: Promise<T>): Promise<T | undefined> {
    try {
        return await modulePromise;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console -- test diagnostic: surface why a model import was skipped under happy-dom
        console.warn(`[model-import] skipped: ${msg}`);
        return undefined;
    }
}
