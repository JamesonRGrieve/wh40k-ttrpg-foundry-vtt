import { describe, expect, it } from 'vitest';
import { COMBAT_CIRCUMSTANCE_MODIFIERS, getCombatModifier } from './combat-circumstance-modifiers';
import { MAX_SIZE, MIN_SIZE, targetSizeModifier } from './target-size';

/**
 * Tests for the shared target-size to-hit SSOT (DH2 Table 4-6, p.138).
 *
 * The formula was previously encoded twice — a `(size − 4) × 10` formula in
 * `rolls/roll-data.ts` and a 7-row table (stopping at Size 7) in
 * `rules/combat-circumstance-modifiers.ts`. That divergence gave Size 8–10
 * targets +30 via the dialog rows but +40/+50/+60 via the auto-modifier
 * (#421). These tests pin the full 1–10 ladder and prove both paths now agree.
 */
describe('targetSizeModifier (Table 4-6 SSOT, #421)', () => {
    it('returns 0 for an Average (4) target', () => {
        expect(targetSizeModifier(4)).toBe(0);
    });

    it('pins the full RAW ladder for sizes 1–10', () => {
        expect(targetSizeModifier(1)).toBe(-30); // Minuscule
        expect(targetSizeModifier(2)).toBe(-20); // Puny
        expect(targetSizeModifier(3)).toBe(-10); // Scrawny
        expect(targetSizeModifier(4)).toBe(0); // Average
        expect(targetSizeModifier(5)).toBe(10); // Hulking
        expect(targetSizeModifier(6)).toBe(20); // Enormous
        expect(targetSizeModifier(7)).toBe(30); // Massive
        expect(targetSizeModifier(8)).toBe(40); // Immense
        expect(targetSizeModifier(9)).toBe(50); // Monumental
        expect(targetSizeModifier(10)).toBe(60); // Titanic
    });

    it('gives Size 8–10 the +40/+50/+60 the auto-modifier already used (was +30 in the old table)', () => {
        expect(targetSizeModifier(8)).toBe(40);
        expect(targetSizeModifier(9)).toBe(50);
        expect(targetSizeModifier(10)).toBe(60);
    });

    it('clamps out-of-range sizes to the RAW extremes rather than extrapolating', () => {
        expect(targetSizeModifier(0)).toBe(targetSizeModifier(MIN_SIZE));
        expect(targetSizeModifier(-5)).toBe(-30);
        expect(targetSizeModifier(11)).toBe(targetSizeModifier(MAX_SIZE));
        expect(targetSizeModifier(99)).toBe(60);
    });

    it('propagates a non-numeric size as NaN (matches pre-SSOT call-site behaviour)', () => {
        expect(Number.isNaN(targetSizeModifier(Number.NaN))).toBe(true);
    });
});

/**
 * The circumstance-modifier size rows are generated from `targetSizeModifier`,
 * so the two former sources of the rule now share one definition. Assert the
 * registry rows agree with the formula across the whole ladder — the exact
 * regression that #421 fixes.
 */
describe('combat-circumstance size rows agree with the formula SSOT (#421)', () => {
    const SIZE_ROW_IDS: readonly { id: string; size: number }[] = [
        { id: 'size-miniscule', size: 1 },
        { id: 'size-puny', size: 2 },
        { id: 'size-scrawny', size: 3 },
        { id: 'size-average', size: 4 },
        { id: 'size-hulking', size: 5 },
        { id: 'size-enormous', size: 6 },
        { id: 'size-massive', size: 7 },
        { id: 'size-immense', size: 8 },
        { id: 'size-monumental', size: 9 },
        { id: 'size-titanic', size: 10 },
    ];

    it('every registry size row equals targetSizeModifier(size)', () => {
        for (const { id, size } of SIZE_ROW_IDS) {
            expect(getCombatModifier(id)?.value, `row ${id}`).toBe(targetSizeModifier(size));
        }
    });

    it('exposes the full 1–10 ladder (Size 8–10 rows are present, not truncated at 7)', () => {
        const sizeRows = COMBAT_CIRCUMSTANCE_MODIFIERS.filter((m) => m.id.startsWith('size-'));
        expect(sizeRows).toHaveLength(10);
        expect(getCombatModifier('size-immense')?.value).toBe(40);
        expect(getCombatModifier('size-monumental')?.value).toBe(50);
        expect(getCombatModifier('size-titanic')?.value).toBe(60);
    });
});
