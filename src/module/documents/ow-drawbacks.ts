/**
 * @file Adding Only War Regimental Drawbacks to a character, and reading what
 * each one returns to the Regiment Creation budget (#160).
 *
 * A Regimental Drawback is an `originPath` item on the `regimentalDrawback` step.
 * A character records the drawbacks its regiment took as their UUIDs in
 * `system.regimentDrawbacks`; the drawback panel names them and totals their
 * Regiment Creation Points, which the item carries in `system.regimentPoints`.
 */

import type { RegimentDrawback } from '../rules/ow-regiment-drawback.ts';
import { pickCompendiumItemUuid } from './compendium-pick.ts';

/** The origin-path step a Regimental Drawback is authored on. */
export const DRAWBACK_STEP = 'regimentalDrawback';

/** The part of an origin-path item a drawback is read from. */
export interface DrawbackSource {
    readonly type: string;
    readonly uuid: string | null;
    readonly system: { readonly step: string; readonly regimentPoints: number | null };
}

/** Whether a document is a Regimental Drawback. */
export function isRegimentalDrawback(document: { type: string; system: object } | null): document is DrawbackSource {
    return document !== null && document.type === 'originPath' && 'step' in document.system && document.system.step === DRAWBACK_STEP;
}

/**
 * The drawback descriptor the panel totals, or `undefined` while the item has
 * not recorded its Regiment Creation Points (the panel then shows them as unknown).
 * A drawback's penalties are applied by the origin path, so none are carried here.
 */
export function drawbackDescriptor(drawback: DrawbackSource, id: string): RegimentDrawback | undefined {
    const points = drawback.system.regimentPoints;
    if (points === null) return undefined;
    return { id, description: '', refund: points, penalty: {} };
}

/** Resolve each recorded drawback UUID to its descriptor; an id that no longer resolves, or has no points, is left out. */
export async function resolveDrawbackDescriptors(ids: readonly string[]): Promise<Map<string, RegimentDrawback>> {
    const descriptors = new Map<string, RegimentDrawback>();
    const documents = await Promise.all(ids.map(async (id) => ({ id, document: await fromUuid(id) })));
    for (const { id, document } of documents) {
        if (!(document instanceof Item) || !isRegimentalDrawback(document)) continue;
        const descriptor = drawbackDescriptor(document, id);
        if (descriptor !== undefined) descriptors.set(id, descriptor);
    }
    return descriptors;
}

/** The character surface adding a drawback reads and writes. */
export interface DrawbackHolder {
    readonly system: { readonly regimentDrawbacks: readonly string[] };
    update: (data: { 'system.regimentDrawbacks': string[] }) => Promise<object | undefined>;
}

/** Record a drawback on the character. Returns `false` when its regiment already took it. */
export async function addRegimentalDrawback(actor: DrawbackHolder, uuid: string): Promise<boolean> {
    const held = actor.system.regimentDrawbacks;
    if (held.includes(uuid)) return false;
    await actor.update({ 'system.regimentDrawbacks': [...held, uuid] });
    return true;
}

/** Whether a compendium index entry (loaded with `system.step`) is a Regimental Drawback. */
export function isDrawbackIndexEntry(entry: CompendiumIndexEntry): boolean {
    const system = entry['system'];
    return entry.type === 'originPath' && typeof system === 'object' && system !== null && 'step' in system && system.step === DRAWBACK_STEP;
}

/** Let the user pick a Regimental Drawback from the compendiums, by name; its UUID, or `null`. */
export async function chooseCompendiumDrawback(): Promise<string | null> {
    return pickCompendiumItemUuid(
        ['type', 'system.step'],
        isDrawbackIndexEntry,
        game.i18n.localize('WH40K.OW.RegimentDrawback.PickTitle'),
        game.i18n.localize('WH40K.OW.RegimentDrawback.PickHint'),
    );
}
