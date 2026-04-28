/**
 * @file StarshipSheet - Starship actor sheet using ApplicationV2 with PARTS system
 */

import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KStarship } from '../../documents/starship.ts';
import BaseActorSheet from './base-actor-sheet.ts';

/**
 * Actor sheet for Starship type actors.
 * Uses V2 PARTS system for modular template rendering.
 */
export default class StarshipSheet extends BaseActorSheet {
    declare actor: WH40KStarship;
    declare document: WH40KStarship;

    /** @override */
    static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        actions: {
            ...BaseActorSheet.DEFAULT_OPTIONS.actions,
            fireShipWeapon: StarshipSheet.#fireShipWeapon,
            rollInitiative: StarshipSheet.#rollInitiative,
        },
        classes: ['starship'],
        position: {
            width: 900,
            height: 700,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'stats', group: 'primary' }],
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...BaseActorSheet.PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/starship/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tabs.hbs',
        },
        stats: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-stats.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        components: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-components.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        weapons: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-weapons.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        crew: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-crew.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        history: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-history.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS: HandlebarsApplicationV14.TabDescriptor[] = [
        { tab: 'stats', label: 'WH40K.Starship.Tabs.Stats', group: 'primary', cssClass: 'tab-stats' },
        { tab: 'components', label: 'WH40K.Starship.Tabs.Components', group: 'primary', cssClass: 'tab-components' },
        { tab: 'weapons', label: 'WH40K.Starship.Tabs.Weapons', group: 'primary', cssClass: 'tab-weapons' },
        { tab: 'crew', label: 'WH40K.Starship.Tabs.Crew', group: 'primary', cssClass: 'tab-crew' },
        { tab: 'history', label: 'WH40K.Starship.Tabs.History', group: 'primary', cssClass: 'tab-history' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups: HandlebarsApplicationV14.TabGroupsState = {
        primary: 'stats',
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        // isGM + dh now come from BaseActorSheet._prepareCommonContext via super.

        // Prepare ship-specific data
        this._prepareShipData(context);

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare starship-specific data for the template.
     * @param {object} context  The template render context.
     * @protected
     */
    _prepareShipData(context: Record<string, unknown>): void {
        const items = this.actor.items;

        // Get ship components grouped by type
        context.shipComponents = items.filter((item: WH40KItem) => item.type === 'shipComponent');
        context.shipWeapons = items.filter((item: WH40KItem) => item.type === 'shipWeapon');
        context.shipUpgrades = items.filter((item: WH40KItem) => item.type === 'shipUpgrade');
        context.shipRoles = items.filter((item: WH40KItem) => item.type === 'shipRole');

        // Calculate power and space usage (use DataModel fields)
        let powerGenerated = 0;
        let powerUsed = 0;
        let spaceUsed = 0;

        for (const component of context.shipComponents as WH40KItem[]) {
            const sys = component.system as {
                condition?: string;
                power?: { generated?: number; used?: number };
                space?: number;
            };
            if (sys.condition === 'functional') {
                powerGenerated += sys.power?.generated || 0;
                powerUsed += sys.power?.used || 0;
                spaceUsed += sys.space || 0;
            }
        }

        for (const weapon of context.shipWeapons as WH40KItem[]) {
            const sys = weapon.system as { power?: number; space?: number };
            powerUsed += sys.power || 0;
            spaceUsed += sys.space || 0;
        }

        for (const upgrade of context.shipUpgrades as WH40KItem[]) {
            const sys = upgrade.system as {
                power?: { generated?: number; used?: number };
                space?: number;
            };
            powerGenerated += sys.power?.generated || 0;
            powerUsed += sys.power?.used || 0;
            spaceUsed += sys.space || 0;
        }

        context.powerGenerated = powerGenerated;
        context.powerUsed = powerUsed;
        context.spaceUsed = spaceUsed;
        context.powerAvailable = powerGenerated - powerUsed;
        context.spaceAvailable = ((this.actor.system as { space?: { total?: number } }).space?.total || 0) - spaceUsed;
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    async _preparePartContext(partId: string, context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const partContext = await super._preparePartContext(partId, context, options);

        // Add tab metadata for tab parts
        const tabParts = ['stats', 'components', 'weapons', 'crew', 'history'];
        if (tabParts.includes(partId)) {
            const tabConfig = (this.constructor as any).TABS.find((t: HandlebarsApplicationV14.TabDescriptor) => t.tab === partId);
            partContext.tab = {
                id: partId,
                group: tabConfig?.group || 'primary',
                active: this.tabGroups[tabConfig?.group || 'primary'] === partId,
                cssClass: tabConfig?.cssClass || '',
            };
        }

        return partContext;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle firing a ship weapon.
     * @this {StarshipSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #fireShipWeapon(this: StarshipSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId;
        const weapon = this.actor.items.get(itemId ?? '');
        if (!weapon) return;

        const cardData = {
            actor: this.actor,
            weapon: weapon,
            crewRating: (this.actor.system as { crew?: { crewRating?: number } }).crew?.crewRating || 30,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs', cardData);

        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: html,
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling starship initiative.
     * @this {StarshipSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(this: StarshipSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        await this.actor.rollInitiative?.();
    }
}
