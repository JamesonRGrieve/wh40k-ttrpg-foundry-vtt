/**
 * Disposition test helpers (core.md §"Disposition", p. 277).
 *
 * Disposition runs −3 (Hostile) through +3 (Helpful). It modifies
 * social-skill tests (Charm / Command / Intimidate / Deceive / Inquiry)
 * by ±10 per step in the direction of the test.
 *
 * The "direction of the test" matters: Charm pushes disposition up,
 * Intimidate pushes it down. The result interpretation depends on the
 * skill — this module just exposes the numeric modifier.
 */

import { nonNegInt } from './_num.ts';

export type DispositionLabel = 'Hostile' | 'Antagonistic' | 'Wary' | 'Neutral' | 'Cooperative' | 'Friendly' | 'Helpful';

export const DISPOSITION_LABELS: ReadonlyArray<DispositionLabel> = ['Hostile', 'Antagonistic', 'Wary', 'Neutral', 'Cooperative', 'Friendly', 'Helpful'];

/** Inclusive bounds of the social-disposition scale (−3 Hostile … +3 Helpful). */
export const DISPOSITION_RANGE = { min: -3, max: 3 } as const;

/**
 * Clamp an arbitrary numeric input to the −3..+3 disposition scale,
 * truncating fractions. Single source of the disposition clamp so the
 * label lookup, the test modifier, and the actor's `adjustDisposition`
 * all share one range definition.
 */
export function clampDisposition(value: number): number {
    return Math.max(DISPOSITION_RANGE.min, Math.min(DISPOSITION_RANGE.max, Math.trunc(value)));
}

/** Map −3..+3 to the canonical label. */
export function labelForDisposition(value: number): DispositionLabel {
    const idx = clampDisposition(value) - DISPOSITION_RANGE.min;
    return DISPOSITION_LABELS[idx] ?? 'Neutral';
}

/**
 * Modifier applied to a social-skill test made against this NPC.
 * Positive disposition makes Charm / Command / Inquiry easier, and
 * Intimidate harder (NPC resists harder when friendly). Reverse for
 * negative disposition.
 *
 * @param disposition NPC's −3..+3 disposition.
 * @param skill which social skill is being attempted.
 */
export function getDispositionModifier(disposition: number, skill: 'charm' | 'command' | 'inquiry' | 'deceive' | 'intimidate'): number {
    const d = clampDisposition(disposition);
    if (skill === 'intimidate') return -d * 10;
    return d * 10;
}

/**
 * Cap on how many interactions can yield disposition gain for a PC.
 *
 * Per DH2 errata p.125, an NPC's affection / disposition can be shifted by
 * social interactions only a number of times equal to the PC's Fellowship
 * bonus. Once the cap is reached, further interactions produce no further
 * disposition gain (though they may still produce role-play consequences
 * and may still feed Influence elsewhere).
 *
 * Fellowship bonus is the tens digit of the Fellowship characteristic and
 * is always non-negative; we clamp to a sensible floor of 0 to avoid
 * negative caps from malformed input.
 */
export function getInteractionCap(fellowshipBonus: number): number {
    return nonNegInt(fellowshipBonus);
}

/** Inputs to the interaction-gated disposition gain resolver. */
export interface InteractionDispositionGainInput {
    /** The acting PC's Fellowship bonus (tens digit of Fellowship). */
    pcFellowshipBonus: number;
    /** How many qualifying interactions this PC has already had with this NPC. */
    interactionsSoFar: number;
    /** The raw disposition shift this interaction would produce before the cap. */
    rawGain: number;
}

/** Result of {@link resolveInteractionDispositionGain}. */
export interface InteractionDispositionGainResult {
    /** Disposition shift actually applied (0 once the cap is reached). */
    gain: number;
    /** True if the cap has been reached and no further gains will be applied. */
    atCap: boolean;
    /** Remaining interactions that can still yield disposition gain (0 once at cap). */
    remainingInteractions: number;
}

/**
 * Resolve the actual disposition gain for a social interaction, gating by
 * the PC's Fellowship-bonus cap (DH2 errata p.125).
 *
 * Below the cap the raw gain passes through unchanged; at or above the cap
 * the gain is suppressed to 0 and `atCap` is set. `remainingInteractions`
 * is the count of cap-relevant interactions still available BEFORE this
 * interaction is recorded, so the caller can decide whether to increment
 * the tally.
 *
 * @param input Fellowship bonus, prior interaction count, and raw gain.
 * @returns Applied gain, cap flag, and remaining interaction count.
 */
export function resolveInteractionDispositionGain(input: InteractionDispositionGainInput): InteractionDispositionGainResult {
    const cap = getInteractionCap(input.pcFellowshipBonus);
    const used = nonNegInt(input.interactionsSoFar);
    const remaining = Math.max(0, cap - used);
    if (remaining <= 0) {
        return { gain: 0, atCap: true, remainingInteractions: 0 };
    }
    return { gain: input.rawGain, atCap: false, remainingInteractions: remaining };
}
