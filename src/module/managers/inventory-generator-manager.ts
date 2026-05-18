/**
 * Inventory Generator Manager
 *
 * Orchestration that wires the pure {@link InventoryCandidate} selection logic
 * to Foundry's compendium + document APIs. It is entirely compendium-driven
 * and stateless: the candidate pool, the available profile tags, and every
 * mechanic value are read out of the system packs at call time. Nothing about
 * the *content* (vendor types, armoury tiers, item names) lives here
 * (Direction #7) — the selection maths is the pure module, the data is the
 * compendium.
 *
 * Mirrors the {@link ItemDropManager} architecture: pure helpers + tested
 * maths live elsewhere; this class only bridges them to the Foundry runtime
 * and is covered by the integration tiers.
 */

import { SYSTEM_ID } from '../constants.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { t } from '../i18n/t.ts';
import type { InventoryCandidate } from '../inventory/inventory-generator.ts';
import { gameSystemPackPrefix } from '../utils/game-system-pack-prefix.ts';
import { ItemDropManager, type StackProjection } from './item-drop-manager.ts';

/* eslint-disable no-restricted-syntax -- boundary: Foundry CompendiumCollection.getIndex returns minimally-typed entries; `system` is a compendium payload with no schema at this layer, and normalizeProfiles validates raw index data */
/** Shape of the compendium index entries the generator reads. */
interface GeneratorIndexEntry {
    _id: string;
    name: string;
    type: string;
    img?: string;
    system?: {
        availability?: unknown;
        homebrew?: { inventory?: { profiles?: unknown; weight?: unknown } };
    };
}

function normalizeProfiles(raw: unknown): string[] {
    const list = raw instanceof Set ? [...raw] : Array.isArray(raw) ? raw : [];
    return list.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim());
}
/* eslint-enable no-restricted-syntax */

const DEFAULT_IMG = 'icons/svg/item-bag.svg';
const DEFAULT_AVAILABILITY = 'common';

// biome-ignore lint/complexity/noStaticOnlyClass: stable system API surface mirroring ItemDropManager (sheet action + integration tiers)
export class InventoryGeneratorManager {
    /**
     * Read every droppable physical item from the compendium packs scoped to
     * `gameSystem` (plus shared `homebrew` packs) and project them to plain
     * {@link InventoryCandidate}s. Scoping reuses the single shared
     * system→pack-prefix mapping so a `dh2e` actor only ever sees `dh2-*`
     * content (`Dodge` exists six times across systems with different UUIDs).
     */
    static async collectCandidates(gameSystem: string | undefined): Promise<InventoryCandidate[]> {
        const prefix = gameSystemPackPrefix(gameSystem);
        const packs = game.packs.filter((pack) => {
            if (pack.metadata.system !== SYSTEM_ID || pack.documentName !== 'Item') return false;
            if (prefix.length === 0) return true;
            const packName = pack.metadata.name;
            return packName.startsWith(prefix) || packName.startsWith('homebrew');
        });

        const perPack = await Promise.all(
            packs.map(async (pack) => {
                const index = await pack.getIndex({
                    fields: ['name', 'type', 'img', 'system.availability', 'system.homebrew.inventory.profiles', 'system.homebrew.inventory.weight'],
                });
                const out: InventoryCandidate[] = [];
                for (const raw of index) {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry CompendiumCollection.getIndex returns minimally-typed entries; system is a compendium payload with no schema at this layer
                    const entry = raw as unknown as GeneratorIndexEntry;
                    if (!ItemDropManager.isDroppable(entry.type)) continue;
                    const inv = entry.system?.homebrew?.inventory;
                    out.push({
                        uuid: `Compendium.${pack.metadata.id}.${entry._id}`,
                        name: entry.name,
                        type: entry.type,
                        img: entry.img ?? DEFAULT_IMG,
                        availability: typeof entry.system?.availability === 'string' ? entry.system.availability : DEFAULT_AVAILABILITY,
                        drawWeight: typeof inv?.weight === 'number' ? inv.weight : null,
                        profiles: normalizeProfiles(inv?.profiles),
                    });
                }
                return out;
            }),
        );

        return perPack.flat().sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Instantiate the selected compendium items onto `actor`, stack-merging
     * into existing inventory where the item already exists (reusing the
     * tested {@link ItemDropManager.planStackMerge}). Returns the number of
     * item documents created or bumped, or `null` when nothing was applied.
     */
    static async applyToActor(actor: WH40KBaseActor, uuids: readonly string[]): Promise<number | null> {
        if (!actor.isOwner) {
            ui.notifications.warn(t('WH40K.InventoryGenerator.PermissionDenied'));
            return null;
        }

        const docs = await Promise.all(uuids.map(async (uuid) => fromUuid(uuid)));
        const incoming: StackProjection[] = [];
        for (const doc of docs) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns a Document | InvalidUuid | null union; we feature-detect toObject before projecting to StackProjection
            if (doc === null || typeof (doc as { toObject?: unknown }).toObject !== 'function') continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns a Document | InvalidUuid | null union; toObject() yields untyped source we project to StackProjection
            const data = (doc as unknown as { toObject: () => StackProjection & { _id?: unknown } }).toObject();
            delete data._id;
            incoming.push(data);
        }
        if (incoming.length === 0) {
            ui.notifications.warn(t('WH40K.InventoryGenerator.NothingApplied'));
            return null;
        }

        const existing: StackProjection[] = [];
        for (const item of actor.items) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.toObject() returns untyped document source
            existing.push(item.toObject() as StackProjection);
        }

        const plan = ItemDropManager.planStackMerge(existing, incoming);
        if (plan.creates.length > 0) {
            await actor.createEmbeddedDocuments(
                'Item',
                // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments item-data param is not statically typed for our projection
                plan.creates as unknown as Parameters<typeof actor.createEmbeddedDocuments<'Item'>>[1],
            );
        }
        if (plan.updates.length > 0) {
            await actor.updateEmbeddedDocuments(
                'Item',
                plan.updates.map((u) => ({ '_id': u._id, 'system.quantity': u.quantity })),
            );
        }

        const applied = plan.creates.length + plan.updates.length;
        ui.notifications.info(t('WH40K.InventoryGenerator.Applied', { count: applied, actor: actor.name }));
        return applied;
    }
}
