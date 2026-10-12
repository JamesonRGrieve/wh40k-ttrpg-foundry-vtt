import { describe, expect, it } from 'vitest';
import { resolveShipTest, SITUATIONAL_MODIFIER_KEY, type ShipAssaultShip } from './ship-assault';
import {
    APPROACH_BASE_DIFFICULTY,
    APPROACH_SHOTDOWN_DOF,
    APPROACH_TURRET_PENALTY_PER_POINT,
    COMMAND_BASE_DIFFICULTY,
    composeApproachTest,
    composeRaidCommand,
    HIT_AND_RUN_CRIT_PICKS,
    HIT_AND_RUN_HULL_DAMAGE_PER_DOS,
    HIT_AND_RUN_KEYS,
    hitAndRunHullDamage,
    isShotDown,
    pickWorseCritRoll,
    resolveHitAndRunCommand,
} from './ship-hit-and-run';

/**
 * RT Hit and Run pins (#188 — RT Core p.218, turret penalty p.220).
 *
 * Regression guards: the previous resolver subtracted the raw Turret Rating
 * (a rating of 2 cost −2, not −20), and counted the shot-down threshold with a
 * degrees-of-failure convention that disagreed with the system's own roll
 * engine at exact multiples of 10.
 */

function target(turretRating: number): ShipAssaultShip {
    return {
        name: 'Whispering Star',
        hullType: 'raider',
        manoeuvrability: 20,
        armour: 16,
        turretRating,
        crewPopulation: 55,
        hullIntegrity: 28,
        morale: 60,
    };
}

describe('ship-hit-and-run — invariants', () => {
    it('pins the printed constants', () => {
        expect(APPROACH_BASE_DIFFICULTY).toBe(0);
        expect(APPROACH_TURRET_PENALTY_PER_POINT).toBe(-10);
        expect(APPROACH_SHOTDOWN_DOF).toBe(4);
        expect(COMMAND_BASE_DIFFICULTY).toBe(10);
        expect(HIT_AND_RUN_HULL_DAMAGE_PER_DOS).toBe(1);
        expect(HIT_AND_RUN_CRIT_PICKS).toBe(2);
    });
});

describe('ship-hit-and-run — approach', () => {
    it('applies −10 per point of the target Turret Rating', () => {
        const derivation = composeApproachTest({ pilotSkill: 50, target: target(2) });
        expect(derivation.modifiers.map((m) => [m.labelKey, m.value])).toEqual([
            [HIT_AND_RUN_KEYS.approachDifficulty, 0],
            [HIT_AND_RUN_KEYS.turrets, -20],
        ]);
        expect(derivation.target).toBe(30);
    });

    it('omits the turret row for an unturreted target and stacks a situational modifier', () => {
        const derivation = composeApproachTest({ pilotSkill: 50, target: target(0), situational: { value: -30, label: 'Ghost Field' } });
        expect(derivation.modifiers.map((m) => m.labelKey)).toEqual([HIT_AND_RUN_KEYS.approachDifficulty, SITUATIONAL_MODIFIER_KEY]);
        expect(derivation.target).toBe(20);
    });

    it('downs the craft at four degrees of failure, counted like every other test', () => {
        const derivation = composeApproachTest({ pilotSkill: 40, target: target(0) });
        // margin 30 → 4 DoF under the system's degree count; the old resolver said 3.
        expect(isShotDown(resolveShipTest(derivation, 70))).toBe(true);
        expect(isShotDown(resolveShipTest(derivation, 69))).toBe(false);
        expect(isShotDown(resolveShipTest(derivation, 40))).toBe(false);
    });
});

describe('ship-hit-and-run — raid Command', () => {
    it('adds the Ordinary (+10) baseline to each side', () => {
        const derivation = composeRaidCommand(40, { value: 20, label: 'Death-dealers' });
        expect(derivation.modifiers.map((m) => m.value)).toEqual([10, 20]);
        expect(derivation.target).toBe(70);
    });

    it('awards the raider the net degrees as Hull damage', () => {
        const attacker = resolveShipTest(composeRaidCommand(50), 15);
        const defender = resolveShipTest(composeRaidCommand(40), 45);
        const command = resolveHitAndRunCommand(attacker, defender);
        expect(command).toEqual({ success: true, attackerDoS: 5, defenderDoS: 1, netDoS: 4 });
        expect(hitAndRunHullDamage(command)).toBe(4);
    });

    it('resolves a tie for the defender with no damage', () => {
        const attacker = resolveShipTest(composeRaidCommand(40), 50);
        const defender = resolveShipTest(composeRaidCommand(40), 50);
        const command = resolveHitAndRunCommand(attacker, defender);
        expect(command.success).toBe(false);
        expect(hitAndRunHullDamage(command)).toBe(0);
    });
});

describe('ship-hit-and-run — critical pick', () => {
    it('defaults to the harsher (higher) of the two 1d5 results', () => {
        expect(pickWorseCritRoll(2, 5)).toBe(5);
        expect(pickWorseCritRoll(4, 1)).toBe(4);
    });
});
