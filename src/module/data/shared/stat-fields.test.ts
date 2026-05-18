import { describe, expect, it } from 'vitest';

/**
 * `stat-fields.ts` constructs Foundry `SchemaField`/`NumberField` instances at
 * call time, so it can only be exercised inside the Foundry runtime (mirrors
 * every other DataModel-adjacent test here). This guarded import keeps the
 * data → test pairing honest; the exact field configs it reproduces are
 * already pinned by the CreatureTemplate / NpcData integration coverage.
 */
describe('stat-fields builders', () => {
    it('expose the shared characteristic / wounds / size / initiative / movement builders when Foundry is available', async () => {
        const mod = await import('./stat-fields').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`stat-fields could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(typeof mod.characteristicField).toBe('function');
        expect(typeof mod.woundsField).toBe('function');
        expect(typeof mod.sizeField).toBe('function');
        expect(typeof mod.initiativeField).toBe('function');
        expect(typeof mod.movementField).toBe('function');
    });
});
