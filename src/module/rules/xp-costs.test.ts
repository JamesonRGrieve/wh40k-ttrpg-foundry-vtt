import { describe, expect, it } from 'vitest';
import { psyRatingStepCost, psyRatingTotalCost, psychicPowerCost } from './xp-costs.ts';

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
