/**
 * Action handlers for the Deathwatch Astartes baseline panel (#167).
 *
 * The orchestrator binds these into `CharacterSheet.DEFAULT_OPTIONS.actions`
 * so the `data-action="…"` attributes on
 * `src/templates/actor/panel/dw-astartes-panel.hbs` resolve at runtime.
 * Each handler runs with `this` bound to the live ApplicationV2 sheet
 * instance — only the `actor` property is consumed here, so the
 * `ActionHandlerThis` shape narrows to that surface for type-safe
 * authoring without importing the full sheet type (and the application/
 * data circular-dep that would create — Direction layer: actions are a
 * UI bridge, not a sheet member).
 *
 * The rules engine in `src/module/rules/dw-astartes.ts` is the source
 * of truth for which implant ids are canonical. We treat the persisted
 * `system.implants` array as opaque strings at the action boundary so
 * stale / future ids round-trip unchanged through a toggle, and only
 * normalise (de-dup, preserve order) here — content correctness lives
 * upstream (Direction #7).
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';

/**
 * Minimum surface the toggle handler needs from `this`. Narrowed
 * deliberately to keep the action module independent of the sheet
 * class (which would otherwise pull the whole applications/ tree into
 * the dependency graph).
 */
export interface AstartesActionHandlerThis {
    readonly actor: WH40KBaseActor & {
        readonly system: { readonly implants: ReadonlyArray<string> };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update() signature accepts arbitrary diff records and returns the resolved Document or undefined
        update: (diff: Record<string, unknown>) => Promise<unknown>;
    };
}

/**
 * Toggle a single Astartes implant id on `system.implants`. Adds the
 * id when absent, removes it when present. Preserves array order on
 * insertion (new ids appended to the end) and dedups defensively in
 * case the source array contained duplicates from a prior import.
 *
 * The HBS partial supplies the id via `data-implant-id="<id>"`; the
 * `data-action="dwAstartesToggleImplant"` is bound to this function
 * by the orchestrator-managed sheet `actions` registry.
 */
export async function dwAstartesToggleImplant(this: AstartesActionHandlerThis, _event: Event, target: HTMLElement): Promise<void> {
    const implantId = target.dataset['implantId'];
    if (implantId === undefined || implantId === '') return;

    const current = this.actor.system.implants;
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const id of current) {
        if (seen.has(id)) continue;
        seen.add(id);
        deduped.push(id);
    }

    const next = seen.has(implantId) ? deduped.filter((id) => id !== implantId) : [...deduped, implantId];

    await this.actor.update({ 'system.implants': next });
}
