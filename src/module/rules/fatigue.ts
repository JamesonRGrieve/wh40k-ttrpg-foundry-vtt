/**
 * Fatigue system (#114 — core.md L10660-10698, errata L113).
 *
 * Fatigue Threshold = Toughness bonus + Willpower bonus (errata
 * clarification; supersedes the earlier "TB only" reading).
 *
 * Per-level effect:
 *   - Each fatigue level halves all characteristics whose bonus is
 *     lower than the current fatigue count (structured time), or
 *     doubles task time (narrative time).
 *
 * Threshold crossings:
 *   - Fatigue > threshold → Unconscious for (10 − TB) minutes.
 *   - Fatigue > 2 × threshold → death (errata L113).
 *
 * Recovery: 1 level per hour of rest; 6 hours removes all.
 *
 * Pure helpers — schema field exists on `creature.ts:fatigue`; the
 * applyFatigue method on base-actor handles persistence. This module
 * exposes the threshold math + status predicates.
 */

export interface FatigueThresholdInput {
    /** Actor's Toughness bonus (tens digit). */
    toughnessBonus: number;
    /** Actor's Willpower bonus (tens digit). */
    willpowerBonus: number;
}

/** RAW (errata L113): Fatigue Threshold = TB + WPB. */
export function getFatigueThreshold(input: FatigueThresholdInput): number {
    const tb = Math.max(0, Math.trunc(input.toughnessBonus));
    const wpb = Math.max(0, Math.trunc(input.willpowerBonus));
    return tb + wpb;
}

export interface FatigueStateInput {
    /** Current fatigue level. */
    fatigueLevel: number;
    /** Actor's Toughness bonus. */
    toughnessBonus: number;
    /** Actor's Willpower bonus. */
    willpowerBonus: number;
}

/**
 * Whether the actor is at or past the threshold → Unconscious for
 * (10 − TB) minutes per RAW.
 */
export function isFatigueUnconscious(input: FatigueStateInput): boolean {
    const level = Math.max(0, Math.trunc(input.fatigueLevel));
    const threshold = getFatigueThreshold(input);
    return level > threshold;
}

/**
 * Whether the actor has hit 2× threshold → death (errata L113).
 */
export function isFatigueDeath(input: FatigueStateInput): boolean {
    const level = Math.max(0, Math.trunc(input.fatigueLevel));
    const threshold = getFatigueThreshold(input);
    return level > threshold * 2;
}

/**
 * Unconsciousness duration in minutes per the Fatigue rules:
 * 10 − Toughness bonus, floored at 1 minute.
 */
export function getFatigueUnconsciousMinutes(toughnessBonus: number): number {
    const tb = Math.max(0, Math.trunc(toughnessBonus));
    return Math.max(1, 10 - tb);
}

/**
 * Whether a particular characteristic is halved by the current fatigue
 * level. RAW: a characteristic whose BONUS is lower than the fatigue
 * count is halved (in structured time).
 *
 * Example: fatigue level 4, characteristic bonus 3 → halved.
 *          fatigue level 4, characteristic bonus 4 → NOT halved.
 *          fatigue level 4, characteristic bonus 5 → NOT halved.
 */
export function isCharacteristicHalvedByFatigue(characteristicBonus: number, fatigueLevel: number): boolean {
    const bonus = Math.max(0, Math.trunc(characteristicBonus));
    const level = Math.max(0, Math.trunc(fatigueLevel));
    if (level === 0) return false;
    return bonus < level;
}

/**
 * Recovery: how many fatigue levels are removed after a given number of
 * hours of rest. 1 level per hour, capped at 6 (which removes any
 * remaining level — RAW: "6 hours removes all").
 */
export function getFatigueRecoveredAfterRest(hoursOfRest: number): number {
    const hours = Math.max(0, Math.trunc(Number.isFinite(hoursOfRest) ? hoursOfRest : 0));
    return Math.min(6, hours);
}
