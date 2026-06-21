/**
 * Poison mechanic resolver (#124 — core.md, Poison section).
 *
 * On exposure: Toughness test (target = TB total − poison rating). On
 * failure → damage + the poison's ongoing effect tag (Crippled,
 * Helpless, characteristic damage tracked elsewhere etc.). Composes
 * with the Toxic weapon-quality handler from #57 — Toxic emits an
 * exposure-context which calls `resolvePoisonExposure` to compute the
 * target and the failure-tag payload.
 *
 * This module exposes the pure resolvers. Per-poison ongoing-effect
 * application (Active Effect grants, characteristic-damage hooks)
 * remains the caller's responsibility.
 */

import { nonNegInt } from './_num.ts';

export type PoisonOngoingTag = 'crippled' | 'helpless' | 'prone' | 'characteristic-damage' | 'none';

export interface PoisonProfile {
    id: string;
    label: string;
    /** Higher = harder Toughness test to resist. */
    rating: number;
    /** Immediate damage on a failed exposure (untyped — caller chooses damage type). */
    failureDamage: number;
    /** Per-round damage applied while the poison persists. 0 means single-event. */
    ongoingDamagePerRound: number;
    /** Duration of the ongoing effect in rounds (0 = persists until cleansed). */
    ongoingDurationRounds: number;
    /** Tag for the secondary condition the engine consumer applies. */
    ongoingTag: PoisonOngoingTag;
}

export interface PoisonExposureInput {
    /** Actor's full Toughness characteristic total. */
    toughnessTotal: number;
    /** Poison's rating (negative modifier on the resist test). */
    poisonRating: number;
}

/** Target Toughness for the resist test; floored at 0. */
export function resolvePoisonExposure(input: PoisonExposureInput): { target: number } {
    const tgh = nonNegInt(input.toughnessTotal);
    const rating = nonNegInt(input.poisonRating);
    return { target: Math.max(0, tgh - rating) };
}

export interface PoisonFailurePayload {
    /** Immediate damage to apply at exposure. */
    immediateDamage: number;
    /** Per-round damage tick while the ongoing tag is active. */
    ongoingDamagePerRound: number;
    /** Rounds the ongoing effect lasts; 0 = persists until cleansed. */
    ongoingDurationRounds: number;
    /** Tag the engine consumer applies (Crippled, Helpless, etc.). */
    ongoingTag: PoisonOngoingTag;
}

/** Compose the full failure payload for a failed exposure test. */
export function buildPoisonFailurePayload(profile: PoisonProfile): PoisonFailurePayload {
    return {
        immediateDamage: nonNegInt(profile.failureDamage),
        ongoingDamagePerRound: nonNegInt(profile.ongoingDamagePerRound),
        ongoingDurationRounds: nonNegInt(profile.ongoingDurationRounds),
        ongoingTag: profile.ongoingTag,
    };
}
