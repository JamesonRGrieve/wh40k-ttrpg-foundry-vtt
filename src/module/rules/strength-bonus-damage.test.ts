import { describe, expect, it } from 'vitest';
import { weaponAddsStrengthBonus, wielderStrengthBonus } from './strength-bonus-damage.ts';

/**
 * #744: the weapon sheet's Damage tile rolled a melee weapon's damage without the
 * wielder's Strength Bonus, while the attack added it for melee only and the actor
 * sheet's roll added it for thrown weapons too. Every line's rules say melee and
 * thrown weapons add SB, except explosives such as grenades.
 */
describe('weaponAddsStrengthBonus (#744)', () => {
    it('adds SB to a melee weapon', () => {
        expect(
            weaponAddsStrengthBonus({ isMeleeWeapon: true, effectiveClass: 'melee', class: 'melee', type: 'primitive', special: new Set(['toxic-4']) }),
        ).toBe(true);
    });

    it('adds SB to a thrown weapon that is not a grenade', () => {
        expect(
            weaponAddsStrengthBonus({ isMeleeWeapon: false, effectiveClass: 'thrown', class: 'thrown', type: 'primitive', special: new Set(['balanced']) }),
        ).toBe(true);
    });

    it('leaves a thrown grenade without SB, by type or by the Grenade quality', () => {
        expect(
            weaponAddsStrengthBonus({ isMeleeWeapon: false, effectiveClass: 'thrown', class: 'thrown', type: 'grenade', special: new Set(['blast-3']) }),
        ).toBe(false);
        expect(weaponAddsStrengthBonus({ isMeleeWeapon: false, effectiveClass: 'thrown', class: 'thrown', type: 'explosive', special: new Set() })).toBe(false);
        expect(
            weaponAddsStrengthBonus({ isMeleeWeapon: false, effectiveClass: 'thrown', class: 'thrown', type: 'primitive', special: new Set(['grenade']) }),
        ).toBe(false);
    });

    it('leaves a firearm without SB', () => {
        expect(weaponAddsStrengthBonus({ isMeleeWeapon: false, effectiveClass: 'basic', class: 'basic', type: 'las', special: new Set() })).toBe(false);
        expect(weaponAddsStrengthBonus({ isMeleeWeapon: false, effectiveClass: 'pistol', class: 'pistol', type: 'solid-projectile', special: new Set() })).toBe(
            false,
        );
    });

    it("follows the active firing mode's class, not the base class", () => {
        // A dual weapon in its melee mode adds SB; in its ranged mode it doesn't.
        expect(weaponAddsStrengthBonus({ isMeleeWeapon: true, effectiveClass: 'melee', class: 'basic', type: 'flame', special: new Set() })).toBe(true);
        expect(weaponAddsStrengthBonus({ isMeleeWeapon: false, effectiveClass: 'basic', class: 'melee', type: 'power', special: new Set() })).toBe(false);
    });
});

describe('wielderStrengthBonus (#744, #415)', () => {
    it('reads the effective bonus, so fatigue or a drug changes the damage', () => {
        expect(wielderStrengthBonus({ bonus: 4, effectiveBonus: 3 })).toBe(3);
    });

    it('falls back to the plain bonus when no effective bonus is prepared', () => {
        expect(wielderStrengthBonus({ bonus: 4 })).toBe(4);
        expect(wielderStrengthBonus({ bonus: 4, effectiveBonus: undefined })).toBe(4);
    });

    it('is 0 with no Strength characteristic', () => {
        expect(wielderStrengthBonus(undefined)).toBe(0);
    });
});
