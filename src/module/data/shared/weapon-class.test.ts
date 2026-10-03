import { describe, expect, it } from 'vitest';
import { isWeaponClass, WEAPON_CLASS_CHOICES } from './weapon-class.ts';

/**
 * The weapon schema's `class` choices and the `_migrateData` guard that maps
 * anything else to `exotic`. `vehicle` (OW Core: Battle Cannon, Earthshaker, …)
 * and `placed` (DW Rites of Battle: Melta Bomb, "Placed Explosive") are printed
 * classes, so they must survive migration instead of collapsing to `exotic`.
 */
describe('weapon class choices', () => {
    it('accepts every printed class, including vehicle and placed', () => {
        for (const cls of ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'exotic', 'vehicle', 'placed']) {
            expect(isWeaponClass(cls)).toBe(true);
        }
        expect(WEAPON_CLASS_CHOICES).toContain('vehicle');
        expect(WEAPON_CLASS_CHOICES).toContain('placed');
    });

    it('rejects values that are not a printed class (migrated to exotic)', () => {
        expect(isWeaponClass('low-tech')).toBe(false);
        expect(isWeaponClass('Melee')).toBe(false);
        expect(isWeaponClass('')).toBe(false);
    });
});
