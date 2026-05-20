/**
 * Action handlers for the Deathwatch Distinctions panel (#171).
 *
 * The orchestrator binds these into `CharacterSheet.DEFAULT_OPTIONS.actions`
 * so the `data-action="…"` attributes on
 * `src/templates/actor/panel/dw-distinction-panel.hbs` resolve at
 * runtime. Each handler runs with `this` bound to the live ApplicationV2
 * sheet instance — only the `actor` property is consumed here, so the
 * `DistinctionActionHandlerThis` shape narrows to that surface for
 * type-safe authoring without importing the full sheet type (and the
 * applications/data circular-dep that would create — Direction layer:
 * actions are a UI bridge, not a sheet member).
 *
 * The toggle handlers persist `system.distinctions` /
 * `system.marksOfDistinction` as opaque id arrays. Content validity
 * (gate checks, Renown rewards, characteristic deltas) is the
 * responsibility of the pure engine in `src/module/rules/dw-distinction.ts`
 * — the engine is invoked from the orchestrator's context builder on
 * the sheet side and emits any chat / notification effects there.
 *
 * Toggling a Distinction off also strips any companion Mark id with the
 * same slug (a Mark cannot persist without its Distinction). Toggling a
 * Mark on while its Distinction is absent is *permitted* (the panel
 * surfaces the orphan for the GM) but the toggle handler will add the
 * Distinction id silently to keep the two arrays in shape on the happy
 * path.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';

/**
 * Minimum surface the toggle handlers need from `this`. Narrowed
 * deliberately to keep the action module independent of the sheet class
 * (which would otherwise pull the whole applications/ tree into the
 * dependency graph).
 */
export interface DistinctionActionHandlerThis {
    readonly actor: WH40KBaseActor & {
        readonly system: {
            readonly distinctions?: ReadonlyArray<string>;
            readonly marksOfDistinction?: ReadonlyArray<string>;
        };
        update: (diff: Record<string, unknown>) => Promise<unknown>;
    };
}

/**
 * De-duplicate an id list while preserving first-seen order.
 *
 * Defensive: prior imports / migrations may have introduced duplicates
 * that the schema's ArrayField did not reject. The toggle path is the
 * canonical place to repair the persisted shape.
 */
function dedup(ids: ReadonlyArray<string>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/**
 * `data-action="dwToggleDistinction"` handler. Adds the supplied
 * Distinction id to `system.distinctions` when absent; removes it (and
 * any companion Mark with the same id) when present.
 *
 * The id is taken from `data-distinction-id="<id>"` on the clicked
 * element; an empty / missing attribute is a no-op rather than an error
 * so a stray click on an unbound element cannot wipe state.
 */
export async function dwToggleDistinction(this: DistinctionActionHandlerThis, _event: Event, target: HTMLElement): Promise<void> {
    const distinctionId = target.dataset['distinctionId'];
    if (distinctionId === undefined || distinctionId === '') return;

    const distinctions = dedup(this.actor.system.distinctions ?? []);
    const marks = dedup(this.actor.system.marksOfDistinction ?? []);

    const hasDistinction = distinctions.includes(distinctionId);
    if (hasDistinction) {
        // Removing the Distinction also strips any matching Mark — a
        // Mark cannot persist without its parent honour.
        const nextDistinctions = distinctions.filter((id) => id !== distinctionId);
        const nextMarks = marks.filter((id) => id !== distinctionId);
        await this.actor.update({
            'system.distinctions': nextDistinctions,
            'system.marksOfDistinction': nextMarks,
        });
        return;
    }

    const nextDistinctions = [...distinctions, distinctionId];
    await this.actor.update({ 'system.distinctions': nextDistinctions });
}

/**
 * `data-action="dwToggleMark"` handler. Adds the supplied Mark id to
 * `system.marksOfDistinction` when absent (also adding the parent
 * Distinction id if missing — a Mark always implies its Distinction);
 * removes it from `system.marksOfDistinction` when present, leaving the
 * parent Distinction in place (the actor still has the honour, just no
 * longer the embodied Mark).
 *
 * The id is taken from `data-mark-id="<id>"` on the clicked element; an
 * empty / missing attribute is a no-op.
 */
export async function dwToggleMark(this: DistinctionActionHandlerThis, _event: Event, target: HTMLElement): Promise<void> {
    const markId = target.dataset['markId'];
    if (markId === undefined || markId === '') return;

    const distinctions = dedup(this.actor.system.distinctions ?? []);
    const marks = dedup(this.actor.system.marksOfDistinction ?? []);

    const hasMark = marks.includes(markId);
    if (hasMark) {
        const nextMarks = marks.filter((id) => id !== markId);
        await this.actor.update({ 'system.marksOfDistinction': nextMarks });
        return;
    }

    const diff: Record<string, unknown> = {
        'system.marksOfDistinction': [...marks, markId],
    };
    if (!distinctions.includes(markId)) {
        diff['system.distinctions'] = [...distinctions, markId];
    }
    await this.actor.update(diff);
}
