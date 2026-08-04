/**
 * @file The Inquisition Armoury — the thing there was nothing to requisition FROM (#496).
 *
 * The requisition maths shipped, and Item Piles was registered for drops, but no
 * armoury actor existed and Item Piles' MERCHANT behaviour was never configured,
 * so "the cell requisitions a hellgun from the Inquisition" had no implementation
 * at either end.
 *
 * The operator's authoring decision: the armoury is **spawned by the system into
 * the world** when a DH2 campaign runs in homebrew requisition mode — not a
 * shipped compendium actor, and not something the GM hand-builds. The existing
 * `dh2-ruleset: raw | homebrew` setting is the gate.
 *
 * The decision half is pure and unit-tested; only `ensureInquisitionArmoury`
 * touches the world, and it is idempotent — the armoury is found by FLAG, so a
 * GM who renames or refiles it does not get a second one on the next boot.
 */

import { SYSTEM_ID } from '../constants.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';

/** Flag marking an actor as THE Inquisition Armoury. Identity lives here, not in the name. */
export const ARMOURY_FLAG = 'inquisitionArmoury';

/** Item Piles' module id and the flag path it reads its pile config from. */
const ITEM_PILES_MODULE_ID = 'item-piles';

/**
 * Item Piles actor type used for piles and merchants alike — our lightweight
 * item container (`data/actor/loot.ts`), matching `integrations/item-piles.ts`.
 */
const ARMOURY_ACTOR_TYPE = 'loot';

/** Item Piles' own `CONSTANTS.PILE_TYPES.MERCHANT`, verified against the installed 3.3.2 build. */
const MERCHANT_PILE_TYPE = 'merchant';

const ARMOURY_IMAGE = 'icons/environment/settlement/ship.webp';

/**
 * The Item Piles pile-config flag for the armoury.
 *
 * Field names and defaults are taken from the installed Item Piles build's
 * `CONSTANTS.PILE_DEFAULTS` rather than guessed. Only the fields that differ
 * from Item Piles' defaults are set, so a module upgrade that changes a default
 * we do not care about carries through.
 * @returns {Record<string, unknown>}  The `flags['item-piles'].data` payload.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: item-piles is a third-party module; its pile-flag shape is outside our type surface
export function armouryPileFlags(): Record<string, unknown> {
    return {
        enabled: true,
        type: MERCHANT_PILE_TYPE,
        // The Inquisition does not run out of standard-issue kit, and a GM who
        // wants scarcity sets a finite quantity on the individual item rather
        // than on the whole armoury.
        infiniteQuantity: true,
        // It supplies; it does not buy the cell's looted xenos junk. Selling TO
        // the Inquisition is a narrative event, not a shop transaction.
        purchaseOnly: true,
        // Requisition is the gate, so the throne-gelt price is informational —
        // showing it keeps `docs/VALUATION.md` visible without implying coin
        // is what pays here.
        displayQuantity: 'no',
        openTimes: { enabled: false, status: 'open' },
    };
}

/**
 * The Actor creation payload for the armoury.
 *
 * Every field of the `loot` DataModel carries a schema default, so name, type,
 * img and flags are the whole payload — the same reason an Item-Piles-created
 * pile validates without our drop manager filling anything in.
 * @param {string} name  Display name (localized by the caller).
 * @returns {Record<string, unknown>}  Payload for `Actor.create`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document creation payload is an open-ended Record
export function armouryActorData(name: string): Record<string, unknown> {
    return {
        name,
        type: ARMOURY_ACTOR_TYPE,
        img: ARMOURY_IMAGE,
        flags: {
            [SYSTEM_ID]: { [ARMOURY_FLAG]: true },
            [ITEM_PILES_MODULE_ID]: { data: armouryPileFlags() },
        },
    };
}

/** The world state the spawn decision reads. */
export interface ArmourySpawnContext {
    /** Active DH2 ruleset — the operator's gate. */
    ruleset: string | undefined;
    /** Only the GM may create world documents. */
    isGM: boolean;
    /** Whether an armoury already exists in this world. */
    exists: boolean;
    /** Whether Item Piles is active — without it a merchant actor is inert. */
    itemPilesActive: boolean;
}

/**
 * Whether to spawn the armoury on this client, this boot.
 *
 * Pure, so the gate is testable without a world. Every clause is a real refusal
 * seen in practice: a player client must not create world documents, a second
 * boot must not produce a second armoury, and spawning a merchant with Item
 * Piles absent leaves a `loot` actor nobody can open.
 * @param {ArmourySpawnContext} context  The world state.
 * @returns {boolean}  True when the armoury should be created.
 */
export function shouldSpawnArmoury(context: ArmourySpawnContext): boolean {
    if (!context.isGM) return false;
    if (context.exists) return false;
    if (!context.itemPilesActive) return false;
    return context.ruleset === 'homebrew';
}

/** The slice of an Actor the armoury finder reads. */
export interface FlaggedActorLike {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `actor.flags` is an untyped per-module flag bag; narrowed structurally here
    flags?: Record<string, Record<string, unknown> | undefined> | undefined;
}

/**
 * The armoury among a world's actors, or undefined.
 *
 * Matched by FLAG rather than by name so the GM can rename it ("Ordo Xenos
 * Requisitions", "The Quartermaster") without the next boot deciding none exists
 * and spawning a duplicate.
 * @param {Iterable<T>} actors  The world's actors.
 * @returns {T | undefined}  The armoury, if present.
 */
export function findArmoury<T extends FlaggedActorLike>(actors: Iterable<T>): T | undefined {
    for (const actor of actors) {
        if (actor.flags?.[SYSTEM_ID]?.[ARMOURY_FLAG] === true) return actor;
    }
    return undefined;
}

/**
 * Create the Inquisition Armoury if this world should have one and does not.
 *
 * Called once at `ready`. Idempotent by the flag lookup above, GM-only, and a
 * no-op in every other line or ruleset. A failure is reported to the GM rather
 * than thrown: a missing armoury degrades requisition to the pre-#496 state,
 * which must not also take the ready hook down with it.
 * @returns {Promise<void>}
 */
export async function ensureInquisitionArmoury(): Promise<void> {
    try {
        const context: ArmourySpawnContext = {
            ruleset: WH40KSettings.getRuleset(),
            isGM: game.user.isGM,
            exists: findArmoury(game.actors) !== undefined,
            itemPilesActive: game.modules.get('item-piles')?.active === true,
        };
        if (!shouldSpawnArmoury(context)) return;

        const name = game.i18n.localize('WH40K.Armoury.Name');
        // eslint-disable-next-line no-restricted-syntax -- boundary: `Actor.create` takes Foundry's document-creation schema, which fvtt-types models as the full initialized Actor; the repo-wide pattern for it (documents/npc.ts, batch-create-dialog.ts)
        await Actor.create(armouryActorData(name) as unknown as Actor.CreateData);
        ui.notifications.info(game.i18n.format('WH40K.Armoury.Created', { name }));
    } catch (err) {
        console.error(`${SYSTEM_ID} | could not create the Inquisition Armoury`, err);
        if (game.user.isGM) ui.notifications.warn(game.i18n.localize('WH40K.Armoury.CreateFailed'));
    }
}
