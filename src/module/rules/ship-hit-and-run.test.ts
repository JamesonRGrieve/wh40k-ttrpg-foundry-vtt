import { describe, expect, it } from 'vitest';
import {
    APPROACH_BASE_DIFFICULTY,
    APPROACH_SHOTDOWN_DOF,
    COMMAND_BASE_DIFFICULTY,
    HIT_AND_RUN_CRIT_PICKS,
    HIT_AND_RUN_HULL_DAMAGE_PER_DOS,
    computeApproachTarget,
    degreesOfFailure,
    degreesOfSuccess,
    pickWorseCritRoll,
    resolveHitAndRun,
    resolveHitAndRunApproach,
    resolveHitAndRunCommand,
} from './ship-hit-and-run';

/**
 * RT Hit-and-Run resolver pins (#188 — core.md L10093-10097).
 *
 * Pins:
 *   - Constant exports (difficulty baselines, shot-down threshold, 1 hull
 *     per DoS, two crit-chart picks).
 *   - Approach target = base Pilot skill − Turret Rating.
 *   - Shot-down outcome triggers at 4+ DoF.
 *   - Opposed Command resolver applies the Ordinary (+10) baseline.
 *   - Crit-pick utility selects the higher (worse) of the two 1d5.
 *   - Top-level orchestrator short-circuits at each phase boundary.
 */
describe('ship-hit-and-run — invariants', () => {
    it('declares the RAW constants explicitly', () => {
        expect(APPROACH_BASE_DIFFICULTY).toBe(0);
        expect(APPROACH_SHOTDOWN_DOF).toBe(4);
        expect(COMMAND_BASE_DIFFICULTY).toBe(10);
        expect(HIT_AND_RUN_HULL_DAMAGE_PER_DOS).toBe(1);
        expect(HIT_AND_RUN_CRIT_PICKS).toBe(2);
    });
});

describe('ship-hit-and-run — DoS / DoF math', () => {
    it('DoS matches the shared rule', () => {
        expect(degreesOfSuccess(40, 40)).toBe(1);
        expect(degreesOfSuccess(11, 40)).toBe(3);
    });

    it('DoF returns 1 on a bare fail', () => {
        expect(degreesOfFailure(41, 40)).toBe(1);
        expect(degreesOfFailure(50, 40)).toBe(1);
    });

    it('DoF returns 4 at 31+ over the target (4+ DoF threshold)', () => {
        expect(degreesOfFailure(71, 40)).toBe(4); // (71-40-1)/10 + 1 = 4
        expect(degreesOfFailure(80, 40)).toBe(4);
        expect(degreesOfFailure(81, 40)).toBe(5);
    });
});

describe('ship-hit-and-run — computeApproachTarget', () => {
    it('subtracts the target Turret Rating from the Pilot skill', () => {
        expect(computeApproachTarget(50, 1)).toBe(49);
        expect(computeApproachTarget(50, 2)).toBe(48);
        expect(computeApproachTarget(50, 0)).toBe(50);
    });
});

describe('ship-hit-and-run — resolveHitAndRunApproach', () => {
    it('hits when the roll is at or under the composed target', () => {
        const r = resolveHitAndRunApproach({ pilotRoll: 45, pilotSkill: 50, targetTurretRating: 1 });
        expect(r.target).toBe(49);
        expect(r.hit).toBe(true);
        expect(r.dos).toBe(1);
        expect(r.dof).toBe(0);
        expect(r.shotDown).toBe(false);
    });

    it('misses at 1 DoF on a bare fail', () => {
        const r = resolveHitAndRunApproach({ pilotRoll: 50, pilotSkill: 50, targetTurretRating: 1 });
        // target = 49, roll = 50 → 1 DoF
        expect(r.hit).toBe(false);
        expect(r.dof).toBe(1);
        expect(r.shotDown).toBe(false);
    });

    it('craft is shot down at 4+ DoF (fail by 31+ over target)', () => {
        const r = resolveHitAndRunApproach({ pilotRoll: 80, pilotSkill: 50, targetTurretRating: 1 });
        // target = 49, roll = 80 → 4 DoF
        expect(r.hit).toBe(false);
        expect(r.dof).toBe(4);
        expect(r.shotDown).toBe(true);
    });
});

describe('ship-hit-and-run — resolveHitAndRunCommand', () => {
    it('applies the Ordinary (+10) baseline by default', () => {
        const r = resolveHitAndRunCommand({
            attackerRoll: 55, // passes vs 40+10 = 50 fails; vs 50+10 = 60 passes
            attackerCommandTarget: 50,
            defenderRoll: 80,
            defenderCommandTarget: 40,
        });
        // attacker target = 60, roll 55 → DoS = (60-55)/10+1 = 1
        // defender target = 50, roll 80 → fail
        expect(r.attackerDoS).toBe(1);
        expect(r.defenderDoS).toBe(0);
        expect(r.success).toBe(true);
    });

    it('respects applyOrdinaryBaseline: false for callers that pre-compose', () => {
        const r = resolveHitAndRunCommand({
            attackerRoll: 50,
            attackerCommandTarget: 50,
            defenderRoll: 30,
            defenderCommandTarget: 60,
            applyOrdinaryBaseline: false,
        });
        // No +10. atk target=50, roll 50 → 1 DoS; def target=60, roll 30 → 4 DoS
        expect(r.attackerDoS).toBe(1);
        expect(r.defenderDoS).toBe(4);
        expect(r.success).toBe(false);
    });

    it('tie favours the defender', () => {
        const r = resolveHitAndRunCommand({
            attackerRoll: 40,
            attackerCommandTarget: 50,
            defenderRoll: 40,
            defenderCommandTarget: 50,
        });
        expect(r.netDoS).toBe(0);
        expect(r.success).toBe(false);
    });
});

describe('ship-hit-and-run — pickWorseCritRoll', () => {
    it('returns the higher (more severe) of the two crit picks', () => {
        expect(pickWorseCritRoll(1, 5)).toBe(5);
        expect(pickWorseCritRoll(3, 3)).toBe(3);
        expect(pickWorseCritRoll(4, 2)).toBe(4);
    });
});

describe('ship-hit-and-run — resolveHitAndRun (orchestrator)', () => {
    it('short-circuits when the approach is shot down', () => {
        const r = resolveHitAndRun({
            approach: { pilotRoll: 95, pilotSkill: 50, targetTurretRating: 1 },
            command: { attackerRoll: 50, attackerCommandTarget: 50, defenderRoll: 50, defenderCommandTarget: 50 },
            rolledCritA: 1,
            rolledCritB: 5,
        });
        expect(r.approach.shotDown).toBe(true);
        expect(r.command).toBeNull();
        expect(r.appliedCrit).toBeNull();
        expect(r.hullDamage).toBeNull();
    });

    it('short-circuits when the approach fails without being shot down', () => {
        const r = resolveHitAndRun({
            approach: { pilotRoll: 60, pilotSkill: 50, targetTurretRating: 1 },
            command: { attackerRoll: 10, attackerCommandTarget: 50, defenderRoll: 90, defenderCommandTarget: 50 },
            rolledCritA: 2,
            rolledCritB: 4,
        });
        expect(r.approach.hit).toBe(false);
        expect(r.approach.shotDown).toBe(false);
        expect(r.command).toBeNull();
        expect(r.appliedCrit).toBeNull();
    });

    it('short-circuits when the Command test fails after a successful approach', () => {
        const r = resolveHitAndRun({
            approach: { pilotRoll: 20, pilotSkill: 50, targetTurretRating: 1 },
            command: { attackerRoll: 70, attackerCommandTarget: 40, defenderRoll: 10, defenderCommandTarget: 50 },
            rolledCritA: 3,
            rolledCritB: 4,
        });
        expect(r.approach.hit).toBe(true);
        expect(r.command).not.toBeNull();
        expect(r.command?.success).toBe(false);
        expect(r.appliedCrit).toBeNull();
        expect(r.hullDamage).toBeNull();
    });

    it('applies the pick-worse crit and Hull = netDoS × 1 on a full success', () => {
        const r = resolveHitAndRun({
            approach: { pilotRoll: 10, pilotSkill: 50, targetTurretRating: 1 },
            command: { attackerRoll: 10, attackerCommandTarget: 50, defenderRoll: 90, defenderCommandTarget: 40 },
            rolledCritA: 2,
            rolledCritB: 5,
        });
        expect(r.approach.hit).toBe(true);
        expect(r.command?.success).toBe(true);
        // attacker target = 50+10=60, roll 10 → 6 DoS
        // defender target = 40+10=50, roll 90 → 0 DoS
        expect(r.command?.netDoS).toBe(6);
        expect(r.appliedCrit).toBe(5);
        expect(r.hullDamage).toBe(6);
    });
});
