/**
 * Without-supplement novel-mechanic talents — runtime composers (#101).
 *
 * Sister file to `chaos-talents.ts` (Within, #95). The per-talent
 * numeric constants live in `xenos-features.ts`; this module re-exports
 * them under a `WITHOUT_TALENTS` namespace and adds the pure resolver
 * helpers the engine consumer calls during play. Without these
 * resolvers the constants are dead numbers (the "completion theater"
 * call-out in #101). Each helper is deterministic, framework-free, and
 * homologation-safe across all seven game systems — DH2 gating is the
 * caller's responsibility (Without talents are DH2 content but the
 * math is identical when ported to other lines).
 *
 * Talents covered:
 *   1. Field Vivisection   — Medicae replaces WS/BS on Called Shot
 *                            against studied xenos.
 *   2. Hotshot Pilot       — Trade 1 Fatigue for +AgB DoS / -AgB DoF.
 *   3. Hull Down           — Vehicle Size counts as 1 lower during
 *                            Movement actions (attack mods + cover).
 *   4. Leaping Dodge       — Dodge skill replaces Agility for Spray
 *                            avoidance (composes with #103).
 *   5. Push the Limit      — +20 Operate once/round; 4+ DoF triggers a
 *                            motive-systems critical hit.
 */

import { nonNegInt } from './_num.ts';
import { resolveSprayAvoidance, type SprayAvoidanceResult } from './spray-avoidance.ts';
import { FIELD_VIVISECTION, HOTSHOT_PILOT, HULL_DOWN, LEAPING_DODGE, PUSH_THE_LIMIT } from './xenos-features.ts';

/** Without-talent constants regrouped for namespace clarity. */
export const WITHOUT_TALENTS = {
    fieldVivisection: FIELD_VIVISECTION,
    hotshotPilot: HOTSHOT_PILOT,
    hullDown: HULL_DOWN,
    leapingDodge: LEAPING_DODGE,
    pushTheLimit: PUSH_THE_LIMIT,
} as const;

/** Stable identifiers for the five Without novel-mechanic talents. */
export type WithoutTalentId = keyof typeof WITHOUT_TALENTS;

// ---------------------------------------------------------------------------
// 1. Field Vivisection — without.md p. 62 (#101)
// ---------------------------------------------------------------------------

/** Specialisation the character purchased Field Vivisection under. */
export type FieldVivisectionMode = 'melee' | 'ranged';

export interface FieldVivisectionInput {
    /** Which Specialisation the talent was purchased under. */
    mode: FieldVivisectionMode;
    /** True when the attack is a Called Shot (talent only triggers then). */
    isCalledShot: boolean;
    /** True when the target qualifies for the character's Forbidden Lore (Xenos). */
    targetIsStudiedXenos: boolean;
    /** True when the character has Forbidden Lore (Xenos) at the right rank. */
    hasForbiddenLoreXenos: boolean;
    /** Character's full WS or BS total (whichever matches `mode`). */
    weaponSkillTotal: number;
    /** Character's full Medicae skill total. */
    medicaeTotal: number;
}

export interface FieldVivisectionResult {
    /** Which skill the character actually rolls. */
    skill: 'weaponSkill' | 'ballisticSkill' | 'medicae';
    /** Target value the resolver picked. */
    target: number;
    /** True when the swap to Medicae fired (every precondition met). */
    swapped: boolean;
}

/**
 * Resolve which skill total to roll for a Called Shot when the
 * character has Field Vivisection. The talent only fires for Called
 * Shots against targets the character can apply Forbidden Lore (Xenos)
 * to and only on the Specialisation the talent was purchased under.
 * Outside those conditions the resolver returns the raw WS or BS.
 */
export function resolveFieldVivisection(input: FieldVivisectionInput): FieldVivisectionResult {
    const baseSkill = input.mode === 'melee' ? 'weaponSkill' : 'ballisticSkill';
    const fallback: FieldVivisectionResult = {
        skill: baseSkill,
        target: nonNegInt(input.weaponSkillTotal),
        swapped: false,
    };
    if (!input.isCalledShot) return fallback;
    if (!input.targetIsStudiedXenos) return fallback;
    if (FIELD_VIVISECTION.requiresForbiddenLore && !input.hasForbiddenLoreXenos) return fallback;
    return {
        skill: FIELD_VIVISECTION.alternateSkill,
        target: nonNegInt(input.medicaeTotal),
        swapped: true,
    };
}

// ---------------------------------------------------------------------------
// 2. Hotshot Pilot — without.md p. 62 (#101)
// ---------------------------------------------------------------------------

export interface HotshotPilotInput {
    /** Did the Operate / Survival test succeed? */
    success: boolean;
    /** Degrees of success on the test (≥0 when `success === true`). */
    degreesOfSuccess: number;
    /** Degrees of failure on the test (≥0 when `success === false`). */
    degreesOfFailure: number;
    /** Character's Agility bonus (tens digit of Ag, post-modifiers). */
    agilityBonus: number;
    /** Whether the player elected to spend the Fatigue. */
    spendFatigue: boolean;
}

export interface HotshotPilotResult {
    /** Fatigue levels the character takes (0 when the trade is declined). */
    fatigueGained: number;
    /** DoS after the talent applies (success path; 0 on failure). */
    adjustedDegreesOfSuccess: number;
    /** DoF after the talent applies (failure path; clamped to min 1). */
    adjustedDegreesOfFailure: number;
    /** True when the talent actually changed the outcome. */
    applied: boolean;
}

/**
 * Apply Hotshot Pilot's Fatigue-for-degrees trade to an Operate /
 * Survival result. On success the character may add +AgB DoS; on
 * failure they may reduce DoF by AgB (minimum 1). The player has to
 * elect the trade — the resolver returns the unaltered numbers when
 * `spendFatigue` is false or AgB ≤ 0.
 */
export function resolveHotshotPilot(input: HotshotPilotInput): HotshotPilotResult {
    const agB = nonNegInt(input.agilityBonus);
    const baseDos = nonNegInt(input.degreesOfSuccess);
    const baseDof = nonNegInt(input.degreesOfFailure);
    if (!input.spendFatigue || agB <= 0) {
        return {
            fatigueGained: 0,
            adjustedDegreesOfSuccess: baseDos,
            adjustedDegreesOfFailure: baseDof,
            applied: false,
        };
    }
    if (input.success) {
        return {
            fatigueGained: HOTSHOT_PILOT.fatigueCost,
            adjustedDegreesOfSuccess: baseDos + agB,
            adjustedDegreesOfFailure: 0,
            applied: true,
        };
    }
    return {
        fatigueGained: HOTSHOT_PILOT.fatigueCost,
        adjustedDegreesOfSuccess: 0,
        adjustedDegreesOfFailure: Math.max(1, baseDof - agB),
        applied: true,
    };
}

// ---------------------------------------------------------------------------
// 3. Hull Down — without.md p. 62 (#101)
// ---------------------------------------------------------------------------

export interface HullDownInput {
    /** Vehicle / steed's RAW Size trait. */
    baseSize: number;
    /** True when the character is taking a Vehicle action with the Movement subtype. */
    duringMovementAction: boolean;
}

export interface HullDownResult {
    /** Size value the engine should use for attack-modifier and cover math. */
    effectiveSize: number;
    /** True when the talent shaved a tier off. */
    applied: boolean;
}

/**
 * Resolve Hull Down's "Size counts as one lower" rider. Only fires
 * during Vehicle combat actions with the Movement subtype; in any
 * other timing window the base Size is returned untouched. Size never
 * drops below 1 — a Massive frame is still trackable, just narrower.
 */
export function resolveHullDownSize(input: HullDownInput): HullDownResult {
    const base = Math.max(1, Math.trunc(input.baseSize));
    if (!input.duringMovementAction) {
        return { effectiveSize: base, applied: false };
    }
    return {
        effectiveSize: Math.max(1, base - HULL_DOWN.sizeReduction),
        applied: true,
    };
}

// ---------------------------------------------------------------------------
// 4. Leaping Dodge — composes with #103 spray-avoidance (#101)
// ---------------------------------------------------------------------------

export interface LeapingDodgeInput {
    /** True if the target has Leaping Dodge. */
    hasLeapingDodge: boolean;
    /** Target's full Agility characteristic total. */
    agilityTotal: number;
    /** Target's full Dodge skill total. */
    dodgeTotal: number;
}

/**
 * Thin wrapper over {@link resolveSprayAvoidance} — Leaping Dodge is
 * defined entirely as a Spray-avoidance override (LEAPING_DODGE
 * declares `sprayAvoidanceSkill: 'dodge'`). Re-exposing it here keeps
 * "Leaping Dodge resolver" the call-site name in higher layers; the
 * actual math is owned by `spray-avoidance.ts` so the two stay in
 * lockstep.
 */
export function resolveLeapingDodge(input: LeapingDodgeInput): SprayAvoidanceResult {
    return resolveSprayAvoidance({
        hasLeapingDodge: input.hasLeapingDodge,
        agilityTotal: input.agilityTotal,
        dodgeTotal: input.dodgeTotal,
    });
}

// ---------------------------------------------------------------------------
// 5. Push the Limit — without.md p. 62 (#101)
// ---------------------------------------------------------------------------

export interface PushTheLimitInput {
    /** True when the character has Push the Limit and elects to invoke it this round. */
    invoke: boolean;
    /** Has the once-per-round invocation already fired this round? */
    alreadyUsedThisRound: boolean;
    /** Raw Operate / Survival test margin: +DoS on success, +DoF on failure (always ≥0). */
    rawDegrees: number;
    /** Did the (pre-bonus) test succeed? Caller derives by recomputing with the bonus. */
    success: boolean;
    /** True when the mount is a living steed (routes to Leg crit instead of Motive Systems). */
    livingMount: boolean;
}

/** Critical-hit table to roll on when Push the Limit triggers a crit. */
export type PushTheLimitCriticalTable = 'motive-systems' | 'impact-leg';

export interface PushTheLimitResult {
    /** Flat modifier to apply to the Operate / Survival test (+20 when the talent fires). */
    modifier: number;
    /** True when the talent's once-per-round invocation actually applied. */
    invoked: boolean;
    /** True when the failure margin reached the catastrophic threshold (4+ DoF). */
    triggersCritical: boolean;
    /** Critical-hit table the caller rolls on when {@link triggersCritical} is true. */
    criticalTable: PushTheLimitCriticalTable | null;
}

/**
 * Resolve the +20 Operate bonus / catastrophe trigger from Push the
 * Limit. The +20 only applies when the player invokes the talent and
 * the once-per-round cap has not yet been spent. On a failed test by
 * 4+ DoF the talent's downside fires: vehicles roll on the Motive
 * Systems critical table; living mounts roll on the Impact Critical
 * (Leg) table. Both tables are content owned by the compendium —
 * the resolver only reports which table the caller routes to.
 */
export function resolvePushTheLimit(input: PushTheLimitInput): PushTheLimitResult {
    const invoked = input.invoke && !input.alreadyUsedThisRound;
    const modifier = invoked ? PUSH_THE_LIMIT.operateBonus : 0;
    const dof = input.success ? 0 : nonNegInt(input.rawDegrees);
    const triggersCritical = invoked && !input.success && dof >= PUSH_THE_LIMIT.failureThresholdForCritical;
    return {
        modifier,
        invoked,
        triggersCritical,
        criticalTable: triggersCritical ? (input.livingMount ? 'impact-leg' : 'motive-systems') : null,
    };
}
