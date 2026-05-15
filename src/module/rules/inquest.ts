/**
 * Inquests framework (within.md p. 62).
 *
 * An Inquest is a long-running investigation toward a Target. The
 * warband accrues Investigation Points (IP) over sessions; each
 * threshold yields a Revelation. Revelations cap at 1200 IP.
 *
 * Lead Investigator and Requirements are GM-tracked narrative; the
 * engine only manages the IP tally and threshold detection.
 */

export const INQUEST_THRESHOLDS: readonly number[] = [200, 400, 600, 900, 1200];

export interface InquestState {
    /** Inquest target name (cult, NPC, location, …). */
    target: string;
    /** Free-form requirements text (GM-set). */
    requirements: string;
    /** Lead Investigator (actor name / id). */
    leadInvestigator: string;
    /** Investigation Points accrued so far. */
    investigationPoints: number;
}

/**
 * Returns the threshold index the IP tally crossed between old and new.
 * 0 = nothing crossed; 1 = first revelation (200 IP); 5 = last (1200 IP).
 * Useful for emitting a "revelation unlocked" chat card once per crossing.
 */
export function inquestRevelationsCrossed(oldIP: number, newIP: number): number {
    const a = Math.max(0, Math.trunc(oldIP));
    const b = Math.max(0, Math.trunc(newIP));
    if (b <= a) return 0;
    let crossed = 0;
    for (const t of INQUEST_THRESHOLDS) {
        if (a < t && b >= t) crossed += 1;
    }
    return crossed;
}

/** Current revelation tier (0–5) given an IP tally. */
export function getCurrentRevelationTier(ip: number): number {
    const v = Math.max(0, Math.trunc(ip));
    let tier = 0;
    for (const t of INQUEST_THRESHOLDS) {
        if (v >= t) tier += 1;
    }
    return tier;
}
