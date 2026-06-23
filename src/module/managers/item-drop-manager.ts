/**
 * Item Drop / Pickup Manager
 *
 * Content-agnostic plumbing for dropping an owned item onto the scene as a
 * `loot` pile token, and for picking that pile back up onto another actor.
 *
 * Architecture: the decision logic (where the pile lands, which existing pile
 * to merge into, how stacks combine on pickup, which actor receives a pickup)
 * lives in pure static helpers that take plain data and are fully unit-tested.
 * The orchestration methods wire those helpers to Foundry's document API.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import { t } from '../i18n/t.ts';

/** Minimal position shape used by the pure placement helpers. */
interface GridPoint {
    x: number;
    y: number;
}

/** Token-document-like projection the placement helpers need. */
export interface TokenLike {
    x: number;
    y: number;
    actor?: { type?: string } | null;
}

/** Stackable-item projection used by the pure merge helper. */
export interface StackProjection {
    _id?: string;
    name: string;
    type: string;
    system?: { quantity?: number | null } | null;
}

/** Outcome of a stack-merge computation. */
interface StackMergePlan {
    /** Existing receiver items to bump (id + new quantity). */
    updates: Array<{ _id: string; quantity: number }>;
    /** Incoming item objects to create fresh on the receiver. */
    creates: StackProjection[];
}

const OWNERSHIP_OWNER = 3;

/**
 * Item types that represent ownership facts rather than physical objects and
 * therefore can never be dropped on the ground. Content-agnostic: these are
 * system mechanics, not compendium content (Direction #7).
 */
const NON_DROPPABLE_TYPES: ReadonlySet<string> = new Set([
    'skill',
    'talent',
    'trait',
    'aptitude',
    'condition',
    'criticalInjury',
    'mutation',
    'malignancy',
    'mentalDisorder',
    'originPath',
    'peer',
    'enemy',
    'specialAbility',
    'psychicPower',
    'navigatorPower',
    'ritual',
    'order',
]);

// biome-ignore lint/complexity/noStaticOnlyClass: stable system API surface with many call sites (sheet action, token HUD, integration + e2e tiers)
export class ItemDropManager {
    /* -------------------------------------------- */
    /*  Pure helpers (unit-tested)                  */
    /* -------------------------------------------- */

    /** Whether an item of this type is a physical object that can be dropped. */
    static isDroppable(itemType: string): boolean {
        return !NON_DROPPABLE_TYPES.has(itemType);
    }

    /**
     * Snap a raw pixel coordinate to the top-left of its grid cell so dropped
     * piles land tidily on the grid (and so merge detection is exact).
     */
    static snapToGrid(point: GridPoint, gridSize: number): GridPoint {
        if (!Number.isFinite(gridSize) || gridSize <= 0) {
            return { x: Math.round(point.x), y: Math.round(point.y) };
        }
        return {
            x: Math.floor(point.x / gridSize) * gridSize,
            y: Math.floor(point.y / gridSize) * gridSize,
        };
    }

    /**
     * Find an existing loot token occupying the target grid cell so repeated
     * drops onto the same square stack into one pile instead of littering the
     * scene. Returns the index into `tokens` or -1.
     */
    static findMergeablePileIndex(tokens: readonly TokenLike[], target: GridPoint, gridSize: number): number {
        const snappedTarget = ItemDropManager.snapToGrid(target, gridSize);
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes token possibly undefined under strict TS, but eslint's plain rule disagrees
            if (token === undefined) continue;
            if (token.actor?.type !== 'loot') continue;
            const snapped = ItemDropManager.snapToGrid({ x: token.x, y: token.y }, gridSize);
            if (snapped.x === snappedTarget.x && snapped.y === snappedTarget.y) return i;
        }
        return -1;
    }

    /**
     * Compute how incoming items fold into a receiver's inventory. Stackable
     * items (those carrying a numeric `system.quantity`) with a matching
     * name+type bump the existing stack; everything else is created fresh.
     * Pure — operates on plain projections only.
     */
    static planStackMerge(existing: readonly StackProjection[], incoming: readonly StackProjection[]): StackMergePlan {
        const plan: StackMergePlan = { updates: [], creates: [] };
        // Working tally so several incoming stacks of the same key accumulate.
        const tally = new Map<string, { id: string; quantity: number }>();
        for (const item of existing) {
            const qty = item.system?.quantity;
            if (typeof qty === 'number' && item._id !== undefined) {
                tally.set(`${item.type}::${item.name}`, { id: item._id, quantity: qty });
            }
        }
        for (const item of incoming) {
            const key = `${item.type}::${item.name}`;
            const incomingQty = item.system?.quantity;
            const slot = tally.get(key);
            if (slot !== undefined && typeof incomingQty === 'number') {
                slot.quantity += incomingQty;
                continue;
            }
            plan.creates.push(item);
        }
        for (const { id, quantity } of tally.values()) {
            // Only emit updates for tallies that actually grew.
            const original = existing.find((e) => e._id === id);
            if (original !== undefined && original.system?.quantity !== quantity) {
                plan.updates.push({ _id: id, quantity });
            }
        }
        return plan;
    }

    /**
     * Pick which actor receives a pickup. The picker's controlled token wins
     * (excluding the loot pile itself); failing that, the user's assigned
     * character. Returns null when the choice is ambiguous or absent so the
     * caller can prompt.
     */
    static resolveReceivingActor<A extends { type?: string }>(controlled: ReadonlyArray<{ actor?: A | null }>, userCharacter: A | null | undefined): A | null {
        const candidates = controlled.map((tk) => tk.actor).filter((a): a is A => a != null && a.type !== 'loot');
        const unique = new Set(candidates);
        if (unique.size === 1) {
            const [only] = unique;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes the destructured element possibly undefined under strict TS, but eslint's plain rule disagrees
            return only ?? null;
        }
        if (unique.size === 0 && userCharacter != null) return userCharacter;
        return null;
    }

    /**
     * Whether a token position update must be vetoed. Loot piles are dropped in
     * place; a non-GM player may select, inspect, and pick one up, but must not
     * drag it around the scene. A change touching `x`/`y` on a `loot`-actor token
     * from a non-GM is blocked; rotation/other updates and all GM updates pass.
     * Pure — operates on plain projections only.
     */
    static blocksLootTokenMove(actorType: string | null | undefined, change: { x?: number; y?: number }, isGM: boolean): boolean {
        if (isGM) return false;
        if (actorType !== 'loot') return false;
        return change.x !== undefined || change.y !== undefined;
    }

    /* -------------------------------------------- */
    /*  Orchestration                               */
    /* -------------------------------------------- */

    /**
     * Drop `item` from `sourceActor` onto the scene under the actor's token.
     * The whole stack moves: the item leaves the actor and reappears in a
     * `loot` pile token at the token's grid cell (merging into an existing
     * pile on that cell when present).
     *
     * @returns the loot Actor the item landed in, or null when the drop
     *   could not be performed (no token, no permission, non-droppable).
     */
    static async dropItemFromActor(sourceActor: WH40KBaseActor, item: WH40KItem): Promise<WH40KBaseActor | null> {
        if (!sourceActor.isOwner) {
            ui.notifications.warn(t('WH40K.Warning.LootDropDenied'));
            return null;
        }
        if (!ItemDropManager.isDroppable(item.type)) {
            ui.notifications.warn(t('WH40K.Warning.LootNotDroppable', { item: item.name }));
            return null;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: getActiveTokens returns Foundry Token placeables; only document position is read
        const tokens = sourceActor.getActiveTokens() as Array<{ document: { x: number; y: number }; x?: number; y?: number }>;
        const placed = tokens[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes tokens[0] possibly undefined under strict TS, but eslint's plain rule disagrees
        if (placed === undefined) {
            ui.notifications.warn(t('WH40K.Warning.LootNoToken', { actor: sourceActor.name }));
            return null;
        }
        const scene = canvas.scene;
        if (scene == null) {
            ui.notifications.warn(t('WH40K.Warning.LootNoToken', { actor: sourceActor.name }));
            return null;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Scene.grid is untyped in fvtt-types at this layer
        const gridSize = ((scene as unknown as { grid?: { size?: number } }).grid?.size ?? 100) || 100;
        const target = ItemDropManager.snapToGrid({ x: placed.document.x, y: placed.document.y }, gridSize);

        // eslint-disable-next-line no-restricted-syntax -- boundary: scene.tokens is a Foundry EmbeddedCollection of TokenDocuments; projected to TokenLike
        const sceneTokens = Array.from((scene as unknown as { tokens: Iterable<TokenLike & { actor?: WH40KBaseActor | null }> }).tokens);
        const mergeIndex = ItemDropManager.findMergeablePileIndex(sceneTokens, target, gridSize);

        const itemData = item.toObject();
        // eslint-disable-next-line no-restricted-syntax -- boundary: toObject() returns untyped document source; _id is stripped before re-create
        delete (itemData as { _id?: unknown })._id;

        let lootActor: WH40KBaseActor | null = null;
        if (mergeIndex >= 0) {
            const pileToken = sceneTokens[mergeIndex];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes index access possibly undefined under strict TS, but eslint's plain rule disagrees
            if (pileToken !== undefined) lootActor = (pileToken.actor as WH40KBaseActor | null) ?? null;
        }

        if (lootActor == null) {
            lootActor = await ItemDropManager.#createLootPile(sourceActor, item, target, scene);
            if (lootActor == null) return null;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments item-data param is not statically typed for our projection
        await lootActor.createEmbeddedDocuments('Item', [itemData]);
        if (item.id != null) await sourceActor.deleteEmbeddedDocuments('Item', [item.id]);

        ui.notifications.info(t('WH40K.Loot.Dropped', { actor: sourceActor.name, item: item.name }));
        return lootActor;
    }

    /**
     * Create the loot Actor + its unlinked scene token. The actor is given
     * default OWNER ownership so every player can select, inspect, and pick
     * up the pile regardless of who dropped it.
     */
    static async #createLootPile(sourceActor: WH40KBaseActor, item: WH40KItem, position: GridPoint, scene: Scene): Promise<WH40KBaseActor | null> {
        const name = t('WH40K.Loot.DefaultName', { item: item.name });
        const img = item.img ?? 'icons/svg/item-bag.svg';
        const lootActor = (await Actor.create({
            name,
            type: 'loot',
            img,
            ownership: { default: OWNERSHIP_OWNER },
            system: {
                source: {
                    actorUuid: sourceActor.uuid ?? '',
                    actorName: sourceActor.name,
                    userId: game.user.id,
                },
                droppedAt: Date.now(),
            },
            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create payload is not statically typed for a system actor subtype
        } as unknown as Parameters<typeof Actor.create>[0])) as WH40KBaseActor | undefined;
        if (lootActor == null) return null;

        const tokenData = [
            {
                name,
                x: position.x,
                y: position.y,
                actorId: lootActor.id,
                actorLink: false,
                texture: { src: img },
                disposition: 0,
            },
        ];
        // eslint-disable-next-line no-restricted-syntax -- boundary: Token create payload is not statically typed for a system actor token at this layer
        await scene.createEmbeddedDocuments('Token', tokenData as unknown as Parameters<typeof scene.createEmbeddedDocuments<'Token'>>[1]);
        return lootActor;
    }

    /**
     * Move every item from a loot pile onto `receivingActor`, stack-merging
     * where possible, then delete the (now empty) pile and its token.
     */
    static async pickupLoot(receivingActor: WH40KBaseActor, lootActor: WH40KBaseActor): Promise<boolean> {
        if (!receivingActor.isOwner) {
            ui.notifications.warn(t('WH40K.Warning.LootPickupDenied'));
            return false;
        }
        const incoming: StackProjection[] = [];
        for (const it of lootActor.items) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.toObject() returns untyped document source
            const data = it.toObject() as StackProjection & { _id?: unknown };
            delete data._id;
            incoming.push(data);
        }
        if (incoming.length === 0) {
            ui.notifications.warn(t('WH40K.Loot.Empty'));
            return false;
        }

        const existing: StackProjection[] = [];
        for (const it of receivingActor.items) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: receiver item.toObject() untyped document source
            existing.push(it.toObject() as StackProjection);
        }
        const plan = ItemDropManager.planStackMerge(existing, incoming);

        if (plan.creates.length > 0) {
            await receivingActor.createEmbeddedDocuments(
                'Item',
                // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments param not statically typed for our projection
                plan.creates as unknown as Parameters<typeof receivingActor.createEmbeddedDocuments<'Item'>>[1],
            );
        }
        if (plan.updates.length > 0) {
            await receivingActor.updateEmbeddedDocuments(
                'Item',
                plan.updates.map((u) => ({ '_id': u._id, 'system.quantity': u.quantity })),
            );
        }

        const pileName = lootActor.name;
        await lootActor.delete();
        ui.notifications.info(t('WH40K.Loot.PickedUpAll', { actor: receivingActor.name, pile: pileName }));
        return true;
    }
}
