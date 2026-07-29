/**
 * @file Delete-safety for reactive background writes to an actor.
 *
 * Several of the system's reactions to a document event are fire-and-forget
 * continuations that write BACK to the actor that triggered them: the default
 * item grant awaits a compendium scan first, talent grants run on a 100 ms
 * timer, the Subtlety adjuster sync runs off the descendant hooks. The actor can
 * be deleted while any of them is still in flight — routine whenever a caller
 * creates an actor and tears it down soon after (a probe, an aborted import, a
 * GM who changed their mind).
 *
 * Foundry rejects such a write with `The Actor <id> does not exist in actors`
 * *and* surfaces it through its own socket layer as a red toast plus a
 * `console.error`. Catching the rejection at the call site therefore does NOT
 * keep it quiet — by then the user has already seen the error. The request must
 * never be dispatched in the first place.
 *
 * Asking `game.actors.get(id)` alone does not close the window either: the
 * client only drops an actor from the collection when the server broadcasts the
 * deletion back, a full socket round-trip after the delete was requested. The
 * `preDeleteActor` hook fires locally on the requesting client BEFORE that
 * dispatch, so recording ids there is what actually closes it.
 */

/**
 * How many recently-deleted ids to remember. The race window is milliseconds,
 * so a small ring is ample; bounding it keeps a long session from accumulating
 * an id for every actor ever deleted.
 */
const RECENT_DELETION_LIMIT = 256;

/** Ids of actors whose deletion has been requested, newest last. */
const recentlyDeletedOrder: string[] = [];
const recentlyDeleted = new Set<string>();

/**
 * Record that an actor's deletion has been requested on this client. Called
 * from the `preDeleteActor` hook, which fires before the delete is dispatched.
 * @param {string | null | undefined} id  The actor id being deleted.
 * @returns {void}
 */
export function noteActorDeleting(id: string | null | undefined): void {
    if (typeof id !== 'string' || id === '') return;
    if (recentlyDeleted.has(id)) return;
    recentlyDeleted.add(id);
    recentlyDeletedOrder.push(id);
    while (recentlyDeletedOrder.length > RECENT_DELETION_LIMIT) {
        const evicted = recentlyDeletedOrder.shift();
        if (evicted !== undefined) recentlyDeleted.delete(evicted);
    }
}

/** The narrow slice of an actor this guard reads. */
export interface LivenessCheckable {
    readonly _id?: string | null | undefined;
    /** True for a synthetic actor owned by an unlinked token. */
    readonly isToken?: boolean | undefined;
    /** Compendium id when the actor lives in a pack rather than the world. */
    readonly pack?: string | null | undefined;
}

/**
 * Whether it is safe to dispatch a document write against this actor.
 *
 * False once the actor's deletion has been requested, and — for a WORLD actor —
 * once it has left `game.actors`. The collection test deliberately does not
 * apply to a token-delta actor or a compendium actor: neither is ever in
 * `game.actors`, so testing them there would report every one of them dead and
 * silently disable the reactive writes this guard exists to protect.
 *
 * When there is no id to check, or no `game.actors` to check against (vitest,
 * headless pack tooling), this reports true so callers behave exactly as they
 * did before the guard existed.
 * @param {LivenessCheckable} actor  The actor about to be written to.
 * @returns {boolean}  False only when the actor is known to be gone or going.
 */
export function isActorWritable(actor: LivenessCheckable): boolean {
    const id = actor._id;
    if (typeof id !== 'string' || id === '') return true;
    if (recentlyDeleted.has(id)) return false;
    if (actor.isToken === true) return true;
    if (typeof actor.pack === 'string' && actor.pack !== '') return true;
    // eslint-disable-next-line no-restricted-syntax -- boundary: `game.actors` is a Foundry global absent under vitest and headless pack tooling
    const actors = (globalThis as unknown as { game?: { actors?: { get?: (id: string) => unknown } } }).game?.actors;
    if (actors?.get === undefined) return true;
    const found = actors.get(id);
    return found !== undefined && found !== null;
}

/** Clear the recorded deletions. Test seam — never called by runtime code. */
export function resetActorLivenessForTesting(): void {
    recentlyDeletedOrder.length = 0;
    recentlyDeleted.clear();
}
