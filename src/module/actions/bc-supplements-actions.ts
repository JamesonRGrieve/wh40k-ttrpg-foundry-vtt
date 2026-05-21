/**
 * @file Action handlers for the Black Crusade Supplement Mechanics panel (#181).
 *
 * Exports static functions whose names match the `data-action` strings
 * in `src/templates/actor/panel/bc-supplements-panel.hbs`. The orchestrator
 * registers them in `CharacterSheet.DEFAULT_OPTIONS.actions` so the
 * ApplicationV2 action dispatcher binds `this` to the sheet — the
 * functions therefore read `this.actor` to access the live actor.
 *
 * One action:
 *   - `bcToggleQuickAndTheDead` — flip `system.quickAndTheDeadActive`.
 *
 * The Daemon Engine rating is edited through a plain `name="system.daemonEngineRating"`
 * input on the panel and persisted by Foundry's form-binding pipeline,
 * so no action handler is needed for it.
 *
 * BC-gated at the call site (the panel only renders for BC actors); the
 * runtime guard here is defensive against accidental invocation on a
 * homologated sheet for a non-BC actor.
 */

import type { BcSupplementsDeclarations } from '../data/actor/mixins/bc-supplements-template.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';

/** Sheet-like host shape; the ApplicationV2 dispatcher binds the sheet as `this`. */
interface BcSupplementsActionHost {
    readonly actor: WH40KBaseActor & { readonly system: BcSupplementsDeclarations };
    _resolveGameSystemId?: () => string;
}

function isBcActor(host: BcSupplementsActionHost): boolean {
    if (typeof host._resolveGameSystemId === 'function') {
        return host._resolveGameSystemId() === 'bc';
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-system gameSystem id lives on the system data; the abstract WH40KBaseActor surface doesn't expose it
    const sys = host.actor.system as { gameSystem?: string };
    return sys.gameSystem === 'bc';
}

/**
 * Toggle the Quick and the Dead trait active flag
 * (`data-action="bcToggleQuickAndTheDead"`). No-op for non-BC actors.
 */
export async function bcToggleQuickAndTheDead(this: BcSupplementsActionHost, event: Event, _target: HTMLElement): Promise<void> {
    event.preventDefault();
    if (!isBcActor(this)) return;
    const current = this.actor.system.quickAndTheDeadActive;
    await this.actor.update({ 'system.quickAndTheDeadActive': !current });
}
