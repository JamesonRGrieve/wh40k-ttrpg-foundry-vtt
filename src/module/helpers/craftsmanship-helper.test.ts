import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CraftsmanshipHelper from './craftsmanship-helper.ts';

/**
 * Coverage for CraftsmanshipHelper (previously untested). It reads
 * CONFIG.WH40K.craftsmanshipRules (a Foundry CONFIG boundary), stubbed here with
 * a representative rules table so the application logic is exercised directly.
 */

const RULES = {
    weapon: {
        melee: { best: { toHit: 10, damage: 1 } },
        ranged: {
            poor: { qualities: ['unreliable'] },
            good: { qualities: ['reliable'] },
            best: { qualities: ['reliable'], removeQualities: ['unreliable'] },
        },
    },
    armour: { best: { armourBonus: 1, weight: 0.5 } },
    gear: {},
    forceField: {
        poor: { overloadRange: [1, 20] },
        best: { overloadRange: [1, 5] },
    },
};

describe('CraftsmanshipHelper', () => {
    beforeEach(() => {
        vi.stubGlobal('CONFIG', { WH40K: { craftsmanshipRules: RULES } });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('getModifiers', () => {
        it('resolves melee-weapon, armour, and force-field tiers', () => {
            expect(CraftsmanshipHelper.getModifiers({ craftsmanship: 'best', melee: true, parent: { type: 'weapon' } })).toEqual({ toHit: 10, damage: 1 });
            expect(CraftsmanshipHelper.getModifiers({ craftsmanship: 'best', parent: { type: 'armour' } })).toEqual({ armourBonus: 1, weight: 0.5 });
            expect(CraftsmanshipHelper.getModifiers({ craftsmanship: 'best', parent: { type: 'forceField' } })).toEqual({ overloadRange: [1, 5] });
        });

        it('returns {} for a tier/type with no rule entry', () => {
            expect(CraftsmanshipHelper.getModifiers({ parent: { type: 'gear' } })).toEqual({});
        });

        it('returns {} (and warns) when CONFIG has no craftsmanship rules', () => {
            vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            vi.stubGlobal('CONFIG', { WH40K: {} });
            expect(CraftsmanshipHelper.getModifiers({ craftsmanship: 'best', parent: { type: 'weapon' } })).toEqual({});
        });
    });

    describe('getWeaponQualities / getRemoveQualities', () => {
        it('returns the ranged add/remove quality sets', () => {
            expect(CraftsmanshipHelper.getWeaponQualities({ craftsmanship: 'poor', melee: false, parent: { type: 'weapon' } })).toEqual(
                new Set(['unreliable']),
            );
            expect(CraftsmanshipHelper.getRemoveQualities({ craftsmanship: 'best', melee: false, parent: { type: 'weapon' } })).toEqual(
                new Set(['unreliable']),
            );
        });

        it('returns an empty set for melee weapons', () => {
            expect(CraftsmanshipHelper.getWeaponQualities({ craftsmanship: 'poor', melee: true, parent: { type: 'weapon' } })).toEqual(new Set());
        });
    });

    describe('applyWeaponQualities', () => {
        it('adds and removes qualities per the tier rules', () => {
            const result = CraftsmanshipHelper.applyWeaponQualities(
                { craftsmanship: 'best', melee: false, parent: { type: 'weapon' } },
                new Set(['unreliable', 'scatter']),
            );
            expect(result).toEqual(new Set(['scatter', 'reliable']));
        });

        it('cancels Unreliable instead of adding Reliable for good/exceptional craftsmanship', () => {
            const result = CraftsmanshipHelper.applyWeaponQualities(
                { craftsmanship: 'good', melee: false, parent: { type: 'weapon' } },
                new Set(['unreliable']),
            );
            expect(result).toEqual(new Set());
        });

        it('leaves melee weapon qualities untouched', () => {
            const input = new Set(['balanced']);
            expect(CraftsmanshipHelper.applyWeaponQualities({ craftsmanship: 'best', melee: true, parent: { type: 'weapon' } }, input)).toBe(input);
        });
    });

    describe('hasCraftsmanshipEffects', () => {
        it('is true for any non-common craftsmanship', () => {
            expect(CraftsmanshipHelper.hasCraftsmanshipEffects({ craftsmanship: 'best' })).toBe(true);
            expect(CraftsmanshipHelper.hasCraftsmanshipEffects({ craftsmanship: 'common' })).toBe(false);
            expect(CraftsmanshipHelper.hasCraftsmanshipEffects({})).toBe(false);
        });
    });

    describe('getForceFieldOverloadRange / isOverloadRoll', () => {
        it('reads the tier overload range with a [1,10] fallback', () => {
            expect(CraftsmanshipHelper.getForceFieldOverloadRange({ craftsmanship: 'poor', parent: { type: 'forceField' } })).toEqual([1, 20]);
            expect(CraftsmanshipHelper.getForceFieldOverloadRange({ craftsmanship: 'common', parent: { type: 'forceField' } })).toEqual([1, 10]);
        });

        it('flags a roll inside the overload range', () => {
            const field = { craftsmanship: 'best', parent: { type: 'forceField' } } as const;
            expect(CraftsmanshipHelper.isOverloadRoll(field, 3)).toBe(true);
            expect(CraftsmanshipHelper.isOverloadRoll(field, 10)).toBe(false);
        });
    });
});
