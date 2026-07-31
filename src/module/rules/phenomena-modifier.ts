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

/* -------------------------------------------------------------------- */
/*  Trigger resolution — the single composition point                   */
/* -------------------------------------------------------------------- */

/** Everything the phenomena decision depends on, resolved by the caller. */
export interface PhenomenaTriggerInput extends PhenomenaModifierInput {
    /** The Focus Power roll total (used for the RAW doubles rule and the odd/9 rider). */
    rollTotal: number;
    /** True when the roll total is a repeated digit (11, 22, …) — the RAW base trigger. */
    isDoubles: boolean;
    /** True when the cast used more PR than the psyker's rating. */
    overchannelling: boolean;
    /** Push mode forces a phenomena draw on success (`resolvePsyMode().forcePhenomena`). */
    psyForcePhenomena: boolean;
    /** Push mode's own phenomena-roll modifier (`resolvePsyMode().phenomenaModifier`). */
    psyPhenomenaModifier: number;
    /** The power item's authored `phenomenaModifier` (content, Direction #7). */
    powerPhenomenaModifier: number;
}

export interface PhenomenaTriggerResult {
    /** Whether a Psychic Phenomena draw fires at all. */
    triggered: boolean;
    /** Total modifier applied to the phenomena roll. */
    modifier: number;
    /** Rows to shift the drawn result up the ladder (severity increase). */
    ladderStep: number;
}

/**
 * Decide whether Psychic Phenomena fire, and with what modifier and severity shift.
 *
 * This is the single place the phenomena decision is made, because the inputs were
 * previously scattered and two of them were silently DROPPED:
 *
 *   - `unified-roll-dialog.ts` computes Push's `forcePhenomena` and
 *     `phenomenaModifier` via `resolvePsyMode` and writes them onto the roll data
 *     as `psyForcePhenomena` / `psyPhenomenaModifier` — and nothing ever read them.
 *     Pushing a power therefore had NO phenomena consequence beyond the ordinary
 *     doubles rule: neither the guaranteed draw on success nor the +5-per-push-level
 *     escalation applied.
 *   - `composePhenomenaModifier`'s per-scene Warp-weakness riders had no consumer at
 *     all (this module is its #514 entry).
 *
 * Trigger rules, in RAW precedence:
 *   - overchannelling casts draw on any NON-double (the inverse of the normal rule);
 *   - an ordinary cast draws on doubles;
 *   - Push forces a draw regardless (the caller passes `psyForcePhenomena` only on
 *     a successful cast, which is where RAW scopes it);
 *   - per-scene Warp weakness additionally draws on a 9 or any odd total.
 */
export function resolvePhenomenaTrigger(input: PhenomenaTriggerInput): PhenomenaTriggerResult {
    const composed = composePhenomenaModifier(input);

    const total = Number.isFinite(input.rollTotal) ? Math.trunc(input.rollTotal) : 0;
    const oddOr9 = composed.autoTriggerOnOddOr9 && (total === 9 || Math.abs(total) % 2 === 1);
    const byDegree = input.overchannelling ? !input.isDoubles : input.isDoubles;

    const triggered = byDegree || input.psyForcePhenomena || oddOr9;

    const safe = (value: number): number => (Number.isFinite(value) ? value : 0);
    const modifier = safe(input.powerPhenomenaModifier) + safe(input.psyPhenomenaModifier) + composed.phenomenaModifier;

    return { triggered, modifier, ladderStep: composed.ladderStepIncrement };
}
