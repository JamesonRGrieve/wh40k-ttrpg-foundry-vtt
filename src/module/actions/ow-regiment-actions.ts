/**
 * @file Only War — Regiment panel action handlers (#151).
 *
 * Wired into `CharacterSheet.DEFAULT_OPTIONS.actions` by the
 * orchestrator. The `data-action="owRegimentEdit"` button on the
 * regiment panel routes through `owRegimentEdit`, which opens the
 * RegimentBuilderDialog against the owning actor.
 *
 * The option catalog (compendium content per Direction #7) is loaded
 * from `actor.system.regimentCatalog` if the system config has staged
 * it; otherwise the dialog opens with an empty catalog and surfaces no
 * options (the engine still validates the persisted selection).
 */

import RegimentBuilderDialog from '../applications/prompts/regiment-builder-dialog.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { RegimentOption } from '../rules/ow-regiment-creation.ts';

/**
 * Structural type the regiment-edit handler expects. Any sheet whose
 * `actor` resolves to a {@link WH40KBaseActor} satisfies this without
 * needing to inherit from a specific sheet base.
 */
export interface OwRegimentActionHost {
    actor: WH40KBaseActor;
}

/**
 * `data-action="owRegimentEdit"` — open the RegimentBuilderDialog
 * against the sheet's owning actor. Static handler, bound to the sheet
 * instance by Foundry's ApplicationV2 action dispatcher.
 */
export function owRegimentEdit(this: OwRegimentActionHost, event: Event, _target: HTMLElement): void {
    event.preventDefault();
    const catalog = resolveCatalog(this.actor);
    RegimentBuilderDialog.show(this.actor, catalog);
}

/**
 * Optional staging slot — the OW game-system config may attach a
 * resolved option catalog at `actor.system.regimentCatalog` so the
 * dialog has compendium content to render. When absent the dialog
 * opens empty and the panel still shows the persisted selection.
 */
function resolveCatalog(actor: WH40KBaseActor): ReadonlyArray<RegimentOption> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: regimentCatalog is an optional staging slot exposed by the OW system config; not part of the abstract WH40KBaseActor system surface
    const sys = actor.system as { regimentCatalog?: ReadonlyArray<RegimentOption> };
    return sys.regimentCatalog ?? [];
}
