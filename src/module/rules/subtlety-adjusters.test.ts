import { describe, expect, it } from 'vitest';
import { clampSubtletyLoss, isSubtletyPrimitive, type SubtletySourceRef } from './subtlety-adjusters';

/**
 * `subtlety-adjusters.ts` is now content-agnostic (CLAUDE.md Direction #7):
 * the deltas/clamps/labels live on compendium documents and are discovered by
 * tree-walking the actor. Only the pure clamp math and the non-content
 * primitive predicate remain here, so these are the only regression surfaces.
 *
 * `clampSubtletyLoss` generalizes the old Quarantine-World hardcoded "-1": the
 * minimum retained loss is supplied by the caller from the governing
 * compendium entry (`Quarantine World` authors `minAbsoluteDelta: 1`).
 */
describe('clampSubtletyLoss', () => {
    it('passes positive deltas (gains) through unchanged', () => {
        expect(clampSubtletyLoss(3, 1)).toBe(3);
    });

    it('passes 0 through as 0', () => {
        expect(clampSubtletyLoss(0, 1)).toBe(0);
    });

    it('clamps a -5 loss to -1 with minAbsoluteDelta 1 (Quarantine World)', () => {
        expect(clampSubtletyLoss(-5, 1)).toBe(-1);
    });

    it('leaves a -1 loss unchanged with minAbsoluteDelta 1', () => {
        expect(clampSubtletyLoss(-1, 1)).toBe(-1);
    });

    it('truncates fractional deltas before clamping', () => {
        expect(clampSubtletyLoss(-2.9, 1)).toBe(-1);
        expect(clampSubtletyLoss(2.9, 1)).toBe(2);
    });

    it('does not clamp when minAbsoluteDelta is 0 (no clamp authored)', () => {
        expect(clampSubtletyLoss(-5, 0)).toBe(-5);
    });

    it('does not clamp when minAbsoluteDelta is negative (defensive)', () => {
        expect(clampSubtletyLoss(-5, -2)).toBe(-5);
    });

    it('honours a generalized cap greater than 1', () => {
        expect(clampSubtletyLoss(-5, 2)).toBe(-2);
        expect(clampSubtletyLoss(-1, 2)).toBe(-1);
    });
});

describe('isSubtletyPrimitive', () => {
    it('recognizes the non-content primitives', () => {
        expect(isSubtletyPrimitive('manual')).toBe(true);
        expect(isSubtletyPrimitive('inquest')).toBe(true);
    });

    it('rejects a compendium UUID source ref', () => {
        const ref: SubtletySourceRef = 'Compendium.wh40k-rpg.dh2-beyond-stats-talents.Item.hiKOrgqtppkvARtd';
        expect(isSubtletyPrimitive(ref)).toBe(false);
    });

    it('rejects an empty / arbitrary string', () => {
        expect(isSubtletyPrimitive('')).toBe(false);
        expect(isSubtletyPrimitive('quarantineWorld')).toBe(false);
    });
});
