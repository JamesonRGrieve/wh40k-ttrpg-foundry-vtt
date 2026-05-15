/**
 * Malefic Daemonology corruption-on-use (beyond.md §"Malefic
 * Daemonology", p. 56).
 *
 * Every successful Malefic power manifestation grants Corruption Points
 * equal to the Psy Rating used (after Push, Fettered, etc. apply).
 * Pushed PR counts; Fettered's half-PR also counts at the halved value.
 *
 * This module exposes the computation; the actor-update hook that
 * reads it and calls `applyCorruption()` is wired by the focus-power
 * resolver in a follow-up.
 */

export type PsyDiscipline = 'biomancy' | 'divination' | 'pyromancy' | 'telekinesis' | 'telepathy' | 'malefic' | 'sanctic' | 'daemonology' | 'minor';

/**
 * Returns the corruption gained by manifesting `power` at `effectivePR`.
 * Non-Malefic disciplines return 0. Sanctic / Daemonology proper return
 * 0 too — only `'malefic'` triggers the corruption hook per RAW.
 */
export function getMaleficCorruptionCost(discipline: PsyDiscipline, effectivePR: number, success: boolean): number {
    if (!success) return 0;
    if (discipline !== 'malefic') return 0;
    const pr = Math.max(0, Math.trunc(effectivePR));
    return pr;
}
