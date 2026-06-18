/**
 * Talent grant lifecycle — thin bridge from the base-actor descendant hooks to the
 * unified GrantsManager engine (#304).
 *
 * GrantsManager (`managers/grants-manager.ts` + `data/grant/*`) is the single grant
 * engine; the former GrantsProcessor was removed. On drop we apply the talent's
 * grants idempotently (so re-adding the same talent does not double-grant); on
 * delete we reverse exactly what that talent applied, keyed by the same source key.
 *
 * GrantsManager is loaded via dynamic import inside each function — base-actor.ts
 * statically imports this module, and GrantsManager transitively evaluates the grant
 * DataModels (`extends foundry.abstract.DataModel`) at module-load. Deferring the
 * import to call time (when Foundry is live) keeps the actor import chain free of
 * that eval, exactly as the former GrantsProcessor bridge did.
 */

import type { WH40KBaseActorDocument, WH40KItemDocument } from '../types/global.d.ts';

/**
 * Apply grants from a newly added talent (auto-creates granted items, applies skill
 * training, etc.) via GrantsManager. Idempotent per talent source key.
 *
 * @param talent - The talent item that was added
 * @param actor - The actor receiving the talent
 * @param depth - Current recursion depth (suppresses nested notifications)
 */
export async function processTalentGrants(talent: WH40KItemDocument, actor: WH40KBaseActorDocument, depth = 0): Promise<void> {
    if (talent.type !== 'talent') return;
    if (talent.system.hasGrants !== true) return;

    const { GrantsManager } = await import('../managers/grants-manager.ts');
    await GrantsManager.applyItemGrants(talent, actor, {
        showNotification: depth === 0,
        depth,
    });
}

/**
 * Reverse the grants a talent applied when it is removed from an actor, keyed by the
 * same source key GrantsManager applied them under (deletes granted items, reverts
 * skill upgrades, restores resource bonuses) and clears the applied-grants flag entry.
 *
 * @param talent - The talent being removed
 * @param actor - The actor losing the talent
 */
export async function handleTalentRemoval(talent: WH40KItemDocument, actor: WH40KBaseActorDocument): Promise<void> {
    if (talent.type !== 'talent') return;
    const { GrantsManager } = await import('../managers/grants-manager.ts');
    await GrantsManager.reverseAppliedGrants(actor, GrantsManager.sourceKeyFor(talent));
}
