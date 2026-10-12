import { describe, expect, it } from 'vitest';
import {
    type MarkGrantSource,
    type SpecialAbilityDistinctionFields,
    awardDistinction,
    canGainSpecialAbility,
    canGainSpecialAbilityFromRenown,
    isRenownCategory,
    isSpecialAbilityCategory,
    mergeMarkGrants,
    specialAbilityCategoryLabelKey,
} from './dw-distinction';

type GateAbility = Pick<SpecialAbilityDistinctionFields, 'category' | 'renownRequired'>;
type RewardAbility = Pick<SpecialAbilityDistinctionFields, 'category' | 'renownReward'>;

const makeMark = (over: { trait?: string; activeEffect?: string; characteristics?: Record<string, number> } = {}): MarkGrantSource => ({
    grant: { trait: over.trait ?? '', activeEffect: over.activeEffect ?? '' },
    modifiers: { characteristics: over.characteristics ?? {} },
});

describe('special-ability categories', () => {
    it('recognises the four categories and nothing else', () => {
        expect(['speciality', 'advanced', 'distinction', 'mark'].every((c) => isSpecialAbilityCategory(c))).toBe(true);
        expect(isSpecialAbilityCategory('honour')).toBe(false);
        expect(isSpecialAbilityCategory(null)).toBe(false);
    });

    it('builds a langpack key per category', () => {
        expect(specialAbilityCategoryLabelKey('mark')).toBe('WH40K.SpecialAbility.Category.Mark');
        expect(specialAbilityCategoryLabelKey('speciality')).toBe('WH40K.SpecialAbility.Category.Speciality');
    });

    it('takes only advanced / distinction / mark into the Renown rules', () => {
        expect(isRenownCategory('speciality')).toBe(false);
        expect(isRenownCategory('advanced')).toBe(true);
        expect(isRenownCategory('distinction')).toBe(true);
        expect(isRenownCategory('mark')).toBe(true);
    });
});

describe('canGainSpecialAbility', () => {
    const gated: GateAbility = { category: 'advanced', renownRequired: 'famed' };

    it('allows gaining when the actor rank equals the required rank', () => {
        expect(canGainSpecialAbility({ ability: gated, actorRenownRank: 'famed' })).toEqual({ allowed: true });
    });

    it('allows gaining when the actor rank exceeds the required rank', () => {
        expect(canGainSpecialAbility({ ability: gated, actorRenownRank: 'hero' })).toEqual({ allowed: true });
    });

    it('refuses below the required rank and names the rank needed', () => {
        expect(canGainSpecialAbility({ ability: gated, actorRenownRank: 'distinguished' })).toEqual({
            allowed: false,
            reason: 'rank-too-low',
            requiredRank: 'famed',
        });
    });

    it('lets an ability with no printed requirement through at any rank', () => {
        expect(canGainSpecialAbility({ ability: { category: 'mark', renownRequired: null }, actorRenownRank: 'initiated' })).toEqual({ allowed: true });
    });

    it('never gates a speciality ability, even if a rank were authored on it', () => {
        expect(canGainSpecialAbility({ ability: { category: 'speciality', renownRequired: 'hero' }, actorRenownRank: 'initiated' })).toEqual({
            allowed: true,
        });
    });
});

describe('canGainSpecialAbilityFromRenown', () => {
    const gated: GateAbility = { category: 'distinction', renownRequired: 'distinguished' };

    it('resolves the rank from the raw Renown score (40 = Distinguished)', () => {
        expect(canGainSpecialAbilityFromRenown({ ability: gated, actorRenown: 40 })).toEqual({ allowed: true });
    });

    it('refuses one point under the threshold', () => {
        expect(canGainSpecialAbilityFromRenown({ ability: gated, actorRenown: 39 })).toMatchObject({ allowed: false, reason: 'rank-too-low' });
    });
});

describe('awardDistinction', () => {
    const rewarded: RewardAbility = { category: 'distinction', renownReward: 5 };

    it('adds the reward to the current Renown', () => {
        expect(awardDistinction({ ability: rewarded, currentRenown: 20 })).toEqual({ newRenown: 25, changed: true });
    });

    it('does not clamp the ceiling — Hero Marines exceed 100', () => {
        expect(awardDistinction({ ability: { category: 'mark', renownReward: 10 }, currentRenown: 98 })).toEqual({ newRenown: 108, changed: true });
    });

    it('leaves Renown alone for a zero reward', () => {
        expect(awardDistinction({ ability: { category: 'mark', renownReward: 0 }, currentRenown: 30 })).toEqual({ newRenown: 30, changed: false });
    });

    it('never rewards a speciality ability', () => {
        expect(awardDistinction({ ability: { category: 'speciality', renownReward: 5 }, currentRenown: 30 })).toEqual({
            newRenown: 30,
            changed: false,
        });
    });
});

describe('mergeMarkGrants', () => {
    it('returns an empty payload for no marks', () => {
        expect(mergeMarkGrants([])).toEqual({ characteristicDelta: {}, traits: [], activeEffects: [] });
    });

    it('sums characteristic changes from each mark’s modifiers', () => {
        const merged = mergeMarkGrants([makeMark({ characteristics: { perception: 10 } }), makeMark({ characteristics: { perception: 5, willpower: 10 } })]);
        expect(merged.characteristicDelta).toEqual({ perception: 15, willpower: 10 });
    });

    it('coalesces duplicate traits and Active Effect ids and skips blanks', () => {
        const trait = 'Compendium.wh40k-rpg.dw-core-items-traits.Item.abc';
        const merged = mergeMarkGrants([makeMark({ trait, activeEffect: 'fx' }), makeMark({ trait, activeEffect: 'fx' }), makeMark()]);
        expect(merged.traits).toEqual([trait]);
        expect(merged.activeEffects).toEqual(['fx']);
    });

    it('ignores non-finite characteristic changes defensively', () => {
        const merged = mergeMarkGrants([makeMark({ characteristics: { strength: Number.NaN, toughness: 5 } })]);
        expect(merged.characteristicDelta).toEqual({ toughness: 5 });
    });
});
