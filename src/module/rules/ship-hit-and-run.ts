/**
 * Hit and Run resolver — Rogue Trader (#188 — RT Core p.218 §Hit and Run;
 * turret penalty p.220).
 *
 * RAW shape:
 *   1. **Approach.** The raid leader makes a **Challenging (+0) Pilot (Space
 *      Craft) Test** to reach an enemy ship within 5 VUs in a boarding craft.
 *      Each point of the target's Turret Rating imposes **−10** on it (p.220).
 *      A failure forces the craft back to its ship; failing by **four or more
 *      degrees** gets it shot down.
 *   2. **Raid.** On a successful approach the leader makes an opposed
 *      **Ordinary (+10) Command Test** against the commander of the enemy
 *      ship's troops. Ties go to the defender.
 *   3. **Outcome.** A win rolls 1d5 on the Critical Hit chart **twice** and the
 *      raider selects one result to apply, plus 1 Hull Integrity damage per
 *      degree of success. A loss sends the raiders back with no effect.
 *
 * "Per degree of success" is read as the margin the raider won the opposed
 * test by (net degrees), as before.
 *
 * Pure module: no RNG, no Foundry. The caller rolls the dice.
 */

import { resolveOpposedByDoS } from './_dice.ts';
import {
    deriveTarget,
    PILOT_SKILL_KEY,
    situationalComponents,
    type ShipAssaultShip,
    type ShipTestDerivation,
    type ShipTestResult,
    type SituationalModifier,
} from './ship-assault.ts';

/** Approach Pilot (Space Craft) difficulty — Challenging (+0). */
export const APPROACH_BASE_DIFFICULTY = 0;

/** Penalty to the approach test per point of the target's Turret Rating (p.220). */
export const APPROACH_TURRET_PENALTY_PER_POINT = -10;

/** Failing the approach by this many degrees or more downs the boarding craft. */
export const APPROACH_SHOTDOWN_DOF = 4;

/** Raid Command difficulty — Ordinary (+10), for both sides. */
export const COMMAND_BASE_DIFFICULTY = 10;

/** Hull Integrity damage per degree the raider wins by. */
export const HIT_AND_RUN_HULL_DAMAGE_PER_DOS = 1;

/** RAW: roll 1d5 on the Critical Hit chart twice and select one. */
export const HIT_AND_RUN_CRIT_PICKS = 2;

/** Langpack keys for the Hit and Run components. */
export const HIT_AND_RUN_KEYS = {
    approachDifficulty: 'WH40K.Voidcraft.HitAndRun.Component.ApproachDifficulty',
    turrets: 'WH40K.Voidcraft.HitAndRun.Component.Turrets',
    commandSkill: 'WH40K.Voidcraft.HitAndRun.Component.CommandSkill',
    commandDifficulty: 'WH40K.Voidcraft.HitAndRun.Component.CommandDifficulty',
} as const;

/** Inputs to the approach Pilot (Space Craft) Test. */
export interface HitAndRunApproachInput {
    readonly pilotSkill: number;
    /** The ship being raided — its Turret Rating penalises the approach. */
    readonly target: ShipAssaultShip;
    readonly situational?: SituationalModifier;
}

/** Compose the approach test: Challenging (+0) − 10 per target Turret Rating point. */
export function composeApproachTest(input: HitAndRunApproachInput): ShipTestDerivation {
    const turret = input.target.turretRating * APPROACH_TURRET_PENALTY_PER_POINT;
    return deriveTarget({ labelKey: PILOT_SKILL_KEY, value: input.pilotSkill }, [
        { labelKey: HIT_AND_RUN_KEYS.approachDifficulty, value: APPROACH_BASE_DIFFICULTY },
        ...(turret === 0 ? [] : [{ labelKey: HIT_AND_RUN_KEYS.turrets, value: turret, data: { ship: input.target.name, rating: input.target.turretRating } }]),
        ...situationalComponents(input.situational),
    ]);
}

/** True when a failed approach failed by enough degrees to down the craft. */
export function isShotDown(approach: ShipTestResult): boolean {
    return !approach.success && approach.dof >= APPROACH_SHOTDOWN_DOF;
}

/** Compose one side's raid Command test: skill + Ordinary (+10) + situational. */
export function composeRaidCommand(commandSkill: number, situational?: SituationalModifier): ShipTestDerivation {
    return deriveTarget({ labelKey: HIT_AND_RUN_KEYS.commandSkill, value: commandSkill }, [
        { labelKey: HIT_AND_RUN_KEYS.commandDifficulty, value: COMMAND_BASE_DIFFICULTY },
        ...situationalComponents(situational),
    ]);
}

/** Outcome of the opposed raid Command test. */
export interface HitAndRunCommandResolution {
    /** True when the raider wins. Ties go to the defender. */
    readonly success: boolean;
    readonly attackerDoS: number;
    readonly defenderDoS: number;
    /** attackerDoS − defenderDoS. */
    readonly netDoS: number;
}

/** Resolve the opposed raid Command test from both rolled tests. */
export function resolveHitAndRunCommand(attacker: ShipTestResult, defender: ShipTestResult): HitAndRunCommandResolution {
    const { success, aDoS, bDoS, netDoS } = resolveOpposedByDoS(
        { roll: attacker.roll, target: attacker.target },
        { roll: defender.roll, target: defender.target },
        { tie: 'b' },
    );
    return { success, attackerDoS: aDoS, defenderDoS: bDoS, netDoS };
}

/**
 * The default of the two 1d5 Critical Hit picks: the chart is ordered by
 * severity, so the higher roll is the harsher result. The raider may still
 * choose the other one.
 */
export function pickWorseCritRoll(a: number, b: number): number {
    return Math.max(a, b);
}

/** Hull Integrity damage for a successful raid. */
export function hitAndRunHullDamage(command: HitAndRunCommandResolution): number {
    return command.success ? command.netDoS * HIT_AND_RUN_HULL_DAMAGE_PER_DOS : 0;
}
