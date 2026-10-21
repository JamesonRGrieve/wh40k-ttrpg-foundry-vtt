/**
 * Regression (#697): the weapon-modifier passes read only nested weapon
 * modifications. They read `state.equipped` on every nested item first, and a
 * psychic power's nested attack special has no `state`, so any roll of a power with
 * one threw.
 */
import { describe, expect, it } from 'vitest';
import { calculateWeaponModifiersAttackBonuses, calculateWeaponModifiersAttackSpecials, updateWeaponModifiers } from './weapon-modifiers.ts';

/** A psychic-roll-shaped probe whose power holds one nested attack special. */
function powerWithSpecial(): {
    power: { items: Array<{ isWeaponModification: boolean; isAttackSpecial: boolean; name: string; system: { enabled: boolean } }> };
    attackSpecials: Array<{ name: string }>;
    weaponModifications: Array<{ name: string }>;
    weaponModifiers: Record<string, number>;
    modifiers: Record<string, number>;
    action: string;
} {
    return {
        power: { items: [{ isWeaponModification: false, isAttackSpecial: true, name: 'Defensive', system: { enabled: true } }] },
        attackSpecials: [{ name: 'Defensive' }],
        weaponModifications: [],
        weaponModifiers: {},
        modifiers: {},
        action: 'Standard Attack',
    };
}

type Probe = ReturnType<typeof powerWithSpecial>;
// eslint-disable-next-line no-restricted-syntax -- structural mock satisfies the narrow surface these passes read; the full roll data carries Foundry-runtime deps unavailable under vitest.
const asRollData = <T>(probe: Probe): T => probe as unknown as T;

describe('weapon-modifier passes skip nested items that are not modifications (#697)', () => {
    it('lists no modification for a power holding only an attack special', () => {
        const probe = powerWithSpecial();
        updateWeaponModifiers(asRollData<Parameters<typeof updateWeaponModifiers>[0]>(probe));
        expect(probe.weaponModifications).toEqual([]);
    });

    it('leaves the attack special in place and adds no modifier bonus', () => {
        const probe = powerWithSpecial();
        calculateWeaponModifiersAttackSpecials(asRollData<Parameters<typeof calculateWeaponModifiersAttackSpecials>[0]>(probe));
        calculateWeaponModifiersAttackBonuses(asRollData<Parameters<typeof calculateWeaponModifiersAttackBonuses>[0]>(probe));
        expect(probe.attackSpecials).toEqual([{ name: 'Defensive' }]);
        expect(probe.weaponModifiers).toEqual({});
    });
});
