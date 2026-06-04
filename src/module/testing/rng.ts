/**
 * Deterministic scripted RNG for unit tests (#270).
 *
 * Distinct from the stateless seeded stream `seedRandom(seed)` in
 * `stories/mocks/extended.ts`: `scriptedRng` pins an *exact* sequence of rolls,
 * which is what dice-resolution tests need to assert a specific outcome. Lives
 * under `src/module/` so co-located `src/module/**` tests can import it without
 * tripping the main tsconfig's `rootDir: "src"` (TS6059); `stories/mocks/
 * extended.ts` re-exports it so stories can reach the same implementation.
 * Test-only — never referenced by the runtime import graph.
 */

/**
 * Build a deterministic RNG that yields `values` in order, repeating the last
 * value once the script is exhausted (so an over-eager consumer never reads
 * `undefined`). Returns `0` only when `values` is empty.
 */
export function scriptedRng(values: readonly number[]): () => number {
    let i = 0;
    return (): number => {
        const idx = Math.min(i, values.length - 1);
        i++;
        return values[idx] ?? 0;
    };
}
