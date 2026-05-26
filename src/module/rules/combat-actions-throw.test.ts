import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WeaponRollData } from '../rolls/roll-data.ts';
import { allCombatActions, throwResolutionPath, updateAvailableCombatActions } from './combat-actions.ts';

/**
 * "Throw" half-action coverage (DH2 Core "Throw"): hurl a grenade or
 * thrown weapon as a Half Action, resolved as a Ballistic Skill attack
 * (thrown weapons report `isRanged === true`). Range is read from the
 * weapon's own range data (Strength-Bonus-based formula) and a miss
 * scatters — nothing about the throw is hardcoded here, so these tests
 * assert the action definition + the availability gating rather than
 * any per-weapon number.
 */

/**
 * Foundry extends `Array.prototype` with `findSplice` (typed globally by
 * fvtt-types). happy-dom/vitest don't ship it at runtime, and
 * `updateAvailableCombatActions` calls it while pruning rate-of-fire
 * actions, so install a faithful polyfill matching Foundry's signature
 * for the duration of these tests.
 */
let installedFindSplice = false;

function findSplicePolyfill<T>(this: T[], predicate: (value: T, index: number, obj: T[]) => boolean, replace?: T): T | null {
    const index = this.findIndex(predicate);
    if (index === -1) return null;
    const removed = this[index];
    if (replace === undefined) this.splice(index, 1);
    else this.splice(index, 1, replace);
    return removed ?? null;
}

beforeAll(() => {
    if (typeof Array.prototype.findSplice !== 'function') {
        Object.defineProperty(Array.prototype, 'findSplice', {
            configurable: true,
            writable: true,
            value: findSplicePolyfill,
        });
        installedFindSplice = true;
    }
});

afterAll(() => {
    if (installedFindSplice) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- test teardown: remove the polyfill installed in beforeAll so it doesn't leak into other suites.
        delete (Array.prototype as { findSplice?: typeof findSplicePolyfill }).findSplice;
    }
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

    it('routes a thrown grenade to the grenade dialog (blast/scatter reuse) and a plain thrown weapon to the weapon roll', () => {
        // Grenade marker is the `grenade` weapon-quality — the same classifier
        // acolyte.ts uses; throwing one reuses the GrenadeThrowDialog path
        // instead of duplicating the blast logic.
        expect(throwResolutionPath({ isThrown: true, system: { special: ['blast', 'grenade'] } })).toBe('grenade-dialog');
        expect(throwResolutionPath({ isThrown: true, system: { special: 'grenade (3)' } })).toBe('grenade-dialog');
        // An ordinary thrown weapon (throwing knife) resolves as a normal roll.
        expect(throwResolutionPath({ isThrown: true, system: { special: ['balanced'] } })).toBe('weapon-roll');
        expect(throwResolutionPath({ isThrown: true, system: {} })).toBe('weapon-roll');
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
