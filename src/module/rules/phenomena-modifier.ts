/**
 * Psychic Phenomena modifier composer (#137).
 *
 * Two distinct triggers can modify the Phenomena roll path:
 *
 *  1. **Per-scene Warp weakness** (beyond.md L4605) — GM-set per scene.
 *     Riders:
 *       - +10 to the Focus Power test (the warp is easier to channel).
 *       - +1 step on the Phenomena ladder (results are more severe).
 *       - Phenomena auto-trigger on a 9 or any odd result, in addition
 *         to the usual doubles / 9-of-a-kind rules.
 *
 *  2. **Per-actor Tainted Psyker** (within.md p. 58, formerly tracked as
 *     #97 — subsumed into this issue) — applies when the psyker has
 *     gained Corruption Points from a voluntary push.
 *     Rider:
 *       - +5 to the Phenomena roll per CP gained from the push.
 *
 * Both triggers may apply simultaneously; their numeric riders sum and
 * the per-scene "step / auto-trigger" booleans win on OR semantics.
 *
 * This module is pure — no Foundry runtime, no actor I/O. Callers
 * supply the resolved context (scene flag + CP-from-push count) and
 * apply the resulting modifiers to the Phenomena roll path.
 */

export interface PhenomenaModifierInput {
    /** True when the active scene has Warp weakness set. */
    warpWeakness: boolean;
    /** CP gained by the actor from voluntarily pushing (Tainted Psyker). 0 disables. */
    taintedPsykerPushCP: number;
}

export interface PhenomenaModifierResult {
    /** Modifier added to the Focus Power test target. */
    focusModifier: number;
    /** Modifier added to the Phenomena roll. */
    phenomenaModifier: number;
    /** Number of "steps" to shift the Phenomena ladder result upward. */
    ladderStepIncrement: number;
    /** True if Phenomena auto-trigger on a 9 or any odd result. */
    autoTriggerOnOddOr9: boolean;
}

/**
 * Compose the Phenomena-pathway modifiers from the two trigger sources.
 *
 * @param input The resolved per-scene + per-actor flags. Negative or
 *   non-finite CP values are treated as 0.
 */
export function composePhenomenaModifier(input: PhenomenaModifierInput): PhenomenaModifierResult {
    const warpWeakness = Boolean(input.warpWeakness);
    const rawCP = input.taintedPsykerPushCP;
    const cp = Number.isFinite(rawCP) && rawCP > 0 ? Math.trunc(rawCP) : 0;

    return {
        focusModifier: warpWeakness ? 10 : 0,
        phenomenaModifier: cp * 5,
        ladderStepIncrement: warpWeakness ? 1 : 0,
        autoTriggerOnOddOr9: warpWeakness,
    };
}
