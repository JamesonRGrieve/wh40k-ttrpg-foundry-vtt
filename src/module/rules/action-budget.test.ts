/**
 * Unit tests for the pure DH2 action-economy model (#264).
 */

import { describe, expect, it } from 'vitest';
import { actionBudgetView, canSpendAction, coerceActionsSpent, EMPTY_ACTIONS_SPENT, refundAction, spendAction, usedActionPoints } from './action-budget.ts';

describe('action-budget pool (#264)', () => {
    it('allows one Full action per turn', () => {
        expect(canSpendAction(EMPTY_ACTIONS_SPENT, 'full')).toBe(true);
        const afterFull = spendAction(EMPTY_ACTIONS_SPENT, 'full');
        expect(usedActionPoints(afterFull)).toBe(2);
        expect(canSpendAction(afterFull, 'full')).toBe(false);
        expect(canSpendAction(afterFull, 'half')).toBe(false);
    });

    it('allows two Half actions per turn (and no more)', () => {
        const one = spendAction(EMPTY_ACTIONS_SPENT, 'half');
        expect(canSpendAction(one, 'half')).toBe(true);
        const two = spendAction(one, 'half');
        expect(usedActionPoints(two)).toBe(2);
        expect(canSpendAction(two, 'half')).toBe(false);
        // A Half already spent forbids a Full.
        expect(canSpendAction(one, 'full')).toBe(false);
    });

    it('caps reactions at one and never caps free actions', () => {
        const r = spendAction(EMPTY_ACTIONS_SPENT, 'reaction');
        expect(canSpendAction(r, 'reaction')).toBe(false);
        let free = EMPTY_ACTIONS_SPENT;
        for (let i = 0; i < 5; i++) free = spendAction(free, 'free');
        expect(free.free).toBe(5);
        expect(canSpendAction(free, 'free')).toBe(true);
    });

    it('refunds without going negative', () => {
        expect(refundAction(EMPTY_ACTIONS_SPENT, 'half')).toEqual(EMPTY_ACTIONS_SPENT);
        const spent = spendAction(EMPTY_ACTIONS_SPENT, 'half');
        expect(refundAction(spent, 'half')).toEqual(EMPTY_ACTIONS_SPENT);
    });

    it('projects a HUD readout', () => {
        expect(actionBudgetView(EMPTY_ACTIONS_SPENT)).toEqual({
            fullAvailable: true,
            halfRemaining: 2,
            reactionRemaining: 1,
            freeSpent: 0,
            usedPoints: 0,
        });
        const halfThenReaction = spendAction(spendAction(EMPTY_ACTIONS_SPENT, 'half'), 'reaction');
        expect(actionBudgetView(halfThenReaction)).toEqual({
            fullAvailable: false,
            halfRemaining: 1,
            reactionRemaining: 0,
            freeSpent: 0,
            usedPoints: 1,
        });
    });

    it('coerces garbage flag values to a clean budget', () => {
        expect(coerceActionsSpent(undefined)).toEqual(EMPTY_ACTIONS_SPENT);
        expect(coerceActionsSpent('nope')).toEqual(EMPTY_ACTIONS_SPENT);
        expect(coerceActionsSpent({ full: '1', half: -2, free: 1.9, reaction: 1 })).toEqual({ full: 1, half: 0, free: 1, reaction: 1 });
    });
});
