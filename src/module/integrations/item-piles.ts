import { type CurrencyConfig, WH40K } from '../config.ts';
import { SYSTEM_ID } from '../constants.ts';
import { NON_DROPPABLE_TYPES } from '../managers/non-droppable-types.ts';

/**
 * Item Piles (and basic economy plugin) integration.
 *
 * The derived `system.price` (see PhysicalItemTemplate / docs/VALUATION.md)
 * exposes the active line's throne-gelt valuation at a Foundry-standard path so
 * generic merchant/loot modules price our items. This module registers the full
 * system integration with Item Piles when that module is present — currencies,
 * the pile actor type, the item-quantity path, and the non-physical item filter
 * — so dropped items become real Item Piles piles instead of failing creation.
 */

/**
 * Content-agnostic system identifiers Item Piles needs to create and classify
 * pile contents. These are actor / item *type* names (schema-level), not
 * compendium content (Direction #7) — the same class as NON_DROPPABLE_TYPES.
 * The `loot` actor (src/module/data/actor/loot.ts) is our lightweight item
 * container; every field carries a schema default, so an Item-Piles-created
 * pile validates without our drop manager populating provenance.
 */
const PILE_ACTOR_TYPE = 'loot';
const ITEM_QUANTITY_ATTRIBUTE = 'system.quantity';
// Item Piles' own world setting (SETTINGS.ACTOR_CLASS_TYPE = "actorClassType")
// that its PrivateAPI._createItemPile reads to type the pile Actor. Item Piles
// seeds this from a system's config only during its OWN init — before our
// runtime addSystemIntegration on `item-piles-ready` — so for us it stays empty
// and _createItemPile calls Actor.create({ type: undefined }), which our schema
// rejects ("type may not be undefined"). We seed it ourselves (#402).
const ITEM_PILES_MODULE_ID = 'item-piles';
const ITEM_PILES_ACTOR_TYPE_SETTING = 'actorClassType';
const ITEM_PRICE_ATTRIBUTE = 'system.price.value';
const ITEM_CLASS_LOOT_TYPE = 'gear';
const ITEM_CLASS_WEAPON_TYPE = 'weapon';
const ITEM_CLASS_EQUIPMENT_TYPE = 'armour';

/** Minimal feature-detected view of the Item Piles API we call. `createItemPile`
 *  resolves to the created pile's UUID; `addItems` resolves only once the items
 *  are actually in the pile (unlike createItemPile's fire-and-forget item attach). */
interface ItemPilesApiLike {
    addSystemIntegration?: (data: object) => void;
    createItemPile?: (options: { sceneId?: string | undefined; position?: { x: number; y: number }; items?: object[] }) => Promise<string>;
    addItems?: (target: object, items: object[], options?: object) => Promise<void>;
}

/** Item Piles attribute-backed currency entry. */
interface ItemPilesCurrency {
    type: 'attribute';
    name: string;
    img: string;
    abbreviation: string;
    data: { path: string };
    primary: boolean;
    exchangeRate: number;
}

/** Item Piles per-item filter: exclude items whose `path` matches a CSV value. */
interface ItemPilesItemFilter {
    path: string;
    filters: string;
}

/** The full system-integration payload Item Piles consumes. */
interface ItemPilesSystemConfig {
    VERSION: string;
    ACTOR_CLASS_TYPE: string;
    ITEM_CLASS_LOOT_TYPE: string;
    ITEM_CLASS_WEAPON_TYPE: string;
    ITEM_CLASS_EQUIPMENT_TYPE: string;
    ITEM_QUANTITY_ATTRIBUTE: string;
    ITEM_PRICE_ATTRIBUTE: string;
    ITEM_FILTERS: ItemPilesItemFilter[];
    CURRENCIES: ItemPilesCurrency[];
}

/** Build the Item Piles system-integration payload from the active config. */
function buildItemPilesConfig(): ItemPilesSystemConfig {
    const currencies: ItemPilesCurrency[] = Object.values(WH40K.currencies).map((currency: CurrencyConfig) => ({
        type: 'attribute',
        name: currency.label,
        img: 'icons/commodities/currency/coin-engraved-skull-gold.webp',
        abbreviation: `{#}${currency.abbreviation}`,
        data: { path: currency.walletPath },
        primary: currency.primary === true,
        exchangeRate: 1,
    }));
    return {
        VERSION: '1.0.0',
        ACTOR_CLASS_TYPE: PILE_ACTOR_TYPE,
        ITEM_CLASS_LOOT_TYPE,
        ITEM_CLASS_WEAPON_TYPE,
        ITEM_CLASS_EQUIPMENT_TYPE,
        ITEM_QUANTITY_ATTRIBUTE,
        ITEM_PRICE_ATTRIBUTE,
        // Keep ownership-fact items (skills, talents, traits, conditions, …) out
        // of pile contents — they are not physical objects.
        ITEM_FILTERS: [{ path: 'type', filters: [...NON_DROPPABLE_TYPES].join(',') }],
        CURRENCIES: currencies,
    };
}

/**
 * Register the wh40k-rpg ↔ Item Piles integration. No-op when the module is
 * absent; feature-detects the API and falls back to a console hint (manual
 * config documented in docs/VALUATION.md) if the surface differs.
 */
export function registerItemPilesValuation(): void {
    if (game.modules.get('item-piles')?.active !== true) return;

    // 'item-piles-ready' is a third-party module hook outside fvtt-types' hook-name unions.
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-deprecated, no-restricted-syntax -- framework boundary: Hooks.once is deprecated in V14 and typed by core hook name; this shim accepts a third-party hook id */
    // biome-ignore lint/suspicious/noExplicitAny: framework boundary — third-party hook payload
    const hooksOnce = Hooks.once.bind(Hooks) as (event: string, fn: (...args: any[]) => unknown) => number;
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-deprecated, no-restricted-syntax */
    hooksOnce('item-piles-ready', () => {
        void applyItemPilesReady();
    });
}

/**
 * Whether Item Piles' pile-actor-type setting needs seeding — true when it is
 * unset or blank (the state that makes `_createItemPile` build an actor with an
 * undefined `type`). Pure; unit-tested (#402).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: validates Foundry's untyped ClientSettings value; narrowed by the typeof guard on the next line.
export function shouldSeedPileActorType(current: unknown): boolean {
    return typeof current !== 'string' || current.trim() === '';
}

/**
 * Seed Item Piles' `actorClassType` world setting to our `loot` pile type when
 * Item Piles left it empty, so `PrivateAPI._createItemPile` types the pile Actor
 * validly instead of `undefined` (#402). Only the GM may write a world setting,
 * and seeding it once is enough for every client; guarded on the setting being
 * registered so an Item Piles key rename degrades to a no-op.
 */
async function ensurePileActorType(): Promise<void> {
    if (!game.user.isGM) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: item-piles is a third-party module; its settings namespace/keys are outside fvtt-types' ClientSettings registry.
    const settings = game.settings as unknown as {
        settings: { has: (key: string) => boolean };
        get: (namespace: string, key: string) => string | undefined;
        set: (namespace: string, key: string, value: string) => Promise<void>;
    };
    if (!settings.settings.has(`${ITEM_PILES_MODULE_ID}.${ITEM_PILES_ACTOR_TYPE_SETTING}`)) return;
    if (!shouldSeedPileActorType(settings.get(ITEM_PILES_MODULE_ID, ITEM_PILES_ACTOR_TYPE_SETTING))) return;
    await settings.set(ITEM_PILES_MODULE_ID, ITEM_PILES_ACTOR_TYPE_SETTING, PILE_ACTOR_TYPE);
}

/**
 * Apply the wh40k-rpg ↔ Item Piles integration once Item Piles is ready: register
 * the system config, then seed the pile actor type so canvas item drops create a
 * valid `loot` pile (#402). No-op on API mismatch (manual config in VALUATION.md).
 */
async function applyItemPilesReady(): Promise<void> {
    try {
        // eslint-disable-next-line no-restricted-syntax -- boundary: item-piles is a third-party module global not present in our type surface
        const api = (game as unknown as { itempiles?: { API?: ItemPilesApiLike } }).itempiles?.API;
        if (typeof api?.addSystemIntegration !== 'function') {
            console.warn(
                `${SYSTEM_ID} | Item Piles present but API.addSystemIntegration is unavailable; configure ITEM_PRICE_ATTRIBUTE='system.price.value' and the currencies manually (docs/VALUATION.md).`,
            );
            return;
        }
        api.addSystemIntegration(buildItemPilesConfig());
        await ensurePileActorType();
    } catch (err) {
        console.warn(`${SYSTEM_ID} | Item Piles integration failed; configure manually per docs/VALUATION.md.`, err);
    }
}

/** Resolve the Item Piles API when the module is active, else undefined. */
function itemPilesApi(): ItemPilesApiLike | undefined {
    if (game.modules.get('item-piles')?.active !== true) return undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: item-piles is a third-party module global not present in our type surface
    return (game as unknown as { itempiles?: { API?: ItemPilesApiLike } }).itempiles?.API;
}

/**
 * Drop an item onto the scene as an Item Piles pile when that module is present.
 * Returns true when Item Piles created the pile (so the caller skips the
 * loot-actor fallback), false when Item Piles is absent or the call fails. Item
 * Piles owns its own pile actors, so this keeps a "Dropped: X" actor out of the
 * Actors sidebar; feature-detected + guarded, so a missing/changed API simply
 * degrades to the loot-actor method.
 */
export async function dropItemAsItemPile(itemData: object, position: { x: number; y: number }, sceneId: string | undefined): Promise<boolean> {
    const api = itemPilesApi();
    if (typeof api?.createItemPile !== 'function' || typeof api.addItems !== 'function') return false;
    try {
        // Create the pile EMPTY, then add the item in an AWAITED call (#405).
        // createItemPile attaches a passed `items` array on a fire-and-forget
        // ~250ms timer it never awaits, so populating there and deleting the source
        // on return races the attach — an empty pile plus a lost item. addItems
        // resolves only once the item is really in the pile, so the caller can
        // delete the source safely afterwards.
        const pileUuid = await api.createItemPile({ sceneId, position });
        if (typeof pileUuid !== 'string' || pileUuid === '') return false;
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid is a Foundry global; it resolves the pile as an untyped Document union.
        const pile = (await fromUuid(pileUuid)) as object | null;
        if (pile === null) return false;
        await api.addItems(pile, [itemData]);
        return true;
    } catch (err) {
        console.warn(`${SYSTEM_ID} | Item Piles pile creation failed; falling back to the loot-actor method.`, err);
        return false;
    }
}

/** Actor surface the pile check reads — Foundry's per-module flag bag. */
export interface FlaggableActor {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.flags is an untyped per-module flag bag (any actor type assigns here); narrowed structurally below
    flags?: unknown;
}

/**
 * Whether an actor is an Item Piles pile (carries the module's enabled flag).
 * Item Piles creates its piles as our `loot` actor type, so our own loot-token
 * hooks (the Token-HUD pickup control, the non-GM move-lock) would otherwise
 * double up on them. Those hooks call this to defer to Item Piles, which owns
 * interaction and movement for its own piles.
 */
export function isItemPilesPile(actor: FlaggableActor | null | undefined): boolean {
    const flags = actor?.flags;
    if (typeof flags !== 'object' || flags === null || !('item-piles' in flags)) return false;
    const piles = flags['item-piles'];
    if (typeof piles !== 'object' || piles === null || !('data' in piles)) return false;
    const data = piles.data;
    return typeof data === 'object' && data !== null && 'enabled' in data && data.enabled === true;
}
