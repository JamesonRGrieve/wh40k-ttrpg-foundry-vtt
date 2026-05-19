import { describe, expect, it } from 'vitest';
import {
    SMITE_THE_UNHOLY_FATE_COST,
    applySmiteTheUnholyBonus,
    hasCrusaderRole,
    resolveSmiteTheUnholyDoS,
} from './crusader';

/**
 * Contract tests for the Crusader role rider (#141, beyond.md p.34).
 *
 * Pins the Fate-spend auto-pass DoS math, the Fear(X) melee damage /
 * penetration rider, and the item-name role-detection probe so the
 * runtime hooks that consume them (character-sheet action button,
 * damage pipeline, status panel context) cannot drift away from RAW.
 */

describe('Crusader role — Smite the Unholy (#141, beyond.md p.34)', () => {
    describe('SMITE_THE_UNHOLY_FATE_COST', () => {
        it('costs 1 Fate point per invocation per RAW', () => {
            expect(SMITE_THE_UNHOLY_FATE_COST).toBe(1);
        });
    });

    describe('resolveSmiteTheUnholyDoS — Fate-spend auto-pass DoS', () => {
        it('returns WPB = floor(WP / 10) for canonical WP totals', () => {
            expect(resolveSmiteTheUnholyDoS(30)).toBe(3);
            expect(resolveSmiteTheUnholyDoS(47)).toBe(4);
            expect(resolveSmiteTheUnholyDoS(50)).toBe(5);
            expect(resolveSmiteTheUnholyDoS(99)).toBe(9);
        });
        it('floors at 0 for non-positive or sub-10 WP totals', () => {
            expect(resolveSmiteTheUnholyDoS(0)).toBe(0);
            expect(resolveSmiteTheUnholyDoS(9)).toBe(0);
            expect(resolveSmiteTheUnholyDoS(-15)).toBe(0);
        });
        it('coerces non-finite WP totals to 0 DoS rather than NaN', () => {
            expect(resolveSmiteTheUnholyDoS(Number.NaN)).toBe(0);
            expect(resolveSmiteTheUnholyDoS(Number.POSITIVE_INFINITY)).toBe(0);
        });
    });

    describe('applySmiteTheUnholyBonus — Fear(X) melee rider', () => {
        it('adds X to both damage and penetration when target has Fear(X)', () => {
            const result = applySmiteTheUnholyBonus({ baseDamage: 12, basePenetration: 4, targetFearRating: 2 });
            expect(result).toEqual({ damage: 14, penetration: 6, bonusApplied: 2, isNoOp: false });
        });
        it('is a no-op against targets without the Fear trait (rating 0)', () => {
            const result = applySmiteTheUnholyBonus({ baseDamage: 10, basePenetration: 3, targetFearRating: 0 });
            expect(result).toEqual({ damage: 10, penetration: 3, bonusApplied: 0, isNoOp: true });
        });
        it('clamps Fear rating to MAX_FEAR_RATING (4) to mirror Fear-test resolver', () => {
            const result = applySmiteTheUnholyBonus({ baseDamage: 5, basePenetration: 0, targetFearRating: 99 });
            expect(result).toEqual({ damage: 9, penetration: 4, bonusApplied: 4, isNoOp: false });
        });
        it('floors base damage and penetration at 0 (rider never subtracts)', () => {
            const result = applySmiteTheUnholyBonus({ baseDamage: -3, basePenetration: -2, targetFearRating: 1 });
            expect(result).toEqual({ damage: 1, penetration: 1, bonusApplied: 1, isNoOp: false });
        });
        it('coerces non-finite inputs to deterministic 0-based results', () => {
            const result = applySmiteTheUnholyBonus({
                baseDamage: Number.NaN,
                basePenetration: Number.POSITIVE_INFINITY,
                targetFearRating: Number.NaN,
            });
            expect(result).toEqual({ damage: 0, penetration: 0, bonusApplied: 0, isNoOp: true });
        });
    });

    describe('hasCrusaderRole — item-name probe', () => {
        it('detects an item literally named "Crusader" (case-insensitive)', () => {
            expect(hasCrusaderRole([{ name: 'Crusader' }])).toBe(true);
            expect(hasCrusaderRole([{ name: 'CRUSADER' }])).toBe(true);
            expect(hasCrusaderRole([{ name: 'crusader role' }])).toBe(true);
        });
        it('detects the "Smite the Unholy" role-bonus rider', () => {
            expect(hasCrusaderRole([{ name: 'Smite the Unholy' }])).toBe(true);
            expect(hasCrusaderRole([{ name: 'smite the unholy (role bonus)' }])).toBe(true);
        });
        it('returns false when no owned item matches the role names', () => {
            expect(hasCrusaderRole([])).toBe(false);
            expect(hasCrusaderRole([{ name: 'Bodyguard' }, { name: 'Deny the Witch' }])).toBe(false);
        });
        it('tolerates items with null / undefined names without throwing', () => {
            expect(hasCrusaderRole([{ name: null }, { name: undefined }, { name: 'Crusader' }])).toBe(true);
            expect(hasCrusaderRole([{ name: null }, { name: undefined }])).toBe(false);
        });
    });
});
