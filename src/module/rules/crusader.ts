/**
 * Crusader role mechanics (#141 — beyond.md p.34, L807-841).
 *
 * The Crusader is a Beyond-supplement role granting two interlocking
 * benefits under a single "Smite the Unholy" rider:
 *
 *   1. **Fate-spend auto-pass against Fear.** In addition to the
 *      normal uses of Fate points (core p.293), a Crusader may spend
 *      a Fate point to automatically pass a Fear test with a number
 *      of Degrees of Success equal to his Willpower Bonus.
 *
 *   2. **Anti-Fear melee bonus.** Whenever the Crusader inflicts a
 *      melee hit against a target with the Fear (X) trait, he deals
 *      X additional damage AND counts the weapon's penetration as
 *      being X higher.
 *
 * This module exposes pure helpers for both halves. Runtime wiring:
 *   - The Fate-spend is surfaced as a player-facing action button
 *     (`smiteTheUnholy` data-action) on the character sheet status
 *     panel via `crusader-button.hbs`. The handler decrements Fate,
 *     emits a chat card declaring the auto-pass with DoS = WPB, and
 *     leaves the actual Fear test resolution to the GM (auto-pass is
 *     not a tested roll).
 *   - The melee bonus piggy-backs the damage pipeline. Callers that
 *     resolve a melee hit against a Fear(X) target invoke
 *     {@link applySmiteTheUnholyBonus} with the base damage/pen and
 *     the target's Fear rating to produce the adjusted tuple.
 *
 * Role aptitudes / talent grant ("Bodyguard or Deny the Witch") and
 * role-bonus aptitude data live in the compendium / origin-path
 * documents per Direction #7 — this module only encodes the runtime
 * deltas the rules pipeline needs that are not expressible as plain
 * aptitude / talent grants.
 */

import { MAX_FEAR_RATING } from './fear.ts';

/* -------------------------------------------- */
/*  Smite the Unholy — Fate-spend auto-pass     */
/* -------------------------------------------- */

/**
 * Cost in Fate points for one Smite-the-Unholy auto-pass invocation.
 * RAW: one Fate point per spend (beyond.md p.34 L839).
 */
export const SMITE_THE_UNHOLY_FATE_COST = 1;

/**
 * Resolve the Degrees of Success granted by a Smite-the-Unholy
 * Fate-spend auto-pass.
 *
 * RAW: DoS = Willpower Bonus. The Bonus is the tens-digit of the
 * characteristic total (e.g., WP 47 → WPB 4). Floors at 0 so a
 * pathological 0-WP actor still produces a defined non-negative
 * result; auto-pass with 0 DoS still counts as a pass (it succeeds
 * by exactly one DoS — the threshold for a passed test — but the
 * helper returns the RAW value so the caller can decide whether to
 * clamp to 1 for chat-card display).
 */
export function resolveSmiteTheUnholyDoS(willpowerTotal: number): number {
    const wp = Math.max(0, Math.trunc(Number.isFinite(willpowerTotal) ? willpowerTotal : 0));
    return Math.floor(wp / 10);
}

/* -------------------------------------------- */
/*  Smite the Unholy — anti-Fear melee bonus    */
/* -------------------------------------------- */

/** Input tuple for an anti-Fear melee hit before the Crusader rider applies. */
export interface SmiteMeleeHitInput {
    /** Base damage of the inflicted melee hit, post-roll, pre-Crusader. */
    baseDamage: number;
    /** Base penetration of the weapon used for the hit. */
    basePenetration: number;
    /** Target's Fear (X) rating, 0 if the target has no Fear trait. */
    targetFearRating: number;
}

/** Output tuple after the Smite-the-Unholy rider applies. */
export interface SmiteMeleeHitResult {
    /** Damage after +X (where X = Fear rating). */
    damage: number;
    /** Penetration after +X (where X = Fear rating). */
    penetration: number;
    /** Magnitude of the bonus applied (== clamped Fear rating). 0 when no-op. */
    bonusApplied: number;
    /** True when the rider did not apply (target has no Fear trait). */
    isNoOp: boolean;
}

/**
 * Apply the Smite-the-Unholy melee rider to a single hit.
 *
 * Per RAW (beyond.md p.34 L839): "whenever he inflicts a hit with a
 * melee attack against a target with the Fear (X) trait, he inflicts
 * X additional damage and counts his weapon's penetration as being
 * X higher."
 *
 * Targets without Fear (rating 0) are a no-op — base values pass
 * through unchanged. The Fear rating is clamped to [0, MAX_FEAR_RATING]
 * to mirror {@link resolveFearTest} and prevent a malformed trait
 * value from producing absurd damage spikes. Damage and penetration
 * are floored at 0 in case a negative base value sneaks through; the
 * rider itself only ever adds, never subtracts.
 */
export function applySmiteTheUnholyBonus(input: SmiteMeleeHitInput): SmiteMeleeHitResult {
    const rating = Math.max(
        0,
        Math.min(MAX_FEAR_RATING, Math.trunc(Number.isFinite(input.targetFearRating) ? input.targetFearRating : 0)),
    );
    const baseDamage = Math.max(0, Math.trunc(Number.isFinite(input.baseDamage) ? input.baseDamage : 0));
    const basePenetration = Math.max(
        0,
        Math.trunc(Number.isFinite(input.basePenetration) ? input.basePenetration : 0),
    );
    if (rating === 0) {
        return { damage: baseDamage, penetration: basePenetration, bonusApplied: 0, isNoOp: true };
    }
    return {
        damage: baseDamage + rating,
        penetration: basePenetration + rating,
        bonusApplied: rating,
        isNoOp: false,
    };
}

/* -------------------------------------------- */
/*  Role-detection helper                       */
/* -------------------------------------------- */

/**
 * Minimal shape of the actor `items` collection entries this helper
 * consumes. Defined here (rather than imported from a Foundry shape)
 * so the helper is unit-testable against plain mock objects.
 */
export interface CrusaderRoleProbeItem {
    name?: string | null;
}

/**
 * Detect whether an actor has the Crusader role / Smite-the-Unholy
 * rider available, by scanning their owned items for a name match.
 *
 * Name-based (rather than UUID-based) to mirror the existing Fanatic
 * (#93) and Penitent (#94) role-detection in `character-sheet.ts`
 * `_prepareContext`. This pattern works for hand-authored / dropped-in
 * role talents in addition to compendium-sourced items. Case-insensitive.
 *
 * Recognised names (any substring match):
 *   - "Crusader" (the role talent itself)
 *   - "Smite the Unholy" (the role-bonus rider)
 */
export function hasCrusaderRole(items: ReadonlyArray<CrusaderRoleProbeItem>): boolean {
    return items.some((item) => {
        const itemName = (item.name ?? '').toLowerCase();
        return itemName.includes('crusader') || itemName.includes('smite the unholy');
    });
}
