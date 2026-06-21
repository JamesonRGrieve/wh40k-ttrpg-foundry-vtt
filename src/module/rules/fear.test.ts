import { describe, expect, it } from 'vitest';
import { clampFearRating, getFearTestPenalty, getShockTableRollModifier, MAX_FEAR_RATING, resolveFearTest } from './fear';

describe('Fear constants (#65)', () => {
    it('MAX_FEAR_RATING is 4', () => {
        expect(MAX_FEAR_RATING).toBe(4);
    });
});

describe('clampFearRating (#369 — single-sourced Fear-range clamp)', () => {
    it('passes through canonical ratings 0..4 unchanged', () => {
        expect(clampFearRating(0)).toBe(0);
        expect(clampFearRating(1)).toBe(1);
        expect(clampFearRating(4)).toBe(4);
    });
    it('caps above MAX_FEAR_RATING and floors below 0', () => {
        expect(clampFearRating(10)).toBe(MAX_FEAR_RATING);
        expect(clampFearRating(-3)).toBe(0);
    });
    it('truncates fractions toward zero', () => {
        expect(clampFearRating(2.9)).toBe(2);
        expect(clampFearRating(-0.9)).toBe(0);
    });
    it('treats non-finite input as 0 (NaN and both infinities)', () => {
        expect(clampFearRating(Number.NaN)).toBe(0);
        expect(clampFearRating(Number.POSITIVE_INFINITY)).toBe(0);
        expect(clampFearRating(Number.NEGATIVE_INFINITY)).toBe(0);
    });
});

describe('getFearTestPenalty (#65)', () => {
    it('returns −10 × rating', () => {
        expect(getFearTestPenalty(0)).toBe(0);
        expect(getFearTestPenalty(1)).toBe(10);
        expect(getFearTestPenalty(2)).toBe(20);
        expect(getFearTestPenalty(3)).toBe(30);
        expect(getFearTestPenalty(4)).toBe(40);
    });
    it('caps at MAX_FEAR_RATING and floors at 0', () => {
        expect(getFearTestPenalty(10)).toBe(40);
        expect(getFearTestPenalty(-3)).toBe(0);
        expect(getFearTestPenalty(Number.NaN)).toBe(0);
    });
});

describe('resolveFearTest (#65)', () => {
    it('isNoOp when rating is 0 (no Fear)', () => {
        const r = resolveFearTest({ willpowerTotal: 40, fearRating: 0 });
        expect(r.isNoOp).toBe(true);
        expect(r.target).toBe(40);
    });

    it('target = WP − (10 × rating) for rating 1..4', () => {
        expect(resolveFearTest({ willpowerTotal: 40, fearRating: 1 }).target).toBe(30);
        expect(resolveFearTest({ willpowerTotal: 40, fearRating: 2 }).target).toBe(20);
        expect(resolveFearTest({ willpowerTotal: 40, fearRating: 4 }).target).toBe(0);
    });

    it('target floors at 0', () => {
        expect(resolveFearTest({ willpowerTotal: 20, fearRating: 4 }).target).toBe(0);
    });

    it('isNoOp is false for any rating ≥ 1', () => {
        expect(resolveFearTest({ willpowerTotal: 40, fearRating: 1 }).isNoOp).toBe(false);
    });
});

describe('getShockTableRollModifier (#65)', () => {
    it('+0 for the first DoF', () => {
        expect(getShockTableRollModifier(1)).toBe(0);
    });
    it('+10 per DoF after the first (DoF 2 = +10, DoF 5 = +40)', () => {
        expect(getShockTableRollModifier(2)).toBe(10);
        expect(getShockTableRollModifier(3)).toBe(20);
        expect(getShockTableRollModifier(5)).toBe(40);
    });
    it('treats sub-1 / non-finite DoF as 1', () => {
        expect(getShockTableRollModifier(0)).toBe(0);
        expect(getShockTableRollModifier(Number.NaN)).toBe(0);
    });
});
