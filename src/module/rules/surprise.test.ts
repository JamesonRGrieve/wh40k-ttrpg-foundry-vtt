import { describe, expect, it } from 'vitest';
import { canActThisRound, canUseReactions, getSurpriseToHitBonus, SURPRISED_EXPIRES_AT_ROUND, SURPRISED_TO_HIT_BONUS } from './surprise';

describe('Surprise constants (#113)', () => {
    it('to-hit bonus is +30', () => {
        expect(SURPRISED_TO_HIT_BONUS).toBe(30);
    });
    it('Surprised condition expires at round 2', () => {
        expect(SURPRISED_EXPIRES_AT_ROUND).toBe(2);
    });
});

describe('getSurpriseToHitBonus (#113)', () => {
    it('+30 when target is Surprised in round 1', () => {
        expect(getSurpriseToHitBonus({ targetIsSurprised: true, currentRound: 1 })).toBe(30);
    });
    it('0 when target is not Surprised', () => {
        expect(getSurpriseToHitBonus({ targetIsSurprised: false, currentRound: 1 })).toBe(0);
    });
    it('0 from round 2 onward even if condition flag persists', () => {
        expect(getSurpriseToHitBonus({ targetIsSurprised: true, currentRound: 2 })).toBe(0);
        expect(getSurpriseToHitBonus({ targetIsSurprised: true, currentRound: 5 })).toBe(0);
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
