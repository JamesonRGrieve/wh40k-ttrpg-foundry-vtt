import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WeaponRollData } from '../rolls/roll-data.ts';
import { installFindSplice, uninstallFindSplice } from '../testing/find-splice.ts';
import { riderFixture } from '../testing/grenade-rider-fixture.ts';
import { allCombatActions, resolveThrow, updateAvailableCombatActions } from './combat-actions.ts';

/** A rider as a grenade's compendium document authors it (#135). */
const RIDER = riderFixture({
    test: { characteristic: 'agility', modifier: 10 },
    condition: 'blinded',
    duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
    effect: 'Blinded for a number of rounds equal to his degrees of failure.',
});

/**
 * "Throw" half-action coverage (DH2 "Throw"): hurl a grenade or
 * thrown weapon as a Half Action, resolved as a Ballistic Skill attack
 * (thrown weapons report `isRanged === true`). Range is read from the
 * weapon's own range data (Strength-Bonus-based formula) and a miss
 * scatters — nothing about the throw is hardcoded here, so these tests
 * assert the action definition + the availability gating rather than
 * any per-weapon number.
 */

// `updateAvailableCombatActions` prunes rate-of-fire actions with Foundry's
// `Array.prototype.findSplice`, which the test runtime lacks.
let installedFindSplice = false;

beforeAll(() => {
    installedFindSplice = installFindSplice();
});

afterAll(() => {
    uninstallFindSplice(installedFindSplice);
});

/** Minimal structural surface of WeaponRollData that the function reads. */
interface MockWeapon {
    isRanged: boolean;
    isThrown: boolean;
    isMelee: boolean;
    system: { attack?: { rateOfFire?: { semi?: number; full?: number }; range?: { value?: string | number } } };
}

interface MockRollData {
    weapon: MockWeapon;
    action: string;
    // eslint-disable-next-line no-restricted-syntax -- mirrors WeaponRollData.actions, a rule-module-populated name→name bag typed Record<string, unknown> on the real class.
    actions: Record<string, unknown>;
    // eslint-disable-next-line no-restricted-syntax -- mirrors WeaponRollData.combatActionInformation, a rule-module-populated bag typed Record<string, unknown> on the real class.
    combatActionInformation: Record<string, unknown>;
    hasAttackSpecial: (special: string) => boolean;
}

function makeRollData(weapon: MockWeapon): MockRollData {
    return {
        weapon,
        action: '',
        actions: {},
        combatActionInformation: {},
        hasAttackSpecial: () => false,
    };
}

function runGate(weapon: MockWeapon): string[] {
    const rollData = makeRollData(weapon);
    // eslint-disable-next-line no-restricted-syntax -- structural mock satisfies the narrow surface updateAvailableCombatActions reads; full WeaponRollData carries Foundry-runtime deps unavailable under vitest.
    updateAvailableCombatActions(rollData as unknown as WeaponRollData);
    return Object.keys(rollData.actions);
}

describe('Throw combat action — definition', () => {
    const throwAction = allCombatActions().find((a) => a.name === 'Throw');

    it('is registered as a Half Action attack tagged Ranged + Thrown', () => {
        expect(throwAction).toBeDefined();
        expect(throwAction?.type).toEqual(['Half']);
        expect(throwAction?.subtype).toContain('Attack');
        expect(throwAction?.subtype).toContain('Ranged');
        expect(throwAction?.subtype).toContain('Thrown');
    });

    it('carries no inherent attack modifier (RAW Throw has no flat bonus/penalty)', () => {
        expect(throwAction?.attack?.modifier).toBe(0);
    });
});

describe('Throw combat action — availability gating', () => {
    it('offers Throw (and only Throw) for a thrown weapon', () => {
        const names = runGate({
            isRanged: true,
            isThrown: true,
            isMelee: false,
            system: { attack: { range: { value: '@strengthBonus*3' } } },
        });
        expect(names).toContain('Throw');
        // A thrown weapon must not surface the BS shooting actions.
        expect(names).not.toContain('Standard Attack');
        expect(names).not.toContain('Semi-Auto Burst');
        expect(names).not.toContain('Full Auto Burst');
    });

    it('does NOT offer Throw for a non-thrown ranged weapon', () => {
        const names = runGate({
            isRanged: true,
            isThrown: false,
            isMelee: false,
            system: { attack: { rateOfFire: { semi: 0, full: 0 }, range: { value: 30 } } },
        });
        expect(names).not.toContain('Throw');
        expect(names).toContain('Standard Attack');
    });

    it('does NOT offer Throw for a melee weapon', () => {
        const names = runGate({
            isRanged: false,
            isThrown: false,
            isMelee: true,
            system: {},
        });
        expect(names).not.toContain('Throw');
    });

    it('routes a grenade that carries a rider to the grenade dialog (#619, #135)', () => {
        // The DH2 Photon Flash Grenade as the packs author it: thrown, type grenade,
        // `special` a Set, and its rider on `system.rider`.
        expect(resolveThrow({ class: 'thrown', type: 'grenade', special: new Set(['blast-6']), rider: RIDER }).path).toBe('grenade-dialog');
        // An RT / DW grenade is typed explosive.
        expect(resolveThrow({ class: 'thrown', type: 'explosive', special: new Set(['smoke']), rider: RIDER }).path).toBe('grenade-dialog');
    });

    it('throws a rider grenade that deals damage through the weapon roll, its rider after the damage (#622)', () => {
        // Rad, Psyk-out, Whitefire, Tears of the Emperor: BS test, scatter, Blast, damage — then the rider.
        const rad = { class: 'thrown', type: 'explosive', special: new Set(['blast-2']), rider: RIDER, dealsDamage: true };
        expect(resolveThrow(rad).path).toBe('weapon-roll');
        // A Photon Flash ("–" damage) still opens the dialog, whose card carries the rider.
        expect(resolveThrow({ ...rad, dealsDamage: false }).path).toBe('grenade-dialog');
    });

    it('reads the rider, never the weapon identifier (#135)', () => {
        // A grenade whose identifier the old registry knew, but which carries no rider.
        expect(resolveThrow({ class: 'thrown', type: 'grenade', special: new Set(['blast-6']), rider: null }).path).toBe('weapon-roll');
    });

    it('throws a damage grenade and an ordinary thrown weapon through the weapon roll (#619)', () => {
        // The Frag Grenade's Blast is placed and resolved by the weapon roll (#599).
        expect(resolveThrow({ class: 'thrown', type: 'grenade', special: new Set(['blast-3']), rider: null }).path).toBe('weapon-roll');
        // A throwing knife, and a rider on a weapon that is not a grenade.
        expect(resolveThrow({ class: 'thrown', type: 'primitive', special: new Set(['balanced']) }).path).toBe('weapon-roll');
        expect(resolveThrow({ class: 'basic', type: 'launcher', rider: RIDER }).path).toBe('weapon-roll');
        expect(resolveThrow({}).path).toBe('weapon-roll');
    });

    it('reads the range source from the weapon item, not a hardcoded constant', () => {
        // The Throw action does not embed a range; the only range that exists
        // in the gating path is the one carried on the mock weapon's system
        // data. This pins Direction #7: weapon numbers come from the item.
        const weapon: MockWeapon = {
            isRanged: true,
            isThrown: true,
            isMelee: false,
            system: { attack: { range: { value: '@strengthBonus*3' } } },
        };
        runGate(weapon);
        expect(weapon.system.attack?.range?.value).toBe('@strengthBonus*3');
        // The action registry never hardcodes a metre value for Throw.
        const throwAction = allCombatActions().find((a) => a.name === 'Throw');
        expect(JSON.stringify(throwAction)).not.toMatch(/\b\d+m\b/);
    });
});
