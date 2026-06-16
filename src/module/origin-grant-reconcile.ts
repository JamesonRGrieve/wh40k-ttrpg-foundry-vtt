import { SYSTEM_ID } from './constants.ts';
import type { WH40KItem } from './documents/item.ts';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

/**
 * Boot-time origin-grant reconciliation.
 *
 * A GM-only, setting-gated pass run on every world `ready` (sibling to the
 * in-memory inventory hydration in `compendium-hydrate.ts`). For each world actor
 * it re-applies every embedded origin-path item through the now-idempotent
 * {@link WH40KItem.applyOriginToActor}. Because that applier reconciles
 * characteristic/wounds/fate contributions against a recorded per-origin delta
 * (no double-counting) and treats skills/talents/self as skip-if-exists, the
 * pass is safe to run on every boot: it converges to the same state and
 * self-heals missing trained-skill grants without re-running character creation.
 */

/* eslint-disable no-restricted-syntax -- boundary: Foundry actor/item collections carry open-ended shapes at the framework boundary */
type ReconcileItemLike = WH40KItem & {
    isOriginPath: boolean;
    applyOriginToActor: (actor: unknown, options?: { silent?: boolean }) => Promise<void>;
};

type ReconcileActorLike = {
    name: string | null;
    items: { contents: ReconcileItemLike[] };
};
/* eslint-enable no-restricted-syntax */

/**
 * Re-apply every embedded origin path on every world actor idempotently.
 * GM-only, gated by the `reconcileOriginGrantsOnReady` setting.
 */
export async function reconcileWorldOriginGrants(): Promise<void> {
    if (!game.user.isGM) return;
    const enabled = game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.reconcileOriginGrantsOnReady) as boolean | undefined;
    if (enabled === false) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: game.actors.contents is typed loosely; we narrow to the surface we touch
    const actors = game.actors.contents as unknown as ReconcileActorLike[];
    let actorsTouched = 0;
    let originsReconciled = 0;

    for (const actor of actors) {
        const origins = actor.items.contents.filter((i) => i.isOriginPath);
        if (origins.length === 0) continue;

        let touchedThisActor = false;
        for (const origin of origins) {
            try {
                // eslint-disable-next-line no-await-in-loop -- sequential by design: each apply reads/writes the same actor's flags + resources; concurrent applies would race the delta record
                await origin.applyOriginToActor(actor, { silent: true });
                originsReconciled += 1;
                touchedThisActor = true;
            } catch (err) {
                // One malformed origin must not abort the whole pass.
                console.warn(`[wh40k-rpg] origin-grant reconcile: failed to reconcile origin "${origin.name}" on actor "${actor.name}"; skipping.`, err);
            }
        }
        if (touchedThisActor) actorsTouched += 1;
    }

    if (originsReconciled > 0) {
        // eslint-disable-next-line no-console
        console.log(`[wh40k-rpg] origin-grant reconcile: ${originsReconciled} origin(s) reconciled across ${actorsTouched} actor(s)`);
    }
}
