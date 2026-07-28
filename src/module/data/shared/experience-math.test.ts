import { describe, expect, it } from 'vitest';
import { experienceBalance, fitsBudget } from './experience-math.ts';

describe('experienceBalance (#509)', () => {
    it('reports what is left when the ledger is solvent', () => {
        expect(experienceBalance(1000, 400)).toEqual({ available: 600, overspent: 0 });
    });

    it('reports zero available and the deficit separately when overspent', () => {
        // The Gus case: 1000 earned, a 200xp talent bought on top of a full
        // ledger. Previously this rendered as available = −200, a negative
        // number the sheet printed without comment.
        expect(experienceBalance(1000, 1200)).toEqual({ available: 0, overspent: 200 });
    });

    it('never returns a negative available — a deficit is a distinct state, not a negative balance', () => {
        expect(experienceBalance(0, 5000).available).toBe(0);
    });

    it('is exactly zero-and-solvent when the ledger is spent to the penny', () => {
        expect(experienceBalance(1000, 1000)).toEqual({ available: 0, overspent: 0 });
    });

    it('treats non-finite inputs as zero rather than propagating NaN', () => {
        // An imported or half-written actor must not turn the whole sheet into NaN.
        expect(experienceBalance(Number.NaN, 100)).toEqual({ available: 0, overspent: 100 });
        expect(experienceBalance(1000, Number.NaN)).toEqual({ available: 1000, overspent: 0 });
    });
});

describe('fitsBudget', () => {
    it('admits a purchase that fits exactly', () => {
        expect(fitsBudget(1000, 800, 200)).toBe(true);
    });

    it('refuses a purchase one point over', () => {
        expect(fitsBudget(1000, 800, 201)).toBe(false);
    });

    it('refuses the exact Emperor’s Guidance case — 200xp against a spent ledger', () => {
        expect(fitsBudget(1000, 1000, 200)).toBe(false);
    });

    it('refuses any purchase when the ledger is ALREADY in deficit', () => {
        // Otherwise a character who somehow went negative could keep buying.
        expect(fitsBudget(1000, 1200, 1)).toBe(false);
    });

    it('checks the PROSPECTIVE spend, so two purchases that each fit but together do not are caught as a batch', () => {
        expect(fitsBudget(1000, 0, 600)).toBe(true);
        expect(fitsBudget(1000, 0, 1200)).toBe(false);
    });
});
