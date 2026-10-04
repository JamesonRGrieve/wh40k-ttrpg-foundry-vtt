/**
 * Target-selection helpers for the unified roll dialog (#393 / #400).
 *
 * The modifiers a target's CONDITIONS impose on its attackers (Prone, Stunned,
 * Unaware, Helpless, …) are not selected here: they are authored on each
 * condition document (`system.targeted` / `system.helplessTarget`) and applied by
 * the Path B collector `rules/targeted-conditions.ts` and the attack resolution.
 * This module keeps the content-agnostic target-list ordering and the homebrew
 * self-target rule.
 */

/* -------------------------------------------------------------------------- */
/*  Target-list disposition ordering + colour (#400)                          */
/* -------------------------------------------------------------------------- */

/** Disposition bucket a target row belongs to, in list order. `self` is the
 *  attacker's own token and always sorts last regardless of its disposition. */
export type TargetDispositionGroup = 'hostile' | 'neutral' | 'friendly' | 'self';

/** Sort order for the target dropdown: hostiles first, self last (#400). */
export const TARGET_GROUP_ORDER: Readonly<Record<TargetDispositionGroup, number>> = {
    hostile: 0,
    neutral: 1,
    friendly: 2,
    self: 3,
};

/** Per-group text colour utility for the dropdown option (red / white / green /
 *  yellow, #400). Literal Tailwind classes so the static scan emits them. */
export const TARGET_GROUP_COLOR_CLASS: Readonly<Record<TargetDispositionGroup, string>> = {
    hostile: 'tw-text-red-400',
    neutral: 'tw-text-white',
    friendly: 'tw-text-green-400',
    self: 'tw-text-yellow-300',
};

/**
 * Classify a combatant target by its token disposition, with the attacker's own
 * token (`isSelf`) overriding to the `self` group. Disposition values follow
 * Foundry's `CONST.TOKEN_DISPOSITIONS` (HOSTILE -1, NEUTRAL 0, FRIENDLY 1);
 * anything else (SECRET, unset) falls back to neutral. Pure.
 */
export function targetDispositionGroup(disposition: number | null | undefined, isSelf: boolean): TargetDispositionGroup {
    if (isSelf) return 'self';
    if (disposition === 1) return 'friendly';
    if (disposition === -1) return 'hostile';
    return 'neutral';
}

/**
 * Whether the homebrew self-target treatment applies (#393): the setting is on
 * AND the chosen target actor is the attacker themselves. When true the dialog
 * skips the enemy-defence situationals and the target-size modifier (they don't
 * apply to oneself); point-blank range still follows from the zero self-distance.
 * Pure — the caller supplies the resolved setting flag and the two actor ids.
 */
export function shouldSkipSelfTargetDefenderMods(homebrewSelfTargeting: boolean, targetActorId: string | null, sourceActorId: string | null): boolean {
    return homebrewSelfTargeting && targetActorId !== null && sourceActorId !== null && targetActorId === sourceActorId;
}
