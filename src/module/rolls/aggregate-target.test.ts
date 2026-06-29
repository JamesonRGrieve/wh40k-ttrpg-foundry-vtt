import { describe, expect, it } from 'vitest';
import { aggregateModifierTotal, aggregateRollTarget, clampModifierToCap, ROLL_MODIFIER_CAP, sumModifierValues } from './aggregate-target';

/**
 * Pure modifier-aggregation helpers backing the Roll Test / weapon-attack
 * dialog's live target (#382). The displayed top target and the committed
 * roll's `modifiedTarget` both flow through `aggregateRollTarget`, so summing
 * and capping must be exact.
 */
describe('sumModifierValues', () => {
    it('returns 0 for an empty record', () => {
        expect(sumModifierValues({})).toBe(0);
    });

    it('sums every value regardless of key', () => {
        expect(sumModifierValues({ difficulty: 10, aim: 10, modifier: 5 })).toBe(25);
    });

    it('sums mixed positive and negative modifiers', () => {
        expect(sumModifierValues({ 'attack': 10, 'range': -10, 'cover': -20, 'weapon-training': 10 })).toBe(-10);
    });

    it('treats non-finite values as zero rather than poisoning the total', () => {
        expect(sumModifierValues({ a: 10, b: Number.NaN, c: Number.POSITIVE_INFINITY, d: 5 })).toBe(15);
    });
});

describe('aggregateModifierTotal', () => {
    it('passes a within-cap sum straight through', () => {
        expect(aggregateModifierTotal({ a: 20, b: 15 })).toEqual({ total: 35, raw: 35, capFired: false });
    });

    it('clamps a sum above +60 and records the raw value', () => {
        expect(aggregateModifierTotal({ a: 40, b: 40 })).toEqual({ total: 60, raw: 80, capFired: true });
    });

    it('clamps a sum below -60', () => {
        expect(aggregateModifierTotal({ a: -50, b: -40 })).toEqual({ total: -60, raw: -90, capFired: true });
    });
});

describe('aggregateRollTarget', () => {
    it('returns the base characteristic when there are no modifiers', () => {
        expect(aggregateRollTarget(45, {})).toBe(45);
    });

    it('adds base + every active modifier', () => {
        // BS 40 + standard-attack +10 + aim +10 - range -10 = 50
        expect(aggregateRollTarget(40, { attack: 10, aim: 10, range: -10 })).toBe(50);
    });

    it('recomputes when a modifier changes (changing range moves the target)', () => {
        const base = 40;
        const mods = { attack: 10 };
        expect(aggregateRollTarget(base, { ...mods, range: 0 })).toBe(50);
        expect(aggregateRollTarget(base, { ...mods, range: 10 })).toBe(60);
        expect(aggregateRollTarget(base, { ...mods, range: -30 })).toBe(20);
    });

    it('applies the ±60 modifier cap on top of the base, never on the base itself', () => {
        // base 50, raw modifier sum +90 → capped to +60 → 110
        expect(aggregateRollTarget(50, { a: 50, b: 40 })).toBe(110);
    });
});

describe('clampModifierToCap (re-homed from roll-data)', () => {
    it('exports the canonical cap value', () => {
        expect(ROLL_MODIFIER_CAP).toBe(60);
    });

    it('passes through boundary values without firing the cap', () => {
        expect(clampModifierToCap(60)).toEqual({ clamped: 60, raw: 60, capFired: false });
        expect(clampModifierToCap(-60)).toEqual({ clamped: -60, raw: -60, capFired: false });
    });

    it('treats non-finite inputs as zero', () => {
        expect(clampModifierToCap(Number.NaN)).toEqual({ clamped: 0, raw: 0, capFired: false });
    });
});
