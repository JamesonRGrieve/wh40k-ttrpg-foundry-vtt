import { describe, expect, it } from 'vitest';

import {
    GEAR_RESULT_LADDER,
    ORDINARY_BONUS_KEY,
    ORDINARY_DIFFICULTY_BONUS,
    applyTable63Modifiers,
    resolveGearOutcome,
    rollRandomIssueGear,
} from './ow-mission-gear';

describe('OW Mission Gear · constants', () => {
    it('Ordinary difficulty bonus is +10', () => {
        expect(ORDINARY_DIFFICULTY_BONUS).toBe(10);
    });

    it('result ladder has four entries (surrender / minimum / bonus / standard)', () => {
        expect(GEAR_RESULT_LADDER).toHaveLength(4);
        expect(GEAR_RESULT_LADDER.map((row) => row.outcome).sort()).toEqual(['bonus-items', 'minimum-kit', 'standard-kit', 'surrender-kit'].sort());
    });
});

describe('OW Mission Gear · resolveGearOutcome (Table 6-4)', () => {
    it('4+ DoF → surrender-kit', () => {
        expect(resolveGearOutcome({ degreesOfSuccess: 0, degreesOfFailure: 4 })).toEqual({
            outcome: 'surrender-kit',
            bonusItemCount: 0,
        });
        expect(resolveGearOutcome({ degreesOfSuccess: 0, degreesOfFailure: 7 })).toEqual({
            outcome: 'surrender-kit',
            bonusItemCount: 0,
        });
    });

    it('1-3 DoF → minimum-kit', () => {
        expect(resolveGearOutcome({ degreesOfSuccess: 0, degreesOfFailure: 1 })).toEqual({
            outcome: 'minimum-kit',
            bonusItemCount: 0,
        });
        expect(resolveGearOutcome({ degreesOfSuccess: 0, degreesOfFailure: 2 })).toEqual({
            outcome: 'minimum-kit',
            bonusItemCount: 0,
        });
        expect(resolveGearOutcome({ degreesOfSuccess: 0, degreesOfFailure: 3 })).toEqual({
            outcome: 'minimum-kit',
            bonusItemCount: 0,
        });
    });

    it('0/0 (marginal) → standard-kit', () => {
        expect(resolveGearOutcome({ degreesOfSuccess: 0, degreesOfFailure: 0 })).toEqual({
            outcome: 'standard-kit',
            bonusItemCount: 0,
        });
    });

    it('DoS 1-3 → standard-kit', () => {
        expect(resolveGearOutcome({ degreesOfSuccess: 1, degreesOfFailure: 0 })).toEqual({
            outcome: 'standard-kit',
            bonusItemCount: 0,
        });
        expect(resolveGearOutcome({ degreesOfSuccess: 3, degreesOfFailure: 0 })).toEqual({
            outcome: 'standard-kit',
            bonusItemCount: 0,
        });
    });

    it('DoS 4+ → bonus-items with bonusItemCount 1', () => {
        expect(resolveGearOutcome({ degreesOfSuccess: 4, degreesOfFailure: 0 })).toEqual({
            outcome: 'bonus-items',
            bonusItemCount: 1,
        });
        expect(resolveGearOutcome({ degreesOfSuccess: 9, degreesOfFailure: 0 })).toEqual({
            outcome: 'bonus-items',
            bonusItemCount: 1,
        });
    });
});

describe('OW Mission Gear · applyTable63Modifiers', () => {
    it('prefixes the Ordinary (+10) bonus to the breakdown', () => {
        const { target, breakdown } = applyTable63Modifiers(40, []);
        expect(target).toBe(50);
        expect(breakdown).toHaveLength(1);
        expect(breakdown[0]).toEqual({ description: ORDINARY_BONUS_KEY, value: 10 });
    });

    it('sums Table 6-3 modifier rows on top of the base + Ordinary bonus', () => {
        const { target, breakdown } = applyTable63Modifiers(40, [
            { description: 'short-notice', value: -10 },
            { description: 'specialist-mission', value: 20 },
        ]);
        // 40 base + 10 ordinary + (-10) + 20 = 60
        expect(target).toBe(60);
        expect(breakdown).toHaveLength(3);
        expect(breakdown[0]?.value).toBe(10);
        expect(breakdown[1]?.value).toBe(-10);
        expect(breakdown[2]?.value).toBe(20);
    });

    it('preserves the caller-provided order of modifier rows', () => {
        const { breakdown } = applyTable63Modifiers(0, [
            { description: 'first', value: 5 },
            { description: 'second', value: 5 },
            { description: 'third', value: 5 },
        ]);
        expect(breakdown.slice(1).map((row) => row.description)).toEqual(['first', 'second', 'third']);
    });
});

describe('OW Mission Gear · rollRandomIssueGear (Table 6-5 d100)', () => {
    it('rng=0 returns 1 (lowest d100 face)', () => {
        expect(rollRandomIssueGear(() => 0)).toBe(1);
    });

    it('rng=0.999 returns 100 (highest d100 face)', () => {
        expect(rollRandomIssueGear(() => 0.999)).toBe(100);
    });

    it('rng=0.5 returns 51 (mid-range floor+1)', () => {
        expect(rollRandomIssueGear(() => 0.5)).toBe(51);
    });

    it('clamps a malformed below-range rng to 1', () => {
        expect(rollRandomIssueGear(() => -1)).toBe(1);
    });

    it('clamps a malformed at-or-above-1 rng to 100', () => {
        expect(rollRandomIssueGear(() => 1)).toBe(100);
    });
});
