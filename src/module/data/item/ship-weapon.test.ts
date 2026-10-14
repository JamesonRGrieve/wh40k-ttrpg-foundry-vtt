import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * ShipWeaponData migration. Foundry migrates the partial `system` of every
 * update too, so the legacy numeric coercion must only touch the keys present:
 * coercing absent ones to 0 zeroed a mounted weapon's Strength and Crit on any
 * later update, and the voidcraft sheet then fired a 0-die macrobattery pool.
 */
describe('ShipWeaponData._migrateData', () => {
    it('leaves absent numeric fields alone, so a partial update keeps Strength and Crit', async () => {
        const mod = await importModelOrSkip(import('./ship-weapon.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const partial: Record<string, string | number | null> = { notes: 'refitted' };
        mod.default._migrateData(partial);
        expect(partial).toEqual({ notes: 'refitted' });
    });

    it('still coerces the legacy "-" / null / numeric-string values it is given', async () => {
        const mod = await importModelOrSkip(import('./ship-weapon.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const legacy: Record<string, string | number | null> = { strength: '3', crit: '-', power: null, space: 4 };
        mod.default._migrateData(legacy);
        expect(legacy).toMatchObject({ strength: 3, crit: 0, power: 0, space: 4 });
        expect('shipPoints' in legacy).toBe(false);
    });
});
