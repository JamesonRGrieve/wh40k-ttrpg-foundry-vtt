/**
 * @file LootActorSheet — sheet for the content-agnostic `loot` pile actor.
 *
 * A loot pile has no characteristics or skills, so the creature-oriented
 * context prep inherited from {@link BaseActorSheet} is short-circuited the
 * same way {@link VehicleSheet} does. The sheet is a single flat inventory
 * with per-item "take" controls plus a "take everything" action; pickup
 * delegates to {@link ItemDropManager} so the transfer logic stays shared
 * and unit-tested.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { t } from '../../i18n/t.ts';
import { ItemDropManager } from '../../managers/item-drop-manager.ts';
import BaseActorSheet from './base-actor-sheet.ts';

interface LootItemRow {
    id: string;
    name: string;
    img: string;
    type: string;
    quantity: number | null;
    weight: number | null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: matches ApplicationV2._prepareContext return contract
interface LootSheetContext extends Record<string, unknown> {
    lootItems?: LootItemRow[];
    lootTotalWeight?: number;
    lootSource?: string;
    isEmpty?: boolean;
}

export default class LootActorSheet extends BaseActorSheet {
    declare actor: WH40KBaseActor;

    /** @override */
    static override DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'actor', 'loot'],
        position: { width: 480, height: 560 },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...BaseActorSheet.DEFAULT_OPTIONS.actions,
            pickupAll: LootActorSheet.#pickupAll,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/actor/loot/loot-sheet.hbs',
            scrollable: ['.wh40k-loot-list'],
        },
    };

    /** @override */
    static TABS: HandlebarsApplicationV14.TabDescriptor[] = [];

    /** @override */
    override tabGroups: HandlebarsApplicationV14.TabGroupsState = {};

    /* -------------------------------------------- */
    /*  Context (loot has no characteristics/skills) */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: matches the mixin-erased base method signature
    override _prepareCharacteristicsHUD(_context: Record<string, unknown>): void {
        // Intentionally empty: a loot pile has no characteristics block.
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: matches the mixin-erased base method signature
    override _prepareSkills(_context: Record<string, unknown>): void {
        // Intentionally empty: a loot pile has no skills block.
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext return contract
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context: LootSheetContext = {
            ...(await super._prepareContext(options)),
        };

        const rows: LootItemRow[] = [];
        for (const item of this.actor.items) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is DataModel-backed; only optional physical fields are projected
            const sys = item.system as { weight?: number | null; quantity?: number | null } | undefined;
            rows.push({
                id: item.id,
                name: item.name,
                img: item.img ?? 'icons/svg/item-bag.svg',
                type: item.type,
                quantity: typeof sys?.quantity === 'number' ? sys.quantity : null,
                weight: typeof sys?.weight === 'number' ? sys.weight : null,
            });
        }
        rows.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
        context.lootItems = rows;
        context.isEmpty = rows.length === 0;

        // eslint-disable-next-line no-restricted-syntax -- boundary: loot system fields are DataModel-backed; projected to the display shape
        const lootSystem = this.actor.system as unknown as { totalWeight?: number; source?: { actorName?: string } };
        context.lootTotalWeight = typeof lootSystem.totalWeight === 'number' ? lootSystem.totalWeight : 0;
        const sourceName = lootSystem.source?.actorName ?? '';
        context.lootSource = sourceName.length > 0 ? t('WH40K.Loot.Source', { actor: sourceName }) : '';

        return context;
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Take everything in the pile onto the picker's controlled token (or
     * their assigned character). Resolution + transfer is shared with the
     * token-HUD pickup path via {@link ItemDropManager}.
     */
    static async #pickupAll(this: LootActorSheet): Promise<void> {
        const receiver = LootActorSheet.resolveReceiver();
        if (receiver == null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Warning.LootNoReceiver'));
            return;
        }
        const ok = await ItemDropManager.pickupLoot(receiver, this.actor);
        if (ok) await this.close();
    }

    /**
     * Resolve which actor should receive a pickup: the picker's controlled
     * non-loot token, else their assigned character. Shared selection logic
     * lives in {@link ItemDropManager.resolveReceivingActor}.
     */
    static resolveReceiver(): WH40KBaseActor | null {
        // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.tokens is the Foundry token layer; only the controlled actors are read
        const controlled = (canvas.tokens?.controlled ?? []) as Array<{ actor?: WH40KBaseActor | null }>;
        const userCharacter = (game.user.character as WH40KBaseActor | null | undefined) ?? null;
        return ItemDropManager.resolveReceivingActor<WH40KBaseActor>(controlled, userCharacter);
    }
}
