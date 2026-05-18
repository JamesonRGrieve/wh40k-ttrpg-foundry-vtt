/**
 * Pure helpers for the DH2 weapon-jam threshold check.
 *
 * core.md §"Weapon Jams" (p. 224) — standard ranged attack jams on
 * 96–100; semi/full-auto and Suppressing Fire on 94–100. Quality
 * overrides:
 *   - Reliable (core.md L6309): jams only on an unmodified 100.
 *   - Unreliable (core.md L6369): jams on a roll of 91 or higher
 *     "even if fired on Semi- or Full Auto" — i.e. the floor drops
 *     to 91 regardless of success/failure. The double-Unreliable
 *     case (Poor craftsmanship + Unreliable: jam on any failure
 *     per L6063) is NOT this helper's concern — see the dedicated
 *     branch in `rolls/action-data.ts` (around line 244).
 *
 * Craftsmanship "best" elides the jam (the existing
 * `bestNeverJamsOrOverheats` branch in `action-data.ts` handles that
 * special case).
 */

const BURST_ACTIONS: ReadonlySet<string> = new Set([
    'Semi-Auto Burst',
    'Full Auto Burst',
    'Suppressing Fire - Semi',
    'Suppressing Fire - Full',
    'Swift Attack',
    'Lightning Attack',
]);

/** Floor (inclusive) at or above which an Unreliable weapon jams. */
const UNRELIABLE_JAM_FLOOR = 91;

/** Floor (inclusive) at or above which a standard ranged attack jams. */
export function getJamFloor(action: string): number {
    return BURST_ACTIONS.has(action) ? 94 : 96;
}

/**
 * Check whether a ranged-attack roll should jam given weapon qualities.
 *
 * The `success` field is consumed by the caller (`action-data.ts`) for
 * its Poor + Unreliable stacking branch but is currently unused inside
 * this helper — RAW jam thresholds are roll-based, not success-based.
 */
export function shouldJamRoll(opts: { action: string; rollTotal: number; success: boolean; hasReliable: boolean; hasUnreliable: boolean }): boolean {
    if (opts.hasReliable) return opts.rollTotal === 100;
    if (opts.hasUnreliable) return opts.rollTotal >= UNRELIABLE_JAM_FLOOR;
    return opts.rollTotal >= getJamFloor(opts.action);
}
