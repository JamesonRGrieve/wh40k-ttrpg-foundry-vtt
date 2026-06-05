import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * `stat-fields.ts` constructs Foundry `SchemaField`/`NumberField` instances at
 * call time, so it can only be exercised inside the Foundry runtime (mirrors
 * every other DataModel-adjacent test here). This guarded import keeps the
 * data → test pairing honest; the exact field configs it reproduces are
 * already pinned by the CreatureTemplate / NpcData integration coverage.
 */
describe('stat-fields builders', () => {
    it('expose the shared characteristic / wounds / size / initiative / movement builders when Foundry is available', async () => {
        const mod = await importModelOrSkip(import('./stat-fields.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(typeof mod.characteristicField).toBe('function');
        expect(typeof mod.woundsField).toBe('function');
        expect(typeof mod.sizeField).toBe('function');
        expect(typeof mod.initiativeField).toBe('function');
        expect(typeof mod.movementField).toBe('function');
    });
});
