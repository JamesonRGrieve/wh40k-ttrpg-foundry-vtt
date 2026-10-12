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
 *   2. Leaping Dodge       — Dodge skill replaces Agility for Spray
 *                            avoidance (composes with #103).
 *   3. Push the Limit      — +20 Operate once/round; 4+ DoF triggers a
 *                            motive-systems critical hit.
 *
 * Hotshot Pilot and Hull Down have no resolver here: neither had a caller
 * in the roll flow, and their printed rules (a post-roll Fatigue trade on
 * degrees; a Size reduction lasting until the start of the next turn) live
 * on their compendium documents.
 */

import { nonNegInt } from './_num.ts';
import { resolveSprayAvoidance, type SprayAvoidanceResult } from './spray-avoidance.ts';
import { FIELD_VIVISECTION, LEAPING_DODGE, PUSH_THE_LIMIT } from './xenos-features.ts';

/** Without-talent constants regrouped for namespace clarity. */
export const WITHOUT_TALENTS = {
    fieldVivisection: FIELD_VIVISECTION,
    leapingDodge: LEAPING_DODGE,
    pushTheLimit: PUSH_THE_LIMIT,
} as const;

/**
 * Stable identifiers for the Without novel-mechanic talents. Each equals the
 * compendium talent's `system.identifier`, which is how an actor's ownership is
 * read — matched by identifier, never by display name (as `two-weapon-fighting.ts`).
 */
export type WithoutTalentId = keyof typeof WITHOUT_TALENTS;

/** An owned item as the talent lookups read it. */
export interface WithoutTalentItemLike {
    readonly type: string;
    readonly system: { readonly identifier?: string | null | undefined; readonly specialization?: string | null | undefined };
}

/** The actor's owned talent with `identifier`, or undefined. */
export function findWithoutTalent<T extends WithoutTalentItemLike>(items: Iterable<T>, identifier: WithoutTalentId): T | undefined {
    for (const item of items) {
        if (item.type === 'talent' && item.system.identifier === identifier) return item;
    }
    return undefined;
}

/** The Field Vivisection Specialisation a talent row was bought under ('Melee' / 'Ranged'), or null when unset. */
export function fieldVivisectionMode(specialization: string | null | undefined): FieldVivisectionMode | null {
    const value = (specialization ?? '').trim().toLowerCase();
    if (value === 'melee') return 'melee';
    if (value === 'ranged') return 'ranged';
    return null;
}

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
 * The target tag a studied xenos carries: the NPC schema `nature` enum value
 * (`situation-tags.ts` derives it), never a creature name.
 */
export const FIELD_VIVISECTION_TARGET_TAG = 'xenos';

/** The Forbidden Lore specialisation family the talent requires (Xenos–Any). */
const FORBIDDEN_LORE_XENOS = 'xenos';

/** The attacker's skills the Field Vivisection gate reads. */
export interface FieldVivisectionSkills {
    readonly forbiddenLore?:
        | {
              readonly entries?:
                  | readonly { readonly name?: string; readonly specialization?: string; readonly rank?: number; readonly trained?: boolean }[]
                  | undefined;
          }
        | undefined;
    readonly medicae?: { readonly current: number; readonly characteristic: string } | undefined;
}

/** Whether the attacker has a Forbidden Lore (Xenos…) specialisation at Known (rank 1) or better. */
export function hasForbiddenLoreXenos(skills: FieldVivisectionSkills): boolean {
    for (const entry of skills.forbiddenLore?.entries ?? []) {
        const name = (entry.name ?? '') === '' ? entry.specialization ?? '' : entry.name ?? '';
        if (!name.trim().toLowerCase().startsWith(FORBIDDEN_LORE_XENOS)) continue;
        if ((entry.rank ?? 0) >= 1 || entry.trained === true) return true;
    }
    return false;
}

/**
 * Medicae (WS) / Medicae (BS): the attack characteristic plus the Medicae
 * skill's own training offset (its total minus its usual characteristic), so an
 * untrained or advanced Medicae carries over exactly.
 */
export function medicaeAgainstCharacteristic(medicaeTotal: number, medicaeCharacteristicTotal: number, attackCharacteristicTotal: number): number {
    return attackCharacteristicTotal + (medicaeTotal - medicaeCharacteristicTotal);
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
// 2. Leaping Dodge — composes with #103 spray-avoidance (#101)
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

/**
 * The test a defender makes to avoid a Spray attack: Agility, or Dodge when it
 * owns Leaping Dodge (read by talent identifier).
 */
export function sprayAvoidanceTest(items: Iterable<WithoutTalentItemLike>, agilityTotal: number, dodgeTotal: number): SprayAvoidanceResult {
    return resolveLeapingDodge({ hasLeapingDodge: findWithoutTalent(items, 'leapingDodge') !== undefined, agilityTotal, dodgeTotal });
}

// ---------------------------------------------------------------------------
// 3. Push the Limit — without.md p. 62 (#101)
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
