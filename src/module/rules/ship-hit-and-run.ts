/**
 * Hit-and-Run Action resolver — Rogue Trader (#188 — core.md L10083 /
 * L10093-10097 §Hit and Run).
 *
 * RAW shape:
 *   1. **Approach Pilot test.** Attacker makes a **Challenging (+0) Pilot
 *      (Space Craft) Test**, modified by the *negative* of the target
 *      ship's Turret Rating (a high turret rating turns the approach
 *      into a death-run). Fail by 4+ DoF → the boarding craft is shot
 *      down; fail by less → forced back to ship with no effect.
 *   2. **Command test.** On the approach success, an opposed
 *      **Ordinary (+10) Command Test** vs. the enemy ship's commander
 *      (also +10 baseline; modifiers from Reinforcements / Tenebro-Maze
 *      / Hidden sally-ports / Death-dealers / Crew Population / Morale
 *      stack on the appropriate side).
 *   3. **Outcome.** Win the Command test → roll 1d5 *twice* on the
 *      Critical Hit chart and **select one to apply**, plus 1 point of
 *      Hull damage per DoS on the Command test. Lose / tie → boarders
 *      retreat with no effect.
 *
 * This module exposes:
 *   - {@link APPROACH_BASE_DIFFICULTY} — +0 (Challenging) per RAW.
 *   - {@link APPROACH_SHOTDOWN_DOF} — 4+ DoF on the approach test downs
 *     the boarding craft.
 *   - {@link COMMAND_BASE_DIFFICULTY} — +10 (Ordinary) per RAW.
 *   - {@link HIT_AND_RUN_HULL_DAMAGE_PER_DOS} — 1 Hull per DoS on the
 *     Command test, ditto.
 *   - {@link HIT_AND_RUN_CRIT_PICKS} — count of crit-chart rolls
 *     (2 by RAW; the attacker picks the worse one to apply).
 *   - {@link computeApproachTarget} — pure helper that applies the
 *     turret-rating penalty to the base Pilot target.
 *   - {@link resolveHitAndRunApproach} — Pilot-side resolver returning
 *     { hit, shotDown, dof }.
 *   - {@link resolveHitAndRunCommand} — opposed-Command resolver that
 *     mirrors {@link ship-boarding} but at the Hit-and-Run baseline.
 *   - {@link pickWorseCritRoll} — utility: of two 1d5 picks, the
 *     attacker picks the result that yields the higher (worse) effect
 *     for the target. Per RAW the attacker chooses; in pure form this
 *     just returns `Math.max(a, b)` — the chart is ordered by
 *     severity so the higher roll is the meaner result.
 *   - {@link resolveHitAndRun} — top-level orchestrator that composes
 *     the three phases into a single payload the chat card can render.
 *
 * Pure module: no RNG, no Foundry. The caller pre-rolls the d100s and
 * the 1d5 × 2 crit picks.
 */

import { degreesOfFailure as degreesOfFailureCore, degreesOfSuccess, resolveOpposed } from './_dice.ts';

/** Re-exported from the shared dice primitives for callers/tests importing it from this module. */
export { degreesOfSuccess };

/** Base Pilot (Space Craft) test difficulty — Challenging (+0). */
export const APPROACH_BASE_DIFFICULTY = 0;

/** 4+ DoF on the approach test downs the boarding craft. */
export const APPROACH_SHOTDOWN_DOF = 4;

/** Base Command-test difficulty — Ordinary (+10). */
export const COMMAND_BASE_DIFFICULTY = 10;

/** 1 Hull damage per DoS on the Command test, per RAW. */
export const HIT_AND_RUN_HULL_DAMAGE_PER_DOS = 1;

/** RAW: roll 1d5 twice on the Critical Hit chart and pick one. */
export const HIT_AND_RUN_CRIT_PICKS = 2;

/**
 * Degrees of Failure for the approach test: floor((roll − target − 1) / 10) + 1
 * on a fail, 0 on a pass — used to detect the "shot down" outcome at 4+ DoF.
 * This counts the margin from the first point *past* the target (a bare fail at
 * target + 1 is 1 DoF), so it uses the shared core's `inclusive: false` mode.
 */
export function degreesOfFailure(roll: number, target: number): number {
    return degreesOfFailureCore(roll, target, { inclusive: false });
}

/**
 * Apply the target ship's Turret Rating as a *penalty* on the attacker's
 * Pilot (Space Craft) target. Negative turret values (unusual but
 * legal) flow through as bonuses; the helper deliberately does not
 * floor or clamp — RAW does not specify either.
 */
export function computeApproachTarget(basePilotSkill: number, targetTurretRating: number): number {
    return basePilotSkill + APPROACH_BASE_DIFFICULTY - targetTurretRating;
}

/** Inputs for the approach Pilot test. */
export interface HitAndRunApproachInput {
    /** Attacker d100 roll (1-100). */
    pilotRoll: number;
    /** Attacker's Pilot (Space Craft) skill total (already includes any +Manoeuvrability bonus the GM allows). */
    pilotSkill: number;
    /** Target ship's Turret Rating (subtracts from the attacker's target). */
    targetTurretRating: number;
}

/** Result of the approach Pilot test. */
export interface HitAndRunApproachResolution {
    /** Composed Pilot target after turret-rating penalty. */
    target: number;
    /** True when the approach test passed. */
    hit: boolean;
    /** True when the failure was by 4+ DoF (craft shot down). */
    shotDown: boolean;
    /** Degrees of Success (0 when test failed). */
    dos: number;
    /** Degrees of Failure (0 when test passed). */
    dof: number;
}

/** Resolve the approach Pilot test. */
export function resolveHitAndRunApproach(input: HitAndRunApproachInput): HitAndRunApproachResolution {
    const target = computeApproachTarget(input.pilotSkill, input.targetTurretRating);
    const hit = input.pilotRoll <= target;
    const dos = hit ? degreesOfSuccess(input.pilotRoll, target) : 0;
    const dof = hit ? 0 : degreesOfFailure(input.pilotRoll, target);
    const shotDown = !hit && dof >= APPROACH_SHOTDOWN_DOF;
    return { target, hit, shotDown, dos, dof };
}

/** Inputs for the opposed Command test phase. */
export interface HitAndRunCommandInput {
    /** Attacker d100 roll (1-100). */
    attackerRoll: number;
    /** Attacker's *composed* Command target (raid commander; +10 baseline already applied externally if the caller prefers, else pass the raw skill and let the resolver add `COMMAND_BASE_DIFFICULTY`). */
    attackerCommandTarget: number;
    /** Defender d100 roll (1-100). */
    defenderRoll: number;
    /** Defender's *composed* Command target (ship commander). */
    defenderCommandTarget: number;
    /**
     * When true, the resolver adds `COMMAND_BASE_DIFFICULTY` (+10) to
     * both `attackerCommandTarget` and `defenderCommandTarget`. Defaults
     * to true so callers passing raw Command skill values get the RAW
     * Ordinary (+10) baseline applied automatically.
     */
    applyOrdinaryBaseline?: boolean;
}

/** Outcome of the opposed Command test. */
export interface HitAndRunCommandResolution {
    /** True when the attacker wins the opposed Command test. */
    success: boolean;
    attackerDoS: number;
    defenderDoS: number;
    /** netDoS = attackerDoS − defenderDoS. */
    netDoS: number;
}

/** Resolve the opposed Command test. Tie goes to defender. */
export function resolveHitAndRunCommand(input: HitAndRunCommandInput): HitAndRunCommandResolution {
    const apply = input.applyOrdinaryBaseline !== false;
    const atkTarget = input.attackerCommandTarget + (apply ? COMMAND_BASE_DIFFICULTY : 0);
    const defTarget = input.defenderCommandTarget + (apply ? COMMAND_BASE_DIFFICULTY : 0);
    // Attacker wins on strictly more DoS (tie → defender); both-fail also
    // routes to the defender, so the boarding craft never breaches.
    const {
        success,
        aDoS: attackerDoS,
        bDoS: defenderDoS,
        netDoS,
    } = resolveOpposed({ roll: input.attackerRoll, target: atkTarget }, { roll: input.defenderRoll, target: defTarget }, { tie: 'b' });
    return { success, attackerDoS, defenderDoS, netDoS };
}

/**
 * Per RAW, the attacker rolls 1d5 on the Critical Hit chart twice and
 * **selects one to apply**. The chart is ordered by severity (1 = lightest
 * effect, 5 = harshest), so a rational attacker picks the higher roll.
 * The helper returns `Math.max(a, b)`; callers who let the attacker pick
 * deliberately (e.g. a player chose the *less* damaging result on purpose)
 * can ignore this and resolve manually.
 */
export function pickWorseCritRoll(a: number, b: number): number {
    return Math.max(a, b);
}

/** Inputs for the orchestrator. */
export interface HitAndRunInput {
    approach: HitAndRunApproachInput;
    command: HitAndRunCommandInput;
    /** First 1d5 crit-chart pick (1-5). */
    rolledCritA: number;
    /** Second 1d5 crit-chart pick (1-5). */
    rolledCritB: number;
}

/** Outcome of a full Hit-and-Run action. */
export interface HitAndRunResolution {
    approach: HitAndRunApproachResolution;
    /** Defined when the approach landed. */
    command: HitAndRunCommandResolution | null;
    /** Defined when the Command test succeeded. */
    appliedCrit: number | null;
    /** Defined when the Command test succeeded — netDoS × 1 Hull. */
    hullDamage: number | null;
}

/**
 * Orchestrate the full Hit-and-Run: approach test → command test → crit
 * pick + hull damage. Each phase short-circuits cleanly so the chat card
 * can render whichever stage the action terminated at.
 */
export function resolveHitAndRun(input: HitAndRunInput): HitAndRunResolution {
    const approach = resolveHitAndRunApproach(input.approach);
    if (!approach.hit) return { approach, command: null, appliedCrit: null, hullDamage: null };
    const command = resolveHitAndRunCommand(input.command);
    if (!command.success) return { approach, command, appliedCrit: null, hullDamage: null };
    const appliedCrit = pickWorseCritRoll(input.rolledCritA, input.rolledCritB);
    const hullDamage = command.netDoS * HIT_AND_RUN_HULL_DAMAGE_PER_DOS;
    return { approach, command, appliedCrit, hullDamage };
}
