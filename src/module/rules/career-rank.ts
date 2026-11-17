/**
 * A character's career rank from its experience (operator ruling 2026-11-16): the
 * highest rank whose printed starting XP its total XP has reached. Branched ranks
 * (a Guardsman's Assault Veteran, Lieutenant and Scout at rank 6) share a rank
 * number and starting XP, so the path does not change the rank.
 *
 * Pure: no Foundry, no content. Null when the table prints no starting XP at all,
 * so the caller can fall back to a stored rank.
 */

/** One rank entry as the career tables carry it. */
export interface RankThreshold {
    rank: number;
    minXp?: number | null;
}

/** The rank a total XP reaches on `ranks`, or null when no rank prints a starting XP. */
export function rankForExperience(ranks: readonly RankThreshold[], totalXp: number): number | null {
    const priced = ranks.filter((entry): entry is RankThreshold & { minXp: number } => typeof entry.minXp === 'number');
    if (priced.length === 0) return null;
    const reached = priced.filter((entry) => entry.minXp <= totalXp).map((entry) => entry.rank);
    return reached.length === 0 ? 1 : Math.max(...reached);
}

/** Whether a stored value is a rank: a whole number of at least 1. */
// eslint-disable-next-line no-restricted-syntax -- boundary: a type guard over a stored actor field the config reads untyped
export function isStoredRank(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
