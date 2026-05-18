import { describe, expect, it } from 'vitest';
import {
    DROWNING_DAMAGE_PER_ROUND,
    FALLING_DAMAGE_DICE_PER_2M,
    getBreathHoldSeconds,
    getFallingDamageFormula,
    getFallingDiceCount,
    isPastBreathCeiling,
    resolveDrowningTest,
} from './hazards';

describe('Falling (#118)', () => {
    it('1m fall does 0 dice', () => {
        expect(getFallingDiceCount(1)).toBe(0);
        expect(getFallingDamageFormula(1)).toBe('');
    });
    it('2m → 1d10', () => {
        expect(getFallingDiceCount(2)).toBe(1);
        expect(getFallingDamageFormula(2)).toBe('1d10');
    });
    it('4m → 2d10, 10m → 5d10', () => {
        expect(getFallingDamageFormula(4)).toBe('2d10');
        expect(getFallingDamageFormula(10)).toBe('5d10');
    });
    it('rounds down odd distances (5m → 2d10, 7m → 3d10)', () => {
        expect(getFallingDiceCount(5)).toBe(2);
        expect(getFallingDiceCount(7)).toBe(3);
    });
    it('FALLING_DAMAGE_DICE_PER_2M constant is "1d10"', () => {
        expect(FALLING_DAMAGE_DICE_PER_2M).toBe('1d10');
    });
});

describe('Drowning (#118)', () => {
    it('per-round damage is 1', () => {
        expect(DROWNING_DAMAGE_PER_ROUND).toBe(1);
    });
    it('round 1 target = full TB', () => {
        expect(resolveDrowningTest({ toughnessTotal: 40, roundsSubmerged: 1 }).target).toBe(40);
    });
    it('cumulative −10 per additional round (round 2 → TB−10, round 5 → TB−40)', () => {
        expect(resolveDrowningTest({ toughnessTotal: 40, roundsSubmerged: 2 }).target).toBe(30);
        expect(resolveDrowningTest({ toughnessTotal: 40, roundsSubmerged: 3 }).target).toBe(20);
        expect(resolveDrowningTest({ toughnessTotal: 40, roundsSubmerged: 5 }).target).toBe(0);
    });
    it('target floors at 0', () => {
        expect(resolveDrowningTest({ toughnessTotal: 20, roundsSubmerged: 10 }).target).toBe(0);
    });
});

describe('Suffocation (#118)', () => {
    it('breath-hold = TB + WPB', () => {
        expect(getBreathHoldSeconds({ toughnessBonus: 4, willpowerBonus: 3 })).toBe(7);
        expect(getBreathHoldSeconds({ toughnessBonus: 0, willpowerBonus: 0 })).toBe(0);
    });
    it('isPastBreathCeiling false at or below the ceiling', () => {
        const input = { toughnessBonus: 4, willpowerBonus: 3 };
        expect(isPastBreathCeiling({ ...input, secondsElapsed: 5 })).toBe(false);
        expect(isPastBreathCeiling({ ...input, secondsElapsed: 7 })).toBe(false);
    });
    it('isPastBreathCeiling true once seconds exceed the ceiling', () => {
        expect(isPastBreathCeiling({ toughnessBonus: 4, willpowerBonus: 3, secondsElapsed: 8 })).toBe(true);
    });
});
