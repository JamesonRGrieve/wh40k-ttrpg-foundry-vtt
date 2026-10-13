/**
 * Roll-time pickers: the player's first targeted actor, and a choice among
 * candidate items (#441). Lives in the roll layer and reaches the dialog via the
 * `foundry.applications` global rather than importing the applications layer,
 * keeping the documents→rolls dependency clean. (The skill-use choice itself
 * now lives inside the unified roll dialog.)
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';

/** The first token the current user has targeted, as its (system) actor, or null. */
export function firstTargetedActor(): WH40KBaseActor | null {
    const first = [...game.user.targets].at(0);
    if (first === undefined) return null;
    return first.actor ?? null;
}

/** Minimal shape the item picker needs — id + display name. */
export interface PickableItem {
    readonly id: string;
    readonly name: string;
}

/**
 * Prompt the player to choose one of `items` (#441) — e.g. which chem to administer,
 * or which weapon to coat. A single candidate resolves immediately (no dialog); an
 * empty list resolves to `null`, as does dismissing the picker.
 */
export async function promptItemChoice<T extends PickableItem>(items: readonly T[], title: string, hint: string): Promise<T | null> {
    const first = items[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json (flag on) types items[0] as T | undefined and requires this guard; the lint parser (flag off) sees T
    if (first === undefined) return null;
    if (items.length === 1) return first;

    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications.api.DialogV2 is not surfaced by fvtt-types under our config
    const dialogApi = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (dialogApi === undefined) return first;

    const buttons = items.map((item) => ({ action: item.id, label: item.name, callback: (): string => item.id }));
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.wait resolves to the selected button callback's return (an item id) OR null when dismissed
    const chosen = (await dialogApi.wait({
        window: { title },
        content: `<p>${hint}</p>`,
        buttons,
        rejectClose: false,
    })) as string | null;

    return items.find((i) => i.id === chosen) ?? null;
}
