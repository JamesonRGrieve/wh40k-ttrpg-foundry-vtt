/**
 * @file Conferring Only War Medals and Honours on a character, and reading each
 * for the Battlefield panel (#161, content#32).
 *
 * A medal is a `medal` item (OW rules). A character records the medals
 * conferred on it as their UUIDs in `system.regimentalAwards`; the panel names
 * each one and shows its Squad Bonus.
 */

import { medalAwardDescriptor, type MedalSource, type RegimentalAward } from '../rules/ow-regimental-award.ts';
import { pickCompendiumItemUuid } from './compendium-pick.ts';

/** The item type a medal is authored as. */
const MEDAL_TYPE = 'medal';

/** Whether a document is a medal. */
export function isMedal(document: { type: string; name: string; system: object } | null): document is MedalSource & { type: string } {
    return document !== null && document.type === MEDAL_TYPE && 'squadBonus' in document.system && typeof document.system.squadBonus === 'string';
}

/** Resolve each conferred medal UUID to its descriptor; an id that no longer resolves is left out (the panel then labels it by name). */
export async function resolveAwardDescriptors(ids: readonly string[]): Promise<Map<string, RegimentalAward>> {
    const descriptors = new Map<string, RegimentalAward>();
    const documents = await Promise.all(ids.map(async (id) => ({ id, document: await fromUuid(id) })));
    for (const { id, document } of documents) {
        if (!(document instanceof Item) || !isMedal(document)) continue;
        descriptors.set(id, medalAwardDescriptor(document, id));
    }
    return descriptors;
}

/** The character surface conferring a medal reads and writes. */
export interface AwardHolder {
    readonly system: { readonly regimentalAwards: readonly string[] };
    update: (data: { 'system.regimentalAwards': string[] }) => Promise<object | undefined>;
}

/** Confer a medal on the character. Returns `false` when it already bears it. */
export async function addRegimentalAward(actor: AwardHolder, uuid: string): Promise<boolean> {
    const held = actor.system.regimentalAwards;
    if (held.includes(uuid)) return false;
    await actor.update({ 'system.regimentalAwards': [...held, uuid] });
    return true;
}

/** Whether a compendium index entry is a medal. */
export function isMedalIndexEntry(entry: CompendiumIndexEntry): boolean {
    return entry.type === MEDAL_TYPE;
}

/** Let the user pick a medal from the compendiums, by name; its UUID, or `null`. */
export async function chooseCompendiumAward(): Promise<string | null> {
    return pickCompendiumItemUuid(
        ['type'],
        isMedalIndexEntry,
        game.i18n.localize('WH40K.OW.RegimentalAward.PickTitle'),
        game.i18n.localize('WH40K.OW.RegimentalAward.PickHint'),
    );
}
