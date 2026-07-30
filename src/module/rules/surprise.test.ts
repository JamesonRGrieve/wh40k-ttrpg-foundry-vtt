import { describe, expect, it } from 'vitest';
import { canActThisRound, canUseReactions, SURPRISED_EXPIRES_AT_ROUND, SURPRISED_STATUS_ID, surpriseHasExpired } from './surprise';

/**
 * The +30 to-hit bonus is deliberately NOT tested here, because it is no longer
 * implemented here. A `surprised` condition is mapped to `isUnaware` by
 * `target-situationals.ts`, which auto-selects the `unawareTarget` circumstance
 * modifier — the live route. This module's duplicate of that bonus was deleted
 * (#514); it had no caller and was free to drift from the one players actually got.
 */

describe('Surprise constants (#113)', () => {
    it('Surprised condition expires at round 2', () => {
        expect(SURPRISED_EXPIRES_AT_ROUND).toBe(2);
    });
    it('uses the status id the content packs author', () => {
        expect(SURPRISED_STATUS_ID).toBe('surprised');
    });
});

describe('surpriseHasExpired (#514)', () => {
    it('does not expire during the surprise round', () => {
        expect(surpriseHasExpired(1)).toBe(false);
    });

    it('expires from round 2 onward', () => {
        // Until this was wired, nothing ever removed the condition — so the +30
        // that auto-selects off it stayed on the target for the whole encounter.
        expect(surpriseHasExpired(2)).toBe(true);
        expect(surpriseHasExpired(7)).toBe(true);
    });

    it('treats a missing or non-finite round as the surprise round, not as expired', () => {
        // Erring toward "not expired" keeps a bad round number from silently
        // stripping a condition the GM just applied.
        expect(surpriseHasExpired(Number.NaN)).toBe(false);
    });
});

describe('canActThisRound (#113)', () => {
    it('non-surprised actors can act any round', () => {
        expect(canActThisRound(false, 1)).toBe(true);
        expect(canActThisRound(false, 7)).toBe(true);
    });
    it('Surprised actors cannot act in round 1', () => {
        expect(canActThisRound(true, 1)).toBe(false);
    });
    it('Surprised actors can act in round 2 onward', () => {
        expect(canActThisRound(true, 2)).toBe(true);
        expect(canActThisRound(true, 5)).toBe(true);
    });
});

describe('canUseReactions (#113)', () => {
    it('Surprised actors cannot react in round 1', () => {
        expect(canUseReactions(true, 1)).toBe(false);
    });
    it('Surprised actors can react in round 2 onward', () => {
        expect(canUseReactions(true, 2)).toBe(true);
    });
    it('non-surprised actors can react any round', () => {
        expect(canUseReactions(false, 1)).toBe(true);
    });
});
