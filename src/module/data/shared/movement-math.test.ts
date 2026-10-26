import { describe, expect, it } from 'vitest';
import { computeMovement, liftingCapacity, shiftMovementRates, sumMovementModifiers } from './movement-math.ts';

describe('liftingCapacity (#699)', () => {
    it('carry SB × 4.5 (one decimal), lift SB × 9, push SB × 18', () => {
        expect(liftingCapacity(3)).toEqual({ carry: 13.5, lift: 27, push: 54 });
        expect(liftingCapacity(4)).toEqual({ carry: 18, lift: 36, push: 72 });
    });

    it('a Strength Bonus of 0 carries nothing', () => {
        expect(liftingCapacity(0)).toEqual({ carry: 0, lift: 0, push: 0 });
    });
});

describe('computeMovement (#271)', () => {
    it('PC path (no floors): half/full/charge/run = baseMove × {1,2,3,6}', () => {
        // ab 4, size 4 → baseMove = 4
        expect(computeMovement(4, 4, false)).toEqual({ half: 4, full: 8, charge: 12, run: 24 });
    });

    it('NPC path applies the 1/2/3/6 minimum floors', () => {
        // ab 0, size 4 → baseMove = 0 → floored
        expect(computeMovement(0, 4, true)).toEqual({ half: 1, full: 2, charge: 3, run: 6 });
    });

    it('NPC path leaves above-floor values unchanged', () => {
        expect(computeMovement(5, 4, true)).toEqual({ half: 5, full: 10, charge: 15, run: 30 });
    });

    it('size shifts baseMove by (size - 4)', () => {
        // ab 3, size 6 → baseMove = 3 + 6 - 4 = 5
        expect(computeMovement(3, 6, false).half).toBe(5);
    });
});

describe('shiftMovementRates — a printed line under a base-move change (#604)', () => {
    const printed = { half: 3, full: 6, charge: 9, run: 18 };

    it('a +2 shift moves each rate by 2 × its multiple', () => {
        expect(shiftMovementRates(printed, 2, true)).toEqual({ half: 5, full: 10, charge: 15, run: 30 });
    });

    it('a −2 shift stops at the NPC 1/2/3/6 floor', () => {
        expect(shiftMovementRates(printed, -2, true)).toEqual({ half: 1, full: 2, charge: 3, run: 6 });
        expect(shiftMovementRates(printed, -1, true)).toEqual({ half: 2, full: 4, charge: 6, run: 12 });
    });

    it('never raises a printed rate already below its floor', () => {
        expect(shiftMovementRates({ half: 0, full: 0, charge: 0, run: 0 }, -2, true)).toEqual({ half: 0, full: 0, charge: 0, run: 0 });
    });

    it('a zero shift leaves the line exactly as printed, floors or not', () => {
        expect(shiftMovementRates({ half: 0, full: 1, charge: 2, run: 4 }, 0, true)).toEqual({ half: 0, full: 1, charge: 2, run: 4 });
    });

    it('matches deriving the line from the shifted Agility Bonus', () => {
        expect(shiftMovementRates(computeMovement(5, 4, true), 2, true)).toEqual(computeMovement(7, 4, true));
    });
});

describe('sumMovementModifiers (#409)', () => {
    it('sums movement-modifier source values', () => {
        expect(sumMovementModifiers([{ value: 3 }])).toBe(3);
        expect(sumMovementModifiers([{ value: 3 }, { value: -1 }])).toBe(2);
    });

    it('is 0 for no sources', () => {
        expect(sumMovementModifiers([])).toBe(0);
    });

    it('a +3 movement bonus folds into the base rate so all four rates scale together', () => {
        // ab 4, size 4 → base 4 (half 4 / full 8 / charge 12 / run 24).
        // A drug granting +3 movement → base 7 → 7 / 14 / 21 / 42, staying ×{1,2,3,6}.
        const mod = sumMovementModifiers([{ value: 3 }]);
        expect(computeMovement(4 + mod, 4, false)).toEqual({ half: 7, full: 14, charge: 21, run: 42 });
    });
});
