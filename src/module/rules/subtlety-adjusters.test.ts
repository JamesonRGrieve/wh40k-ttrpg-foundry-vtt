import { describe, expect, it } from 'vitest';
import {
    SUBTLETY_ADJUSTERS,
    clampSubtletyLossForQuarantineWorld,
    getSubtletyAdjuster,
    resolveSubtletyAdjusterDelta,
    type SubtletyAdjusterSource,
} from './subtlety-adjusters';

/**
 * Regression tests for the Warband Subtlety adjuster registry (Enemies
 * Beyond/Within supplement wiring per audit umbrella #197). The deltas
 * are pinned to source pages:
 *   - quarantineWorld: Beyond p. 30 (resists loss; min -1 net)
 *   - daemonWeaponWielded: Beyond p. 50
 *   - darkPactDiscovered: Beyond p. 72
 *   - inquestPursued: Within p. 62
 *   - manual: GM adjustment (no inherent delta)
 *
 * If any expected value changes, verify the new RAW value before bumping the
 * fixture — the registry is the single source of truth consumed by
 * `base-actor.applySubtletyAdjuster`.
 */
describe('SUBTLETY_ADJUSTERS registry', () => {
    const expected: Record<SubtletyAdjusterSource, number> = {
        quarantineWorld: 0,
        daemonWeaponWielded: -1,
        darkPactDiscovered: -3,
        inquestPursued: -1,
        manual: 0,
    };

    for (const source of Object.keys(expected) as SubtletyAdjusterSource[]) {
        it(`registers ${source} with the canonical delta`, () => {
            expect(SUBTLETY_ADJUSTERS[source].delta).toBe(expected[source]);
        });

        it(`exposes a labelKey for ${source}`, () => {
            expect(SUBTLETY_ADJUSTERS[source].labelKey).toMatch(/^WH40K\.Subtlety\.Source\./);
        });
    }

    it('quarantineWorld carries a minAbsoluteDelta of 1', () => {
        expect(SUBTLETY_ADJUSTERS.quarantineWorld.minAbsoluteDelta).toBe(1);
    });
});

describe('getSubtletyAdjuster', () => {
    it('returns the registered adjuster object', () => {
        expect(getSubtletyAdjuster('darkPactDiscovered').delta).toBe(-3);
    });
});

describe('clampSubtletyLossForQuarantineWorld', () => {
    it('passes positive deltas through unchanged', () => {
        expect(clampSubtletyLossForQuarantineWorld(3)).toBe(3);
    });

    it('clamps a -5 loss to -1', () => {
        expect(clampSubtletyLossForQuarantineWorld(-5)).toBe(-1);
    });

    it('leaves a -1 loss unchanged', () => {
        expect(clampSubtletyLossForQuarantineWorld(-1)).toBe(-1);
    });

    it('passes 0 through as 0', () => {
        expect(clampSubtletyLossForQuarantineWorld(0)).toBe(0);
    });

    it('truncates fractional deltas before clamping', () => {
        expect(clampSubtletyLossForQuarantineWorld(-2.9)).toBe(-1);
        expect(clampSubtletyLossForQuarantineWorld(2.9)).toBe(2);
    });
});

describe('resolveSubtletyAdjusterDelta', () => {
    it('returns the raw scaled delta when the actor is not from a Quarantine World', () => {
        expect(resolveSubtletyAdjusterDelta('darkPactDiscovered', 1, false)).toBe(-3);
        expect(resolveSubtletyAdjusterDelta('daemonWeaponWielded', 2, false)).toBe(-2);
    });

    it('clamps a Quarantine-World actor net loss to -1 regardless of scale', () => {
        expect(resolveSubtletyAdjusterDelta('darkPactDiscovered', 1, true)).toBe(-1);
        expect(resolveSubtletyAdjusterDelta('daemonWeaponWielded', 5, true)).toBe(-1);
    });

    it('does not clamp gains for a Quarantine-World actor', () => {
        // manual has delta=0; a positive scale of an inversed manual adjustment
        // simulates a GM-supplied gain delta via direct applySubtlety, not this path.
        // For verification, fake a positive raw via a hypothetical positive source:
        // the function uses the registered delta * scale. Use inquestPursued at
        // a NEGATIVE scale to produce a positive raw — verifies the clamp only
        // fires when the resolved delta is < 0.
        expect(resolveSubtletyAdjusterDelta('inquestPursued', -3, true)).toBe(3);
    });

    it('returns 0 for the manual adjuster regardless of clamp state', () => {
        expect(resolveSubtletyAdjusterDelta('manual', 1, true)).toBe(0);
        expect(resolveSubtletyAdjusterDelta('manual', 1, false)).toBe(0);
    });
});
