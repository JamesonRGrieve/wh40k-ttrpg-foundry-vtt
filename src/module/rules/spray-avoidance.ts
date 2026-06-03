/**
 * Spray quality avoidance pathway (#103 — without.md p.62, composes
 * with the #57 Spray weapon-quality registry entry).
 *
 * Per RAW: targets in a Spray weapon's cone make a Challenging (+0)
 * Agility test to avoid being hit. The Leaping Dodge talent
 * (#101 / xenos-features.ts:LEAPING_DODGE) upgrades the raw
 * Agility test to a Dodge skill test.
 *
 * Pure composer — the engine consumer (chat-card / template-
 * resolution layer for Spray) calls this to know whether to roll
 * Agility (default) or Dodge (with Leaping Dodge talent).
 */

type SprayAvoidanceSkill = 'agility' | 'dodge';

export interface SprayAvoidanceInput {
    /** True if the target has the Leaping Dodge talent. */
    hasLeapingDodge: boolean;
    /** Target's full Agility characteristic total (used when skill = 'agility'). */
    agilityTotal: number;
    /** Target's full Dodge skill total (used when skill = 'dodge'). */
    dodgeTotal: number;
}

export interface SprayAvoidanceResult {
    /** Which skill the target rolls against the Spray attack. */
    skill: SprayAvoidanceSkill;
    /** Target value for the test. */
    target: number;
}

/**
 * Compose the avoidance test for a Spray-quality attack. Returns the
 * Dodge skill total when the target has Leaping Dodge, else the raw
 * Agility total. RAW: Challenging (+0) — no modifier on either.
 */
export function resolveSprayAvoidance(input: SprayAvoidanceInput): SprayAvoidanceResult {
    if (input.hasLeapingDodge) {
        return { skill: 'dodge', target: Math.max(0, Math.trunc(input.dodgeTotal)) };
    }
    return { skill: 'agility', target: Math.max(0, Math.trunc(input.agilityTotal)) };
}
