import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { clampModifierToCap, ROLL_MODIFIER_CAP } from './roll-data';

/**
 * Regression tests for the ±60 modifier cap (DH2 core.md L1050).
 * The clamp is consumed by `RollData.calculateTotalModifiers` and the
 * resulting `rawModifierTotal` / `modifierCapFired` fields are
 * surfaced on chat cards so the GM can see when the cap fired.
 */
describe('clampModifierToCap (#127)', () => {
    it('exports the canonical cap value', () => {
        expect(ROLL_MODIFIER_CAP).toBe(60);
    });

    it('passes through values within the cap', () => {
        expect(clampModifierToCap(0)).toEqual({ clamped: 0, raw: 0, capFired: false });
        expect(clampModifierToCap(45)).toEqual({ clamped: 45, raw: 45, capFired: false });
        expect(clampModifierToCap(-45)).toEqual({ clamped: -45, raw: -45, capFired: false });
    });

    it('passes through boundary values (+60 and -60) without firing the cap', () => {
        expect(clampModifierToCap(60)).toEqual({ clamped: 60, raw: 60, capFired: false });
        expect(clampModifierToCap(-60)).toEqual({ clamped: -60, raw: -60, capFired: false });
    });

    it('clamps positive overflow to +60 and records the raw value', () => {
        expect(clampModifierToCap(61)).toEqual({ clamped: 60, raw: 61, capFired: true });
        expect(clampModifierToCap(100)).toEqual({ clamped: 60, raw: 100, capFired: true });
    });

    it('clamps negative overflow to -60 and records the raw value', () => {
        expect(clampModifierToCap(-61)).toEqual({ clamped: -60, raw: -61, capFired: true });
        expect(clampModifierToCap(-200)).toEqual({ clamped: -60, raw: -200, capFired: true });
    });

    it('treats non-finite inputs (NaN, Infinity, -Infinity) as zero', () => {
        expect(clampModifierToCap(Number.NaN)).toEqual({ clamped: 0, raw: 0, capFired: false });
        expect(clampModifierToCap(Number.POSITIVE_INFINITY)).toEqual({ clamped: 0, raw: 0, capFired: false });
        expect(clampModifierToCap(Number.NEGATIVE_INFINITY)).toEqual({ clamped: 0, raw: 0, capFired: false });
    });
});

describe('opposed psychic resolution wired to the #449 engine (#451)', () => {
    const rollData = readRepoFile('src/module/rolls/roll-data.ts');
    const actionData = readRepoFile('src/module/rolls/action-data.ts');

    it('a power flagged focusPower.opposed becomes an opposed roll vs its resist characteristic', () => {
        expect(rollData).toContain('focusPower?.opposed === true');
        expect(rollData).toContain('this.isOpposed = true');
        // Defaults to Willpower when the power does not name a resist characteristic.
        expect(rollData).toContain("'willpower'");
    });

    it('the psychic card surfaces whether the target resisted and the #449 margin', () => {
        expect(actionData).toContain('this.rollData.isOpposed');
        expect(actionData).toContain('WH40K.Psychic.OpposedResisted');
        expect(actionData).toContain('this.rollData.opposedMargin');
    });
});
