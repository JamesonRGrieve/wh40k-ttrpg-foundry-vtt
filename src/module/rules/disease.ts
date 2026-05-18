/**
 * Disease mechanic resolver (#123 — core.md, Disease section).
 *
 * Exposure: Toughness test (target = TB total − disease rating).
 * On failure → infection; each day deals fixed damage until treated.
 * Treatment: Medicae Extended test against the disease's treatment
 * threshold (composes with the Extended Test ladder in #59).
 *
 * This module exposes the pure resolvers. The disease item type (or
 * actor flag), the per-day damage hook, and the Medicae treatment
 * dialog remain follow-up scope for #123.
 */

export interface DiseaseProfile {
    id: string;
    label: string;
    /** Higher = harder Toughness test to resist exposure. */
    rating: number;
    /** Damage applied per day while infected (untreated). */
    damagePerDay: number;
    /** Cumulative Medicae DoS required for treatment to succeed. */
    treatmentThreshold: number;
}

export interface DiseaseExposureInput {
    /** Actor's full Toughness characteristic total. */
    toughnessTotal: number;
    /** Disease's rating (negative modifier on the resist test). */
    diseaseRating: number;
}

/**
 * Compose the exposure-test target. Returns 0 when the rating wipes
 * out the actor's Toughness entirely.
 */
export function resolveDiseaseExposure(input: DiseaseExposureInput): { target: number } {
    const tgh = Math.max(0, Math.trunc(input.toughnessTotal));
    const rating = Math.max(0, Math.trunc(input.diseaseRating));
    return { target: Math.max(0, tgh - rating) };
}

export interface InfectionDailyTick {
    /** Damage applied this day. */
    damage: number;
    /** Cumulative damage to date (including this tick). */
    cumulative: number;
}

/**
 * Compute the next daily damage tick for an active infection. Treated
 * infections (treatmentSucceeded = true) return zero damage and no
 * cumulative increment.
 */
export function applyInfectionDailyTick(opts: { profile: DiseaseProfile; cumulativeSoFar: number; treatmentSucceeded?: boolean }): InfectionDailyTick {
    if (opts.treatmentSucceeded === true) {
        return { damage: 0, cumulative: Math.max(0, Math.trunc(opts.cumulativeSoFar)) };
    }
    const damage = Math.max(0, Math.trunc(opts.profile.damagePerDay));
    const cumulative = Math.max(0, Math.trunc(opts.cumulativeSoFar)) + damage;
    return { damage, cumulative };
}

/**
 * Test whether accumulated Medicae DoS hits the treatment threshold.
 * Returns true on or above the threshold.
 */
export function isTreatmentComplete(profile: DiseaseProfile, accumulatedMedicaeDoS: number): boolean {
    const threshold = Math.max(1, Math.trunc(profile.treatmentThreshold));
    const dos = Math.max(0, Math.trunc(accumulatedMedicaeDoS));
    return dos >= threshold;
}
