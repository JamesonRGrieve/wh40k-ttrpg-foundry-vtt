/**
 * Unit tests for the pure DH2 action-economy model (#264).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { conditionPackFixture } from '../testing/condition-catalog.ts';
import { actionBudgetView, canSpendAction, coerceActionsSpent, EMPTY_ACTIONS_SPENT, refundAction, spendAction, usedActionPoints } from './action-budget.ts';
import { type ActionLimit, resolveActionLimit } from './condition-mechanics.ts';
import { buildConditionCatalog, conditionMechanicsFor, setConditionCatalog } from './condition-registry.ts';

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
            actionLimit: 'none',
        });
        const halfThenReaction = spendAction(spendAction(EMPTY_ACTIONS_SPENT, 'half'), 'reaction');
        expect(actionBudgetView(halfThenReaction)).toEqual({
            fullAvailable: false,
            halfRemaining: 1,
            reactionRemaining: 0,
            freeSpent: 0,
            usedPoints: 1,
            actionLimit: 'none',
        });
    });

    it('coerces garbage flag values to a clean budget', () => {
        expect(coerceActionsSpent(undefined)).toEqual(EMPTY_ACTIONS_SPENT);
        expect(coerceActionsSpent('nope')).toEqual(EMPTY_ACTIONS_SPENT);
        expect(coerceActionsSpent({ full: '1', half: -2, free: 1.9, reaction: 1 })).toEqual({ full: 1, half: 0, free: 1, reaction: 1 });
    });
});

/**
 * Condition action limits — the limit itself is resolved from the bearer's
 * condition documents (`resolveActionLimit` over line-resolved mechanics), so
 * these run the gate against the limit a dh2 / rt condition set produces.
 */
describe('action-budget under condition action limits', () => {
    beforeEach(() => {
        setConditionCatalog(buildConditionCatalog(conditionPackFixture()));
    });

    afterEach(() => {
        setConditionCatalog(new Map());
    });

    function limitFor(line: 'dh2' | 'rt', ...ids: string[]): ActionLimit {
        return resolveActionLimit(ids.map((id) => conditionMechanicsFor(id, line)).filter((m) => m !== null)).limit;
    }

    it('Stunned (dh2, noActions): no Full, Half, Free or Reaction', () => {
        const limit = limitFor('dh2', 'stunned');
        for (const kind of ['full', 'half', 'free', 'reaction'] as const) expect(canSpendAction(EMPTY_ACTIONS_SPENT, kind, limit)).toBe(false);
        expect(spendAction(EMPTY_ACTIONS_SPENT, 'half', limit)).toEqual(EMPTY_ACTIONS_SPENT);
        expect(actionBudgetView(EMPTY_ACTIONS_SPENT, limit)).toMatchObject({
            fullAvailable: false,
            halfRemaining: 0,
            reactionRemaining: 0,
            actionLimit: 'noActions',
        });
    });

    it('Pinned (dh2, halfActionOnly): one Half, no Full; Free and Reaction still allowed', () => {
        const limit = limitFor('dh2', 'pinned');
        expect(canSpendAction(EMPTY_ACTIONS_SPENT, 'full', limit)).toBe(false);
        expect(canSpendAction(EMPTY_ACTIONS_SPENT, 'half', limit)).toBe(true);
        const oneHalf = spendAction(EMPTY_ACTIONS_SPENT, 'half', limit);
        expect(canSpendAction(oneHalf, 'half', limit)).toBe(false);
        expect(canSpendAction(oneHalf, 'free', limit)).toBe(true);
        expect(canSpendAction(oneHalf, 'reaction', limit)).toBe(true);
        expect(actionBudgetView(EMPTY_ACTIONS_SPENT, limit).halfRemaining).toBe(1);
    });

    it('Surprised (rt, loseTurn): no turn actions, Reaction kept', () => {
        const limit = limitFor('rt', 'surprised-unaware');
        expect(canSpendAction(EMPTY_ACTIONS_SPENT, 'full', limit)).toBe(false);
        expect(canSpendAction(EMPTY_ACTIONS_SPENT, 'half', limit)).toBe(false);
        expect(canSpendAction(EMPTY_ACTIONS_SPENT, 'free', limit)).toBe(false);
        expect(canSpendAction(EMPTY_ACTIONS_SPENT, 'reaction', limit)).toBe(true);
    });

    it('Grappled (rt, grappleOnly): the normal pool — the limit restricts which actions, not how many', () => {
        const limit = limitFor('rt', 'grappled');
        expect(limit).toBe('grappleOnly');
        expect(canSpendAction(EMPTY_ACTIONS_SPENT, 'full', limit)).toBe(true);
        expect(actionBudgetView(EMPTY_ACTIONS_SPENT, limit)).toMatchObject({ halfRemaining: 2, reactionRemaining: 1, actionLimit: 'grappleOnly' });
    });
});
