import { describe, expect, it } from 'vitest';
import { classHasRange, isFirearmClass, isThrownClass, isWeaponClass, WEAPON_CLASS_CHOICES } from './weapon-class.ts';

describe('which weapon classes fire (#699)', () => {
    it('the firearm classes are pistol, basic and heavy', () => {
        expect(WEAPON_CLASS_CHOICES.filter(isFirearmClass)).toEqual(['pistol', 'basic', 'heavy']);
    });

    it('a thrown weapon has a range too, so the Bolas (Thrown 10m) shows one', () => {
        expect(WEAPON_CLASS_CHOICES.filter(classHasRange)).toEqual(['pistol', 'basic', 'heavy', 'thrown']);
        expect(classHasRange('melee')).toBe(false);
    });

    it('only the thrown class is the round itself, with no clip or reload to show (#701)', () => {
        expect(WEAPON_CLASS_CHOICES.filter(isThrownClass)).toEqual(['thrown']);
    });
});

/**
 * The weapon schema's `class` choices and the `_migrateData` guard that maps
 * anything else to `exotic`. `vehicle` (OW: Battle Cannon, Earthshaker, …)
 * and `placed` (a DW supplement: Melta Bomb, "Placed Explosive") are printed
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
