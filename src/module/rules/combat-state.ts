/**
 * Shared combat-state predicates (#251).
 *
 * Foundry-free so they can be unit-tested directly; call sites pass `game.combat`.
 * Used to gate combat-only actions (e.g. weapon attacks must happen inside an
 * active encounter the attacker is part of) and reuse the same check the reload
 * manager already performs.
 */

/** Minimal combatant shape — only the linked actor's id is read. */
interface CombatantLike {
    actor?: { id?: string | null } | null;
}

/** Minimal combat-tracker shape these predicates read. */
export interface ActiveCombatLike {
    started?: boolean;
    combatants: Iterable<CombatantLike>;
}

/**
 * True when `combat` is an active (started) encounter that includes the actor as
 * a combatant. False when there is no combat, it hasn't started, or the actor's
 * token isn't in the tracker.
 */
export function isActorInActiveCombat(actorId: string | null | undefined, combat: ActiveCombatLike | null | undefined): boolean {
    if (actorId === null || actorId === undefined || actorId === '') return false;
    if (combat?.started !== true) return false;
    for (const combatant of combat.combatants) {
        if (combatant.actor?.id === actorId) return true;
    }
    return false;
}
