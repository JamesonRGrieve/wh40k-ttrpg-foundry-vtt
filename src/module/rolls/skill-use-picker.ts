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

/** The picker's width: room for two or three choices a row. */
const ITEM_CHOICE_WIDTH_PX = 480;

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

    // The choices are buttons in the content, laid out as a wrapping grid, so a long name
    // or many choices never overflow a single footer row (#668); the footer keeps Cancel.
    // Each choice button's action (its item id) records the pick and closes the dialog, and
    // `close` hands that pick to `wait`.
    let picked: string | null = null;
    const actions = Object.fromEntries(
        items.map((item) => [
            item.id,
            async function choose(this: { close: () => Promise<object> }): Promise<void> {
                picked = item.id;
                await this.close();
            },
        ]),
    );
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.wait resolves to the `close` callback's return (an item id) OR null when cancelled
    const chosen = (await dialogApi.wait({
        window: { title },
        position: { width: ITEM_CHOICE_WIDTH_PX },
        content: itemChoiceContent(items, hint),
        buttons: [{ action: 'cancel', label: 'WH40K.Cancel', default: true }],
        actions,
        close: () => picked,
        rejectClose: false,
    })) as string | null;

    return items.find((i) => i.id === chosen) ?? null;
}

/**
 * The picker's content: the hint, then one button per item (its action is the item's
 * id), in a grid that wraps each long name inside its own button. Built as elements,
 * so an item's name is text and never markup. DialogV2 takes a bare `<div>` and uses
 * its children.
 */
export function itemChoiceContent(items: readonly PickableItem[], hint: string): HTMLDivElement {
    const content = document.createElement('div');
    const prompt = document.createElement('p');
    prompt.textContent = hint;
    const scope = document.createElement('div');
    scope.className = 'wh40k-rpg';
    const grid = document.createElement('div');
    grid.className = 'tw-grid tw-grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] tw-gap-1.5';
    grid.dataset['itemChoices'] = '';
    for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset['action'] = item.id;
        button.className = 'tw-h-auto tw-min-h-[2rem] tw-min-w-0 tw-px-2 tw-py-1 tw-whitespace-normal tw-break-words tw-leading-tight';
        const label = document.createElement('span');
        label.textContent = item.name;
        button.append(label);
        grid.append(button);
    }
    scope.append(grid);
    content.append(prompt, scope);
    return content;
}
