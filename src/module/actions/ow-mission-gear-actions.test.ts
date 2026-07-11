import { describe, expect, it } from 'vitest';
import { resolveGearOutcome } from '../rules/ow-mission-gear.ts';
import { deriveGearDegrees } from './ow-mission-gear-actions.ts';

/**
 * Regression coverage for #301 (reopened): the OW Mission Assignment Gear
 * handler used to re-inline the d100 success rule as `margin >= 0`, which
 * treats a natural 100 as a success once Table 6-3 modifiers push the
 * effective target to ≥100. `deriveGearDegrees` now routes pass/fail through
 * `isD100Success` and the degrees through the shared `_dice` primitives, so
 * a natural 100 always fails and still reports at least one Degree of Failure.
 */
describe('deriveGearDegrees — #301 natural-100 / natural-01 override', () => {
    it('resolves a natural 100 at an effective target of exactly 100 as a FAILURE (dos 0, dof ≥ 1)', () => {
        // The reinlined rule this replaces: `100 - 100 >= 0` === true, i.e. it
        // wrongly treated the natural 100 as a pass. Pin the corrected behavior.
        expect(100 - 100).toBeGreaterThanOrEqual(0);

        const degrees = deriveGearDegrees(100, 100);
        expect(degrees.passed).toBe(false);
        expect(degrees.degreesOfSuccess).toBe(0);
        expect(degrees.degreesOfFailure).toBeGreaterThanOrEqual(1);

        // A failure must not land on a success tier of Table 6-4.
        const outcome = resolveGearOutcome(degrees);
        expect(outcome.outcome).toBe('minimum-kit');
        expect(outcome.bonusItemCount).toBe(0);
    });

    it('resolves a natural 100 at an effective target well above 100 as a FAILURE (dos 0, dof ≥ 1)', () => {
        const degrees = deriveGearDegrees(100, 150);
        expect(degrees.passed).toBe(false);
        expect(degrees.degreesOfSuccess).toBe(0);
        expect(degrees.degreesOfFailure).toBeGreaterThanOrEqual(1);
        expect(resolveGearOutcome(degrees).outcome).toBe('minimum-kit');
    });

    it('resolves a natural 01 as a SUCCESS even when the effective target is 0', () => {
        const degrees = deriveGearDegrees(1, 0);
        expect(degrees.passed).toBe(true);
        expect(degrees.degreesOfFailure).toBe(0);
        expect(degrees.degreesOfSuccess).toBeGreaterThanOrEqual(1);
        expect(resolveGearOutcome(degrees).outcome).toBe('standard-kit');
    });
});

describe('deriveGearDegrees — ordinary pass/fail preserves the prior degree math', () => {
    it('a marginal pass scores 1 Degree of Success → standard-kit', () => {
        const degrees = deriveGearDegrees(55, 60);
        expect(degrees.passed).toBe(true);
        expect(degrees.degreesOfSuccess).toBe(1);
        expect(degrees.degreesOfFailure).toBe(0);
        expect(resolveGearOutcome(degrees).outcome).toBe('standard-kit');
    });

    it('a comfortable pass scores 4+ Degrees of Success → bonus-items', () => {
        const degrees = deriveGearDegrees(20, 60);
        expect(degrees.passed).toBe(true);
        // floor((60 - 20) / 10) + 1 = 5
        expect(degrees.degreesOfSuccess).toBe(5);
        expect(degrees.degreesOfFailure).toBe(0);
        const outcome = resolveGearOutcome(degrees);
        expect(outcome.outcome).toBe('bonus-items');
        expect(outcome.bonusItemCount).toBe(1);
    });

    it('an ordinary failure scores the expected Degrees of Failure → minimum-kit', () => {
        const degrees = deriveGearDegrees(75, 60);
        expect(degrees.passed).toBe(false);
        expect(degrees.degreesOfSuccess).toBe(0);
        // floor((75 - 60) / 10) + 1 = 2
        expect(degrees.degreesOfFailure).toBe(2);
        expect(resolveGearOutcome(degrees).outcome).toBe('minimum-kit');
    });

    it('a catastrophic failure (4+ DoF) surrenders the kit', () => {
        const degrees = deriveGearDegrees(95, 50);
        expect(degrees.passed).toBe(false);
        // floor((95 - 50) / 10) + 1 = 5
        expect(degrees.degreesOfFailure).toBe(5);
        expect(resolveGearOutcome(degrees).outcome).toBe('surrender-kit');
    });
});
