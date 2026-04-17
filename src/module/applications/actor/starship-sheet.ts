/**
 * @file StarshipSheet - Starship actor sheet using ApplicationV2 with PARTS system
 */

import WH40K from '../../config.ts';
import type { WH40KStarship } from '../../documents/starship.ts';
import BaseActorSheet from './base-actor-sheet.ts';

/**
 * Actor sheet for Starship type actors.
 * Uses V2 PARTS system for modular template rendering.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class StarshipSheet extends BaseActorSheet {
    declare actor: WH40KStarship;
    declare document: WH40KStarship;

    /** @override */
    static DEFAULT_OPTIONS = {
        /* eslint-disable @typescript-eslint/unbound-method */
        actions: {
            fireShipWeapon: StarshipSheet.#fireShipWeapon,
            rollInitiative: StarshipSheet.#rollInitiative,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        classes: ['starship'],
        position: {
            width: 900,
            height: 700,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'stats', group: 'primary' }],
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        header: {
            template: 'systems/wh40k-rpg/templates/actor/starship/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tabs.hbs',
        },
        stats: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-stats.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        components: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-components.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        weapons: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-weapons.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        crew: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-crew.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        history: {
            template: 'systems/wh40k-rpg/templates/actor/starship/tab-history.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'stats', label: 'WH40K.Starship.Tabs.Stats', group: 'primary', cssClass: 'tab-stats' },
        { tab: 'components', label: 'WH40K.Starship.Tabs.Components', group: 'primary', cssClass: 'tab-components' },
        { tab: 'weapons', label: 'WH40K.Starship.Tabs.Weapons', group: 'primary', cssClass: 'tab-weapons' },
        { tab: 'crew', label: 'WH40K.Starship.Tabs.Crew', group: 'primary', cssClass: 'tab-crew' },
        { tab: 'history', label: 'WH40K.Starship.Tabs.History', group: 'primary', cssClass: 'tab-history' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'stats',
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context: any = await super._prepareContext(options);
        context.dh = CONFIG.wh40k || WH40K;

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
    _prepareShipData(context: any): void {
        const items = this.actor.items;

        // Get ship components grouped by type
        context.shipComponents = items.filter((item: any) => item.type === 'shipComponent');
        context.shipWeapons = items.filter((item: any) => item.type === 'shipWeapon');
        context.shipUpgrades = items.filter((item: any) => item.type === 'shipUpgrade');
        context.shipRoles = items.filter((item: any) => item.type === 'shipRole');

        // Calculate power and space usage (use DataModel fields)
        context.powerGenerated = 0;
        context.powerUsed = 0;
        context.spaceUsed = 0;

        for (const component of context.shipComponents) {
            if (component.system.condition === 'functional') {
                context.powerGenerated += component.system.power?.generated || 0;
                context.powerUsed += component.system.power?.used || 0;
                context.spaceUsed += component.system.space || 0;
            }
        }

        for (const weapon of context.shipWeapons) {
            context.powerUsed += weapon.system.power || 0;
            context.spaceUsed += weapon.system.space || 0;
        }

        for (const upgrade of context.shipUpgrades) {
            context.powerGenerated += upgrade.system.power?.generated || 0;
            context.powerUsed += upgrade.system.power?.used || 0;
            context.spaceUsed += upgrade.system.space || 0;
        }

        context.powerAvailable = context.powerGenerated - context.powerUsed;
        context.spaceAvailable = (this.actor.system.space?.total || 0) - context.spaceUsed;
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    async _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const partContext = await super._preparePartContext(partId, context, options);

        // Add tab metadata for tab parts
        if (['stats', 'components', 'weapons', 'crew', 'history'].includes(partId)) {
            const tabConfig = (this.constructor as unknown as { TABS: Array<Record<string, unknown>> }).TABS.find((t: any) => t.tab === partId);
            partContext.tab = {
                id: partId,
                group: tabConfig?.group || 'primary',
                active: this.tabGroups.primary === partId,
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
    static async #fireShipWeapon(this: any, event: Event, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-item-id]') as HTMLElement | null)?.dataset.itemId;
        const weapon = this.actor.items.get(itemId);
        if (!weapon) return;

        const cardData = {
            actor: this.actor,
            weapon: weapon,
            crewRating: this.actor.system.crew?.crewRating || 30,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs', cardData);

        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: html,
        } as any);
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling starship initiative.
     * @this {StarshipSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(this: any, event: Event, target: HTMLElement): Promise<void> {
        await this.actor.rollInitiative?.();
    }
}
