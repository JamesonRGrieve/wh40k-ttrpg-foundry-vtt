/**
 * Pinning test driver (#111 — core.md L10540-10546).
 *
 * Pinning Test = Challenging (+0) Willpower. Triggered by Suppressing
 * Fire (Hard −20 BS, kill-zone) and by certain heavy ranged hits.
 *
 * Failure → Pinned condition: Half Action only, −20 BS, must move
 * toward / stay in cover. End-of-turn escape = Challenging (+0) WP,
 * +30 if not currently being shot at OR if in cover.
 *
 * This module exposes the pure resolvers. The Suppressing-Fire action
 * trigger, condition-application hook, and end-of-turn auto-escape
 * loop are wired by the engine consumer.
 */

/** Penalty applied to BS while Pinned. */
export const PINNED_BS_PENALTY = -20;

/** Pinned actors are restricted to Half Actions. */
export const PINNED_ACTION_RESTRICTION = 'half-action-only' as const;

/** Bonus on the end-of-turn escape test when the actor is in cover OR not being shot at. */
export const ESCAPE_PINNING_FAVOURABLE_BONUS = 30;

export interface PinningTestInput {
    /** Actor's full Willpower characteristic total. */
    willpowerTotal: number;
    /** Additional modifier from the trigger source (e.g. Fear (X) composition). 0 by default. */
    triggerModifier?: number;
}

/** Compose the WP target for the initial Pinning resist test. */
export function resolvePinningTest(input: PinningTestInput): { target: number } {
    const wp = Math.max(0, Math.trunc(input.willpowerTotal));
    const mod = Number.isFinite(input.triggerModifier) ? Math.trunc(input.triggerModifier ?? 0) : 0;
    return { target: Math.max(0, wp + mod) };
}

export interface EscapePinningInput {
    /** Actor's full Willpower characteristic total. */
    willpowerTotal: number;
    /** True if the actor was not shot at this round. */
    notBeingShotAt: boolean;
    /** True if the actor is in cover. */
    inCover: boolean;
}

/**
 * Compose the WP target for the end-of-turn auto-escape test. RAW
 * grants a +30 bonus if EITHER the actor is in cover OR was not shot
 * at this round (the two conditions don't stack — they share the same
 * favourable bonus).
 */
export function resolveEscapePinningTest(input: EscapePinningInput): { target: number; favourableBonus: boolean } {
    const wp = Math.max(0, Math.trunc(input.willpowerTotal));
    const favourable = input.notBeingShotAt || input.inCover;
    const target = wp + (favourable ? ESCAPE_PINNING_FAVOURABLE_BONUS : 0);
    return { target: Math.max(0, target), favourableBonus: favourable };
}
