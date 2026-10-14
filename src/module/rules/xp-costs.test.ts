import { describe, expect, it } from 'vitest';
import { psychicPowerCharge, psychicPowerCost, psychicPowerXpCost, psyRatingStepCost, psyRatingTotalCost } from './xp-costs.ts';

describe('psyRatingStepCost', () => {
    it('charges (target rating) × 200 per step', () => {
        expect(psyRatingStepCost(1)).toBe(200);
        expect(psyRatingStepCost(2)).toBe(400);
        expect(psyRatingStepCost(10)).toBe(2000);
    });
});

describe('psyRatingTotalCost', () => {
    it('sums every step cost to reach the given rating from 0', () => {
        expect(psyRatingTotalCost(0)).toBe(0);
        expect(psyRatingTotalCost(1)).toBe(200); // 200
        expect(psyRatingTotalCost(2)).toBe(600); // 200 + 400
        expect(psyRatingTotalCost(3)).toBe(1200); // 200 + 400 + 600
        expect(psyRatingTotalCost(4)).toBe(2000); // + 800
    });

    it('equals the running sum of psyRatingStepCost', () => {
        let running = 0;
        for (let r = 1; r <= 10; r++) {
            running += psyRatingStepCost(r);
            expect(psyRatingTotalCost(r)).toBe(running);
        }
    });

    it('floors and clamps non-positive / fractional input', () => {
        expect(psyRatingTotalCost(-3)).toBe(0);
        expect(psyRatingTotalCost(2.9)).toBe(600);
    });
});

describe('psychicPowerCost', () => {
    it('scales with PR requirement, floored at 100', () => {
        expect(psychicPowerCost(1)).toBe(200);
        expect(psychicPowerCost(2)).toBe(400);
        expect(psychicPowerCost(3)).toBe(600);
    });

    it('defaults missing / non-positive prCost to 1 (→ 200) and never drops below 100', () => {
        expect(psychicPowerCost(0)).toBe(200);
        expect(psychicPowerCost(-5)).toBe(200);
        expect(psychicPowerCost(Number.NaN)).toBe(200);
        expect(psychicPowerCost(0.4)).toBe(100); // max(100, 200*0.4=80)
    });
});

describe('psychicPowerXpCost (#642)', () => {
    it('keeps a non-negative integer XP value', () => {
        expect(psychicPowerXpCost(300)).toBe(300);
        expect(psychicPowerXpCost(0)).toBe(0);
    });

    it('reads a numeric string as its number', () => {
        expect(psychicPowerXpCost('250')).toBe(250);
    });

    it('treats a stray acquisition-currency record as not authored', () => {
        expect(psychicPowerXpCost({ dh1: { throneGelt: null }, dh2: { throneGelt: null } })).toBeNull();
        expect(psychicPowerXpCost({ throneGelt: 50 })).toBeNull();
    });

    it('treats absent, blank, negative and fractional values as not authored', () => {
        expect(psychicPowerXpCost(undefined)).toBeNull();
        expect(psychicPowerXpCost(null)).toBeNull();
        expect(psychicPowerXpCost('')).toBeNull();
        expect(psychicPowerXpCost('  ')).toBeNull();
        expect(psychicPowerXpCost(-100)).toBeNull();
        expect(psychicPowerXpCost(12.5)).toBeNull();
        expect(psychicPowerXpCost(Number.NaN)).toBeNull();
    });
});

describe('psychicPowerCharge (#642)', () => {
    it('charges the printed XP cost when one is authored', () => {
        expect(psychicPowerCharge(300, 1)).toBe(300);
        expect(psychicPowerCharge(100, 3)).toBe(100);
    });

    it('falls back to the PR heuristic when no cost is authored', () => {
        expect(psychicPowerCharge(null, 2)).toBe(psychicPowerCost(2));
        expect(psychicPowerCharge(undefined, 3)).toBe(psychicPowerCost(3));
        expect(psychicPowerCharge(0, 1)).toBe(psychicPowerCost(1));
        expect(psychicPowerCharge(Number.NaN, 1)).toBe(psychicPowerCost(1));
    });
});
