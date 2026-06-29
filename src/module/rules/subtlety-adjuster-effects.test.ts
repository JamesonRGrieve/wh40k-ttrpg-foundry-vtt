import { describe, expect, it } from 'vitest';
import {
    desiredSubtletyAdjusterEffects,
    type ExistingSubtletyAdjusterEffect,
    planSubtletyAdjusterEffects,
    subtletyAdjusterSourceKey,
} from './subtlety-adjuster-effects';
import type { CollectedAdjuster } from './subtlety-adjusters';

/**
 * Pure-derivation coverage for surfacing standing Subtlety adjusters as
 * display-only ActiveEffects (issue #391). These functions decide WHICH
 * adjusters become effects, their stable identity, and the create/delete diff
 * against effects already on the actor — the math (clampSubtletyLoss) is tested
 * separately and is never duplicated here. The Quarantine World clamp
 * (`kind: 'clamp'`, `minAbsoluteDelta: 1`) is the canonical case.
 */

function adjuster(overrides: Partial<CollectedAdjuster> = {}): CollectedAdjuster {
    return {
        sourceUuid: 'Compendium.wh40k-rpg.dh2-beyond-origins-homeworlds.Item.quarantine',
        primitive: null,
        label: 'Quarantine World',
        kind: 'clamp',
        delta: 0,
        minAbsoluteDelta: 1,
        ...overrides,
    };
}

describe('subtletyAdjusterSourceKey', () => {
    it('prefers the compendium source UUID', () => {
        expect(subtletyAdjusterSourceKey(adjuster())).toBe('Compendium.wh40k-rpg.dh2-beyond-origins-homeworlds.Item.quarantine');
    });

    it('falls back to the primitive tag when there is no UUID', () => {
        expect(subtletyAdjusterSourceKey(adjuster({ sourceUuid: null, primitive: 'manual' }))).toBe('manual');
    });

    it('falls back to the label when neither UUID nor primitive is present', () => {
        expect(subtletyAdjusterSourceKey(adjuster({ sourceUuid: '', primitive: null, label: 'Bespoke Clamp' }))).toBe('Bespoke Clamp');
    });
});

describe('desiredSubtletyAdjusterEffects', () => {
    it('derives a display-only descriptor for a Quarantine World clamp', () => {
        const [effect, ...rest] = desiredSubtletyAdjusterEffects([adjuster()]);
        expect(rest).toHaveLength(0);
        expect(effect).toEqual({
            sourceKey: 'Compendium.wh40k-rpg.dh2-beyond-origins-homeworlds.Item.quarantine',
            name: 'Quarantine World',
            kind: 'clamp',
            delta: 0,
            minAbsoluteDelta: 1,
        });
    });

    it('includes passive adjusters and carries their signed delta', () => {
        const [effect] = desiredSubtletyAdjusterEffects([
            adjuster({ sourceUuid: 'uuid-passive', label: 'Hidden Network', kind: 'passive', delta: -2, minAbsoluteDelta: 0 }),
        ]);
        expect(effect).toMatchObject({ kind: 'passive', delta: -2 });
    });

    it('excludes one-shot event adjusters (not standing effects)', () => {
        expect(desiredSubtletyAdjusterEffects([adjuster({ kind: 'event', delta: -3, minAbsoluteDelta: 0 })])).toEqual([]);
    });

    it('collapses duplicate source keys into a single descriptor', () => {
        const dup = adjuster();
        expect(desiredSubtletyAdjusterEffects([dup, { ...dup }])).toHaveLength(1);
    });
});

describe('planSubtletyAdjusterEffects', () => {
    it('creates a descriptor that has no matching existing effect', () => {
        const desired = desiredSubtletyAdjusterEffects([adjuster()]);
        const plan = planSubtletyAdjusterEffects(desired, []);
        expect(plan.toCreate).toHaveLength(1);
        expect(plan.toDeleteIds).toEqual([]);
    });

    it('is a no-op when the existing effect still matches the source (idempotent)', () => {
        const desired = desiredSubtletyAdjusterEffects([adjuster()]);
        const existing: ExistingSubtletyAdjusterEffect[] = [{ id: 'ae1', sourceKey: subtletyAdjusterSourceKey(adjuster()) }];
        const plan = planSubtletyAdjusterEffects(desired, existing);
        expect(plan.toCreate).toEqual([]);
        expect(plan.toDeleteIds).toEqual([]);
    });

    it('deletes a flagged effect whose source is gone', () => {
        const existing: ExistingSubtletyAdjusterEffect[] = [{ id: 'stale', sourceKey: 'removed-uuid' }];
        const plan = planSubtletyAdjusterEffects([], existing);
        expect(plan.toCreate).toEqual([]);
        expect(plan.toDeleteIds).toEqual(['stale']);
    });

    it('deletes duplicate effects for the same source, keeping one', () => {
        const desired = desiredSubtletyAdjusterEffects([adjuster()]);
        const key = subtletyAdjusterSourceKey(adjuster());
        const existing: ExistingSubtletyAdjusterEffect[] = [
            { id: 'keep', sourceKey: key },
            { id: 'dup', sourceKey: key },
        ];
        const plan = planSubtletyAdjusterEffects(desired, existing);
        expect(plan.toCreate).toEqual([]);
        expect(plan.toDeleteIds).toEqual(['dup']);
    });
});
