/**
 * Pure helper for the "weapon falls apart on an unmodified 00" check.
 *
 * A weapon carrying a quality whose `destroyOnCriticalFail` mechanic is set
 * (Scavenged) is destroyed when its attack roll comes up an unmodified 00 — a
 * d100 `rollTotal` of 100, the worst possible result. This is roll-based (not
 * success-based): 100 is always a failure, so no separate success check is
 * needed. Kept pure and system-agnostic (no Roll/actor graph) so it unit-tests
 * standalone and holds identically across all seven game lines, exactly like
 * `weapon-jam.ts` `shouldJamRoll`.
 *
 * The caller (`rolls/action-data.ts`) resolves `hasDestroyQuality` from the
 * weapon's effective qualities via `getWeaponQualityMechanics(...).destroyOnCriticalFail`
 * — the engine never name-matches the quality in `src/` (Direction #7) — and, on
 * a true result, sets `system.state.broken` (cleared by the Repair action).
 */

import { getWeaponQualityMechanics } from './weapon-quality-payloads.ts';

/**
 * The minimal weapon surface the destroy check reads: its effective / base
 * quality-identifier sets. Kept local (not the richer `QualityItem` in
 * `weapon-quality-effects.ts`) so this module stays a leaf — importing it would
 * close an `action-data.ts ↔ weapon-quality-effects.ts` dependency cycle.
 */
type QualityCarrier = { system?: { effectiveSpecial?: Set<string>; special?: Set<string> } };

/** The unmodified-00 face on a d100 (`Roll#total` of a 1–100 percentile die). */
const UNMODIFIED_00 = 100;

/**
 * Whether this attack roll destroys the weapon.
 * @param opts.rollTotal          The unmodified d100 attack-roll total (1–100).
 * @param opts.hasDestroyQuality  The weapon carries a `destroyOnCriticalFail` quality.
 */
export function shouldDestroyOnCriticalFail(opts: { rollTotal: number; hasDestroyQuality: boolean }): boolean {
    return opts.hasDestroyQuality && opts.rollTotal === UNMODIFIED_00;
}

/**
 * Whether any of the weapon's effective qualities declares the
 * `destroyOnCriticalFail` mechanic (Scavenged). Data-driven — it reads the
 * quality payloads rather than name-matching a quality in `src/` (Direction #7),
 * so ANY future quality carrying the mechanic triggers it. Paired with
 * `shouldDestroyOnCriticalFail` (which gates on the unmodified-00 roll) by the
 * roll resolver (`rolls/action-data.ts`).
 *
 * @param weapon    The weapon item (only its quality sets are read).
 * @param systemId  Active game line, for per-line mechanics resolution.
 * @returns True if a carried quality is destroy-on-crit-fail.
 */
export function weaponDestroysOnCriticalFail(weapon: QualityCarrier | null | undefined, systemId?: string): boolean {
    const quals = weapon?.system?.effectiveSpecial ?? weapon?.system?.special;
    if (!quals) return false;
    for (const id of quals) {
        if (getWeaponQualityMechanics(id, systemId)?.destroyOnCriticalFail === true) return true;
    }
    return false;
}
