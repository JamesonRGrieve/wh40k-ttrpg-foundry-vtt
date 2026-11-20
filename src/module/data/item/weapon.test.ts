import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * WeaponData migration. Foundry migrates the partial `system` of every update too,
 * so `special` must only be normalized when present: defaulting an absent one to
 * `[]` wiped a weapon's own qualities on any update that didn't carry them, the
 * identifier stamped at create among them (#745).
 */
describe('WeaponData._migrateData special', () => {
    it('leaves an absent special alone, so a partial update keeps the qualities', async () => {
        const mod = await importModelOrSkip(import('./weapon.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const partial: Record<string, string | string[] | null> = { identifier: 'probe-pistol' };
        mod.default._migrateData(partial);
        expect('special' in partial).toBe(false);
    });

    it('still normalizes a present special: a set to an array, null to empty', async () => {
        const mod = await importModelOrSkip(import('./weapon.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const fromSet: Record<string, Set<string> | string[]> = { special: new Set(['balanced', 'toxic-4']) };
        mod.default._migrateData(fromSet);
        expect(fromSet['special']).toEqual(['balanced', 'toxic-4']);
        const fromNull: Record<string, string[] | null> = { special: null };
        mod.default._migrateData(fromNull);
        expect(fromNull['special']).toEqual([]);
    });
});
