import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { clampModifierToCap, RollData, ROLL_MODIFIER_CAP } from './roll-data';

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

describe('RollData.buildModifierSources — roll transparency provenance', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (k: string) => k } });
    });
    afterEach(() => vi.unstubAllGlobals());

    /** Build a RollData without the config-heavy constructor, then set the fields the method reads. */
    function makeRollData(modifiers: Record<string, number>, expandedBuckets: RollData['expandedBuckets'] = {}): RollData {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test one pure method
        const rd = Object.create(RollData.prototype) as RollData;
        rd.modifiers = modifiers;
        rd.expandedBuckets = expandedBuckets;
        rd.modifierSources = [];
        return rd;
    }

    it('expands lumped buckets into their sourced parts, skips zero, and labels named keys', () => {
        const rd = makeRollData(
            { 'difficulty': 10, 'situational': 30, 'aim': 0, 'range': -20, 'attack-special-x': 5 },
            {
                situational: [
                    { key: 'aim_act', label: 'Aim', value: 10, source: 'Aim action' },
                    { key: 'deadeye', label: 'Deadeye', value: 20, source: 'Deadeye Shot' },
                ],
            },
        );
        rd.buildModifierSources();

        const labels = rd.modifierSources.map((c) => c.label);
        // difficulty (named) + two situational sub-parts + range (named) + the unknown key title-cased; aim (0) skipped.
        expect(labels).toEqual(['WH40K.Roll.ModifierSource.Difficulty', 'Aim', 'Deadeye', 'WH40K.Roll.ModifierSource.Range', 'Attack Special X']);
    });

    it('components sum to the non-zero modifier total (the transparency invariant)', () => {
        const modifiers = { 'difficulty': 10, 'situational': 30, 'aim': 0, 'range': -20, 'attack-special-x': 5 };
        const rd = makeRollData(modifiers, {
            situational: [
                { key: 'a', label: 'Aim', value: 10, source: 'Aim action' },
                { key: 'b', label: 'Deadeye', value: 20, source: 'Deadeye Shot' },
            ],
        });
        rd.buildModifierSources();
        const componentSum = rd.modifierSources.reduce((acc, c) => acc + c.value, 0);
        const modifierSum = Object.values(modifiers).reduce((acc, v) => acc + v, 0);
        expect(componentSum).toBe(modifierSum);
        expect(componentSum).toBe(25);
    });

    it('attaches a wh40k-tooltip "modifier" payload to each component', () => {
        const rd = makeRollData({ range: -20 });
        rd.buildModifierSources();
        const range = rd.modifierSources.at(0);
        expect(range?.tooltipData).toBeDefined();
        // eslint-disable-next-line no-restricted-syntax -- test: JSON.parse returns unknown under ts-reset; the shape is asserted immediately below
        const parsed = JSON.parse(range?.tooltipData ?? '{}') as { title: string; sources: { name: string; value: number }[] };
        expect(parsed.title).toBe('WH40K.Roll.ModifierSource.Range');
        expect(parsed.sources).toEqual([{ name: 'WH40K.Roll.ModifierSource.Range', value: -20 }]);
    });

    it('does not mutate the dialog-supplied expandedBuckets components', () => {
        const situational = [{ key: 'a', label: 'Aim', value: 10, source: 'Aim action' }];
        const rd = makeRollData({ situational: 10 }, { situational });
        rd.buildModifierSources();
        // The stored expansion entry stays free of the tooltip payload (fresh objects are emitted).
        const first = situational.at(0);
        expect(first !== undefined && 'tooltipData' in first).toBe(false);
    });
});

describe('result formula transparency (#… — central derivation in ActionData)', () => {
    const actionData = readRepoFile('src/module/rolls/action-data.ts');

    it('ActionData builds a localized result formula from the final degrees and roll vs target', () => {
        expect(actionData).toContain('this.rollData.resultFormula');
        expect(actionData).toContain('WH40K.Roll.ResultFormula.Success');
        expect(actionData).toContain('WH40K.Roll.ResultFormula.Failure');
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
