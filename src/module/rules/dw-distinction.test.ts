import { describe, expect, it } from 'vitest';

import {
    type AdvancedSpecialAbility,
    type DistinctionDef,
    type MarkOfDistinction,
    awardDistinction,
    canEarnDistinction,
    canEarnDistinctionFromRenown,
    canUseAdvancedAbility,
    mergeMarkGrants,
} from './dw-distinction';

const makeDistinction = (over: Partial<DistinctionDef> = {}): DistinctionDef => ({
    id: 'honoris-crux',
    name: 'Honoris Crux',
    description: 'Awarded for conspicuous valour in the face of the alien.',
    renownRequired: 'respected',
    renownReward: 5,
    ...over,
});

const makeMark = (over: Partial<MarkOfDistinction> & { grantOver?: Partial<MarkOfDistinction['grant']> } = {}): MarkOfDistinction => {
    const { grantOver, ...rest } = over;
    return {
        id: 'mark-honoris-crux',
        name: 'Mark of Honoris Crux',
        description: 'A laurel of the Long War.',
        grant: {
            id: 'mark-honoris-crux',
            description: 'A laurel of the Long War.',
            ...grantOver,
        },
        ...rest,
    };
};

const makeAbility = (over: Partial<AdvancedSpecialAbility> = {}): AdvancedSpecialAbility => ({
    id: 'rite-of-fury',
    name: 'Rite of Fury',
    description: 'Channel the Emperor’s wrath.',
    renownRequired: 'distinguished',
    cohesionCost: 2,
    ...over,
});

describe('canEarnDistinction', () => {
    it('allows earning when actor rank equals required rank', () => {
        const result = canEarnDistinction({
            distinction: makeDistinction({ renownRequired: 'respected' }),
            actorRenownRank: 'respected',
        });
        expect(result).toEqual({ allowed: true });
    });

    it('allows earning when actor rank exceeds required rank', () => {
        const result = canEarnDistinction({
            distinction: makeDistinction({ renownRequired: 'respected' }),
            actorRenownRank: 'famed',
        });
        expect(result).toEqual({ allowed: true });
    });

    it('refuses earning when actor rank is below the required rank', () => {
        const result = canEarnDistinction({
            distinction: makeDistinction({ renownRequired: 'famed' }),
            actorRenownRank: 'respected',
        });
        expect(result).toEqual({ allowed: false, reason: 'rank-too-low' });
    });
});

describe('canEarnDistinctionFromRenown', () => {
    it('resolves rank from raw Renown and applies the gate', () => {
        const result = canEarnDistinctionFromRenown({
            distinction: makeDistinction({ renownRequired: 'distinguished' }),
            actorRenown: 40,
        });
        expect(result).toEqual({ allowed: true });
    });

    it('refuses when the raw Renown resolves below the required rank', () => {
        const result = canEarnDistinctionFromRenown({
            distinction: makeDistinction({ renownRequired: 'hero' }),
            actorRenown: 25,
        });
        expect(result).toEqual({ allowed: false, reason: 'rank-too-low' });
    });
});

describe('awardDistinction', () => {
    it('adds the reward to current Renown and echoes the distinction id', () => {
        const result = awardDistinction({
            distinction: makeDistinction({ id: 'd1', renownReward: 5 }),
            currentRenown: 22,
        });
        expect(result).toEqual({ newRenown: 27, distinctionId: 'd1' });
    });

    it('clamps the floor at zero when current Renown was negative input (defensive)', () => {
        const result = awardDistinction({
            distinction: makeDistinction({ renownReward: 0 }),
            currentRenown: Number.NaN,
        });
        expect(result.newRenown).toBe(0);
    });

    it('does not clamp the ceiling — Hero Marines exceed 100', () => {
        const result = awardDistinction({
            distinction: makeDistinction({ renownReward: 25 }),
            currentRenown: 90,
        });
        expect(result.newRenown).toBe(115);
    });
});

describe('canUseAdvancedAbility', () => {
    it('allows activation when rank is met and Cohesion covers the cost', () => {
        const result = canUseAdvancedAbility({
            ability: makeAbility({ renownRequired: 'distinguished', cohesionCost: 2 }),
            actorRenownRank: 'famed',
            currentCohesion: 5,
        });
        expect(result).toEqual({ allowed: true });
    });

    it('refuses when rank is below the required rank', () => {
        const result = canUseAdvancedAbility({
            ability: makeAbility({ renownRequired: 'hero', cohesionCost: 1 }),
            actorRenownRank: 'distinguished',
            currentCohesion: 10,
        });
        expect(result).toEqual({ allowed: false, reason: 'rank-too-low' });
    });

    it('refuses when Cohesion is below the ability cost', () => {
        const result = canUseAdvancedAbility({
            ability: makeAbility({ renownRequired: 'respected', cohesionCost: 3 }),
            actorRenownRank: 'respected',
            currentCohesion: 2,
        });
        expect(result).toEqual({ allowed: false, reason: 'insufficient-cohesion' });
    });

    it('skips the Cohesion check when the ability has no cost (passive ability)', () => {
        const passive: AdvancedSpecialAbility = {
            id: 'passive',
            name: 'Passive',
            description: '',
            renownRequired: 'respected',
        };
        const result = canUseAdvancedAbility({
            ability: passive,
            actorRenownRank: 'respected',
            currentCohesion: 0,
        });
        expect(result).toEqual({ allowed: true });
    });

    it('treats rank failure as primary even when Cohesion would also be short', () => {
        const result = canUseAdvancedAbility({
            ability: makeAbility({ renownRequired: 'hero', cohesionCost: 99 }),
            actorRenownRank: 'initiated',
            currentCohesion: 0,
        });
        expect(result).toEqual({ allowed: false, reason: 'rank-too-low' });
    });
});

describe('mergeMarkGrants', () => {
    it('returns empty payload for an empty mark list', () => {
        expect(mergeMarkGrants([])).toEqual({
            characteristicDelta: {},
            traits: [],
            activeEffects: [],
        });
    });

    it('sums characteristic deltas across marks', () => {
        const marks = [
            makeMark({ id: 'a', grantOver: { id: 'a', characteristicDelta: { WS: 5, T: 5 } } }),
            makeMark({ id: 'b', grantOver: { id: 'b', characteristicDelta: { WS: 5, S: 3 } } }),
        ];
        expect(mergeMarkGrants(marks).characteristicDelta).toEqual({ WS: 10, T: 5, S: 3 });
    });

    it('coalesces duplicate trait and active-effect ids', () => {
        const marks = [
            makeMark({ id: 'a', grantOver: { id: 'a', trait: 'fearless', activeEffect: 'effect-x' } }),
            makeMark({ id: 'b', grantOver: { id: 'b', trait: 'fearless', activeEffect: 'effect-y' } }),
        ];
        const merged = mergeMarkGrants(marks);
        expect(merged.traits).toEqual(['fearless']);
        expect(merged.activeEffects.sort()).toEqual(['effect-x', 'effect-y']);
    });

    it('ignores non-finite characteristic deltas defensively', () => {
        const marks = [
            makeMark({
                id: 'a',
                grantOver: { id: 'a', characteristicDelta: { WS: Number.NaN, BS: 5 } },
            }),
        ];
        expect(mergeMarkGrants(marks).characteristicDelta).toEqual({ BS: 5 });
    });
});
