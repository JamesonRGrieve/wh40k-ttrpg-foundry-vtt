/**
 * Skill-use picker (#432). Prompts the player to choose which use of a skill to
 * perform (a general test, or one of the skill's RAW Special Uses), then the
 * caller dispatches to the matching flow. Lives in the roll layer (it orchestrates
 * a roll variant) and reaches the dialog via the `foundry.applications` global
 * rather than importing the applications layer, keeping the documents→rolls
 * dependency clean.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { getSkillUses, type SkillUseDef } from '../rules/skill-uses.ts';

/**
 * Resolve which use of `skillKey` the player wants. Skills with only the general
 * test resolve immediately (no dialog). Returns the chosen use, or `null` when the
 * picker is dismissed.
 */
export async function promptSkillUse(skillKey: string, skillLabel: string): Promise<SkillUseDef | null> {
    const uses = getSkillUses(skillKey);
    if (uses.length <= 1) return uses[0] ?? null;

    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications.api.DialogV2 is not surfaced by fvtt-types under our config
    const dialogApi = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (dialogApi === undefined) return uses[0] ?? null;

    const buttons = uses.map((use) => ({ action: use.id, label: game.i18n.localize(use.labelKey), callback: (): string => use.id }));
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.wait resolves to the selected button callback's return (a use id) OR null when dismissed
    const chosen = (await dialogApi.wait({
        window: { title: game.i18n.format('WH40K.SkillUse.PickerTitle', { skill: skillLabel }) },
        content: `<p>${game.i18n.localize('WH40K.SkillUse.PickerHint')}</p>`,
        buttons,
        rejectClose: false,
    })) as string | null;

    return uses.find((u) => u.id === chosen) ?? null;
}

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
