/**
 * Malefic Daemonology corruption-on-use (beyond.md §"Malefic
 * Daemonology", p. 56).
 *
 * Every successful Malefic power manifestation grants Corruption Points
 * equal to the Psy Rating used (after Push, Fettered, etc. apply).
 * Pushed PR counts; Fettered's half-PR also counts at the halved value.
 *
 * This module exposes the computation; `PsychicActionData` (rolls/action-data.ts)
 * applies it to the psyker after a cast, on lines whose game-system config
 * opts in (`maleficCorruptionOnManifest`).
 */

import { nonNegInt } from './_num.ts';

/**
 * Returns the corruption gained by manifesting a power of `discipline` (the
 * psychic-power schema's discipline choice) at `effectivePR`. Non-Malefic
 * disciplines return 0. Sanctic / Daemonology proper return 0 too — only
 * `'malefic'` triggers the corruption hook per RAW.
 */
export function getMaleficCorruptionCost(discipline: string, effectivePR: number, success: boolean): number {
    if (!success) return 0;
    if (discipline !== 'malefic') return 0;
    const pr = nonNegInt(effectivePR);
    return pr;
}
