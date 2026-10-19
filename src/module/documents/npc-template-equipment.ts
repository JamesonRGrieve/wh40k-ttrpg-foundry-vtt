/**
 * @file An NPC Template's carried equipment, landed on the NPC made from it (#670).
 *
 * Each entry is a name and a quantity. An entry whose name is exactly one
 * compendium item's name on the NPC's game line (or that line's homebrew packs)
 * becomes an owned item linked to that document. Any other entry, with no match or
 * several, stays a named entry in the NPC's `system.equipment` list; a wrong link
 * would give the NPC another document's item.
 */

import StorageLocationData from '../data/item/storage-location.ts';
import { isLineOrHomebrewPack, queryItemIndex } from '../utils/compendium-query.ts';

/** One carried-equipment entry: a name and how many. */
export interface TemplateEquipment {
    name: string;
    quantity: number;
}

/** One compendium Item index entry an equipment name can resolve to. */
export interface EquipmentCandidate {
    uuid: string;
    packId: string;
    type: string;
    name: string;
}

/** A matched entry: the compendium item it resolved to, and how many. */
interface ResolvedEquipment {
    uuid: string;
    quantity: number;
}

/** The equipment split into owned items and the named entries that stay a list. */
export interface EquipmentSplit {
    owned: ResolvedEquipment[];
    listed: TemplateEquipment[];
}

/** Whether an item type is one a character carries, the types a storage location holds. Pure. */
function isCarriedType(type: string): boolean {
    return StorageLocationData.containerTypes.includes(type);
}

/**
 * Split template equipment by whether each name resolves to exactly one carried
 * compendium item on the given game line. Pure.
 */
export function splitTemplateEquipment(equipment: readonly TemplateEquipment[], candidates: readonly EquipmentCandidate[], linePrefix: string): EquipmentSplit {
    const onLine = candidates.filter((candidate) => isCarriedType(candidate.type) && isLineOrHomebrewPack(candidate.packId, linePrefix));
    const split: EquipmentSplit = { owned: [], listed: [] };
    for (const entry of equipment) {
        const matches = onLine.filter((candidate) => candidate.name === entry.name);
        const match = matches.length === 1 ? matches[0] : undefined;
        if (match === undefined) split.listed.push({ ...entry });
        else split.owned.push({ uuid: match.uuid, quantity: entry.quantity });
    }
    return split;
}

/** The carried compendium items on a game line and its homebrew packs. */
export async function equipmentCandidates(linePrefix: string): Promise<EquipmentCandidate[]> {
    return queryItemIndex(
        [],
        (entry, pack) =>
            entry.type === undefined || entry.uuid === undefined || !isCarriedType(entry.type)
                ? undefined
                : { uuid: entry.uuid, packId: pack.metadata.id, type: entry.type, name: entry.name },
        true,
        (packId) => isLineOrHomebrewPack(packId, linePrefix),
    );
}

/** One compendium item to give an actor, and how many when it is a carried item. */
export interface LinkedItemRef {
    uuid: string;
    quantity?: number;
}

/**
 * The owned-item sources for compendium items, each linked to its document (and,
 * when given a quantity, carrying it). A UUID that resolves to no Item is skipped.
 */
export async function linkedOwnedItemData(refs: readonly LinkedItemRef[]): Promise<object[]> {
    const sources = await Promise.all(refs.map(async ({ uuid }) => fromUuid(uuid)));
    return refs.flatMap(({ uuid, quantity }, index) => {
        const source = sources[index];
        if (!(source instanceof Item)) return [];
        const { _id: _sourceId, ...item } = source.toObject();
        const system = quantity !== undefined && 'quantity' in item.system ? { quantity } : {};
        return [foundry.utils.mergeObject(item, { system, _stats: { compendiumSource: uuid } })];
    });
}
