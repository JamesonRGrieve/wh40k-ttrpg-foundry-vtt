import { describe, expect, it } from 'vitest';
import { isGrenadeWeapon } from './grenade-weapon.ts';

/**
 * The grenade classifier (#619). Grenade detection used to call `.includes` on
 * `special`, a Set at runtime, so it never matched; and no DH2 pack weapon carries
 * the Grenade quality. Every grenade in the packs is a `thrown` weapon of the line's
 * grenade type, which is what the classifier reads.
 */
describe('isGrenadeWeapon (#619)', () => {
    it('reads a DH1 / DH2 grenade from its thrown class and grenade type', () => {
        // The DH2 Frag Grenade: thrown, type grenade, special a Set of quality ids.
        expect(isGrenadeWeapon({ class: 'thrown', type: 'grenade', special: new Set(['blast-3']) })).toBe(true);
    });

    it('reads an RT / DW grenade from its thrown class and explosive type', () => {
        expect(isGrenadeWeapon({ class: 'thrown', type: 'explosive', special: new Set(['blast-4']) })).toBe(true);
    });

    it('reads the Grenade quality from the special Set, whatever the class', () => {
        expect(isGrenadeWeapon({ class: 'basic', type: 'launcher', special: new Set(['grenade', 'blast-3']) })).toBe(true);
    });

    it('is not fooled by a quality id that merely contains "grenade"', () => {
        expect(isGrenadeWeapon({ class: 'basic', type: 'launcher', special: new Set(['grenade-launcher-ammo']) })).toBe(false);
    });

    it('leaves an ordinary thrown weapon, a launcher and a placed charge alone', () => {
        expect(isGrenadeWeapon({ class: 'thrown', type: 'primitive', special: new Set(['balanced']) })).toBe(false);
        expect(isGrenadeWeapon({ class: 'basic', type: 'launcher', special: new Set() })).toBe(false);
        expect(isGrenadeWeapon({ class: 'placed', type: 'explosive' })).toBe(false);
        expect(isGrenadeWeapon({})).toBe(false);
    });
});
