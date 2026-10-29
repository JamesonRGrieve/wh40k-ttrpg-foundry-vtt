/**
 * @file Striking and tracking Dark Pacts on a character (a DH2 supplement, #84).
 *
 * The Document-side flows the Dark Pacts panel calls. The rules they apply are
 * pure, in `rules/dark-pact.ts`; every pact-specific value comes from the pact
 * item. A taken Boon or Bane with mechanics gives the character an ActiveEffect
 * (its modifiers, through `modifiersToEffectChanges`) and the compendium items
 * it grants; both are flagged with the entry, so removing it removes exactly them.
 */

import { SYSTEM_ID } from '../constants.ts';
import type DarkPactData from '../data/item/dark-pact.ts';
import {
    DARK_PACT_FLAG,
    type DarkPactEntry,
    type DarkPactGrant,
    holdsPact,
    isFromPact,
    newPactRecord,
    type PactEntryKind,
    type PactEntryRef,
    pactEntryEffectData,
    type PactRecord,
    togglePactEntry,
} from '../rules/dark-pact.ts';
import type { WH40KAcolyte } from './acolyte.ts';
import { pickCompendiumItemUuid } from './compendium-pick.ts';
import type { WH40KItem } from './item.ts';

/** A resolved pact item. */
export type DarkPactItem = WH40KItem & { type: 'darkPact'; system: DarkPactData };

/** Whether a document is a Dark Pact item. */
export function isDarkPactItem(document: object | null): document is DarkPactItem {
    return document instanceof Item && document.type === 'darkPact';
}

/** Resolve a pact item by UUID, or `null` when it no longer resolves. */
export async function resolveDarkPact(uuid: string): Promise<DarkPactItem | null> {
    const document = await fromUuid(uuid);
    return isDarkPactItem(document) ? document : null;
}

/** The pact's compendium identity: its source UUID when it came from a pack, else its own. */
function pactUuidOf(pact: DarkPactItem): string {
    const source = pact._stats.compendiumSource;
    if (typeof source === 'string' && source !== '') return source;
    return pact.uuid ?? '';
}

/**
 * Strike a pact (a drop on the sheet, or the panel's Add Pact). The Daemon's
 * Disposition starts from the character's Corruption before the bargain; then
 * the pact's Corruption is rolled, posted, and added. Returns `false` when the
 * character already holds the pact.
 */
export async function strikeDarkPact(actor: WH40KAcolyte, pact: DarkPactItem): Promise<boolean> {
    const pactUuid = pactUuidOf(pact);
    const records = actor.system.pacts;
    if (holdsPact(records, pactUuid)) return false;
    const corruption = actor.system.corruption;
    const record = newPactRecord(pactUuid, pact.system.negotiation, corruption);
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() takes an untyped path-keyed payload
    const update: Record<string, unknown> = { 'system.pacts': [...records, record] };
    const formula = pact.system.corruptionFormula.trim();
    if (formula !== '') {
        const roll = await new Roll(formula).evaluate();
        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: game.i18n.format('WH40K.DarkPact.CorruptionFlavor', { pact: pact.name, actor: actor.name }),
        });
        update['system.corruption'] = corruption + roll.total;
    }
    await actor.update(update);
    return true;
}

/** The items a taken entry grants, ready to create on the actor and flagged with the entry. */
async function grantedItemData(grants: readonly DarkPactGrant[], ref: PactEntryRef): Promise<object[]> {
    const data: object[] = [];
    for (const grant of grants) {
        // eslint-disable-next-line no-await-in-loop -- one compendium lookup per granted item; a pact entry grants a handful at most
        const source = await fromUuid(grant.uuid);
        if (!(source instanceof Item)) continue;
        const { _id: _sourceId, ...item } = source.toObject();
        const system: Record<string, string | number> = {};
        if (grant.specialization !== '') system['specialization'] = grant.specialization;
        if (grant.level !== null) system['level'] = grant.level;
        data.push(
            foundry.utils.mergeObject(item, {
                system,
                flags: { [SYSTEM_ID]: { [DARK_PACT_FLAG]: ref } },
                _stats: { compendiumSource: grant.uuid },
            }),
        );
    }
    return data;
}

/** Give the character a taken entry's mechanics: its ActiveEffect and granted items. */
async function applyEntry(actor: WH40KAcolyte, pact: DarkPactItem, ref: PactEntryRef, entry: DarkPactEntry): Promise<void> {
    const effect = pactEntryEffectData(ref, entry, pact.img ?? '');
    if (effect !== null) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments accepts Foundry's untyped embedded-document create schema
        await actor.createEmbeddedDocuments('ActiveEffect', [effect] as unknown as Parameters<typeof actor.createEmbeddedDocuments<'ActiveEffect'>>[1]);
    }
    const items = await grantedItemData(entry.grants, ref);
    if (items.length > 0) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments accepts Foundry's untyped embedded-document create schema
        await actor.createEmbeddedDocuments('Item', items as unknown as Parameters<typeof actor.createEmbeddedDocuments<'Item'>>[1]);
    }
}

/** Remove what a pact (or one of its entries) gave the character. */
async function removeFromPact(actor: WH40KAcolyte, pactUuid: string, kind?: PactEntryKind, entry?: string): Promise<void> {
    const effectIds = actor.effects.filter((effect) => isFromPact(effect.flags, pactUuid, kind, entry)).map((effect) => effect.id);
    if (effectIds.length > 0) await actor.deleteEmbeddedDocuments('ActiveEffect', effectIds);
    const itemIds = actor.items.filter((item) => isFromPact(item.flags, pactUuid, kind, entry)).map((item) => item.id);
    if (itemIds.length > 0) await actor.deleteEmbeddedDocuments('Item', itemIds);
}

/**
 * Add a Boon or Bane to the bargain, or take it away again. A taken entry with
 * mechanics gives the character its ActiveEffect and granted items; removing it
 * removes them.
 */
export async function toggleDarkPactEntry(actor: WH40KAcolyte, index: number, kind: PactEntryKind, identifier: string): Promise<void> {
    const records = actor.system.pacts;
    const record = records[index];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types records[index] as PactRecord | undefined
    if (record === undefined) return;
    const pact = await resolveDarkPact(record.pactUuid);
    const entry = pact?.system[kind].find((candidate) => candidate.identifier === identifier);
    if (pact === null || entry === undefined) return;
    const next: PactRecord = togglePactEntry(record, kind, identifier);
    await actor.update({ 'system.pacts': records.map((existing, i) => (i === index ? next : existing)) });
    const ref: PactEntryRef = { pactUuid: record.pactUuid, kind, entry: identifier };
    if (next[kind].includes(identifier)) await applyEntry(actor, pact, ref, entry);
    else await removeFromPact(actor, record.pactUuid, kind, identifier);
}

/** End a pact: drop its record and everything its entries gave the character. */
export async function removeDarkPact(actor: WH40KAcolyte, index: number): Promise<void> {
    const records = actor.system.pacts;
    const record = records[index];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types records[index] as PactRecord | undefined
    if (record === undefined) return;
    await actor.update({ 'system.pacts': records.filter((_, i) => i !== index) });
    await removeFromPact(actor, record.pactUuid);
}

/**
 * Let the GM pick a pact from every Dark Pact the system's compendiums hold,
 * by name. Returns `null` when none exists or the choice is dismissed.
 */
export async function chooseCompendiumDarkPact(): Promise<DarkPactItem | null> {
    const uuid = await pickCompendiumItemUuid(
        ['type'],
        (entry) => entry.type === 'darkPact',
        game.i18n.localize('WH40K.DarkPact.PickTitle'),
        game.i18n.localize('WH40K.DarkPact.PickHint'),
    );
    return uuid === null ? null : resolveDarkPact(uuid);
}

/** One pact's Boons and Banes, for the panel; `null` when the pact no longer resolves. */
export async function darkPactDefinitions(records: readonly PactRecord[]): Promise<Map<string, { boons: DarkPactEntry[]; banes: DarkPactEntry[] } | null>> {
    const definitions = new Map<string, { boons: DarkPactEntry[]; banes: DarkPactEntry[] } | null>();
    for (const uuid of new Set(records.map((record) => record.pactUuid))) {
        // eslint-disable-next-line no-await-in-loop -- one lookup per struck pact; a character holds a handful at most
        const pact = await resolveDarkPact(uuid);
        definitions.set(uuid, pact === null ? null : { boons: pact.system.boons, banes: pact.system.banes });
    }
    return definitions;
}
