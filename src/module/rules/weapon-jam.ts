/**
 * Pure helpers for the DH2 weapon-jam threshold check.
 *
 * core.md §"Weapon Jams" (p. 224) — standard ranged attack jams on
 * 96–100; semi/full-auto and Suppressing Fire on 94–100; Reliable only
 * on natural 100; Unreliable on any failed roll. Craftsmanship "best"
 * elides the jam (the existing `bestNeverJamsOrOverheats` branch in
 * `action-data.ts` handles that special-case).
 */

const BURST_ACTIONS: ReadonlySet<string> = new Set([
    'Semi-Auto Burst',
    'Full Auto Burst',
    'Suppressing Fire - Semi',
    'Suppressing Fire - Full',
    'Swift Attack',
    'Lightning Attack',
]);

/** Floor (inclusive) at or above which a standard ranged attack jams. */
export function getJamFloor(action: string): number {
    return BURST_ACTIONS.has(action) ? 94 : 96;
}

/** Check whether a ranged-attack roll should jam given weapon qualities. */
export function shouldJamRoll(opts: { action: string; rollTotal: number; success: boolean; hasReliable: boolean; hasUnreliable: boolean }): boolean {
    if (opts.hasUnreliable && !opts.success) return true;
    if (opts.hasReliable) return opts.rollTotal === 100;
    return opts.rollTotal >= getJamFloor(opts.action);
}
