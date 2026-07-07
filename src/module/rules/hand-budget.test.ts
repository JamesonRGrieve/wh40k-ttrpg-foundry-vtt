/**
 * Unit tests for the pure equipped-weapon hand-budget model (#418).
 */

import { describe, expect, it } from 'vitest';
import {
    canEquipWeapon,
    computeHandBudget,
    DEFAULT_AVAILABLE_HANDS,
    handsForWeapon,
    ONE_HANDED_COST,
    resolveAvailableHands,
    totalHandsUsed,
    TWO_HANDED_COST,
} from './hand-budget.ts';

describe('handsForWeapon (#418)', () => {
    it('costs one hand for a one-handed weapon', () => {
        expect(handsForWeapon(false)).toBe(ONE_HANDED_COST);
        expect(handsForWeapon(false)).toBe(1);
    });

    it('costs two hands for a two-handed weapon', () => {
        expect(handsForWeapon(true)).toBe(TWO_HANDED_COST);
        expect(handsForWeapon(true)).toBe(2);
    });
});

describe('resolveAvailableHands (#418)', () => {
    it('defaults to two hands when unrecorded', () => {
        expect(resolveAvailableHands(undefined)).toBe(DEFAULT_AVAILABLE_HANDS);
        expect(resolveAvailableHands(null)).toBe(2);
    });

    it('honours a non-standard hand count (more or fewer)', () => {
        expect(resolveAvailableHands(4)).toBe(4);
        expect(resolveAvailableHands(1)).toBe(1);
        expect(resolveAvailableHands(0)).toBe(0);
    });

    it('floors fractional counts', () => {
        expect(resolveAvailableHands(2.9)).toBe(2);
    });

    it('falls back to the default for negative or non-finite input', () => {
        expect(resolveAvailableHands(-3)).toBe(DEFAULT_AVAILABLE_HANDS);
        expect(resolveAvailableHands(Number.NaN)).toBe(DEFAULT_AVAILABLE_HANDS);
        expect(resolveAvailableHands(Number.POSITIVE_INFINITY)).toBe(DEFAULT_AVAILABLE_HANDS);
    });
});

describe('totalHandsUsed (#418)', () => {
    it('sums an empty loadout to zero', () => {
        expect(totalHandsUsed([])).toBe(0);
    });

    it('sums the hand costs of equipped weapons', () => {
        expect(totalHandsUsed([1, 1])).toBe(2);
        expect(totalHandsUsed([2])).toBe(2);
        expect(totalHandsUsed([1, 2])).toBe(3);
    });
});

describe('computeHandBudget (#418)', () => {
    it('reports a fully-free two-hand budget when nothing is equipped', () => {
        const budget = computeHandBudget(2, []);
        expect(budget).toEqual({ available: 2, used: 0, remaining: 2, overCommitted: false });
    });

    it('reports remaining hands after a pistol is equipped', () => {
        const budget = computeHandBudget(2, [handsForWeapon(false)]);
        expect(budget.used).toBe(1);
        expect(budget.remaining).toBe(1);
        expect(budget.overCommitted).toBe(false);
    });

    it('reports zero remaining when a two-handed weapon fills the budget', () => {
        const budget = computeHandBudget(2, [handsForWeapon(true)]);
        expect(budget.used).toBe(2);
        expect(budget.remaining).toBe(0);
        expect(budget.overCommitted).toBe(false);
    });

    it('never reports negative remaining and flags over-commitment', () => {
        const budget = computeHandBudget(2, [2, 2]);
        expect(budget.used).toBe(4);
        expect(budget.remaining).toBe(0);
        expect(budget.overCommitted).toBe(true);
    });

    it('supports a four-handed creature holding three pistols', () => {
        const budget = computeHandBudget(4, [1, 1, 1]);
        expect(budget.remaining).toBe(1);
        expect(budget.overCommitted).toBe(false);
    });
});

describe('canEquipWeapon (#418)', () => {
    it('allows a second pistol alongside a pistol on two hands', () => {
        expect(canEquipWeapon(2, [handsForWeapon(false)], handsForWeapon(false))).toBe(true);
    });

    it('blocks a two-handed weapon while a pistol is equipped', () => {
        expect(canEquipWeapon(2, [handsForWeapon(false)], handsForWeapon(true))).toBe(false);
    });

    it('blocks a third pistol on two hands', () => {
        expect(canEquipWeapon(2, [handsForWeapon(false), handsForWeapon(false)], handsForWeapon(false))).toBe(false);
    });

    it('allows drawing into an empty loadout', () => {
        expect(canEquipWeapon(2, [], handsForWeapon(true))).toBe(true);
    });

    it('lets a four-handed creature draw a third pistol', () => {
        expect(canEquipWeapon(4, [1, 1], handsForWeapon(false))).toBe(true);
    });

    it('blocks a two-handed draw when a one-handed creature has no hands to spare', () => {
        expect(canEquipWeapon(1, [], handsForWeapon(true))).toBe(false);
        expect(canEquipWeapon(1, [], handsForWeapon(false))).toBe(true);
    });
});
