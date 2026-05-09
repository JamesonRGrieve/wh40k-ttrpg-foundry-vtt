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
    /** @override */
    static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...BaseActorSheet.DEFAULT_OPTIONS.actions,
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
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...((BaseActorSheet as typeof BaseActorSheet & { PARTS?: Record<string, ApplicationV2Config.PartConfiguration> }).PARTS ?? {}),
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
    /* eslint-disable no-restricted-syntax -- labels here ARE WH40K.* keys; the rule's literal-detection cannot see that */
    static TABS: HandlebarsApplicationV14.TabDescriptor[] = [
        { tab: 'stats', label: 'WH40K.Starship.Tabs.Stats', group: 'primary', cssClass: 'tab-stats' },
        { tab: 'components', label: 'WH40K.Starship.Tabs.Components', group: 'primary', cssClass: 'tab-components' },
        { tab: 'weapons', label: 'WH40K.Starship.Tabs.Weapons', group: 'primary', cssClass: 'tab-weapons' },
        { tab: 'crew', label: 'WH40K.Starship.Tabs.Crew', group: 'primary', cssClass: 'tab-crew' },
        { tab: 'history', label: 'WH40K.Starship.Tabs.History', group: 'primary', cssClass: 'tab-history' },
    ];
    /* eslint-enable no-restricted-syntax */

    /* -------------------------------------------- */

    /** @override */
    tabGroups: HandlebarsApplicationV14.TabGroupsState = {
        primary: 'stats',
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: render context is an untyped Record per ApplicationV2 contract
    _prepareShipData(context: Record<string, unknown>): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KStarship for ship-specific access
        const actor = this.actor as unknown as WH40KStarship;
        const items = actor.items;

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
                powerGenerated += sys.power?.generated ?? 0;
                powerUsed += sys.power?.used ?? 0;
                spaceUsed += sys.space ?? 0;
            }
        }

        for (const weapon of context.shipWeapons as WH40KItem[]) {
            const sys = weapon.system as { power?: number; space?: number };
            powerUsed += sys.power ?? 0;
            spaceUsed += sys.space ?? 0;
        }

        for (const upgrade of context.shipUpgrades as WH40KItem[]) {
            const sys = upgrade.system as {
                power?: { generated?: number; used?: number };
                space?: number;
            };
            powerGenerated += sys.power?.generated ?? 0;
            powerUsed += sys.power?.used ?? 0;
            spaceUsed += sys.space ?? 0;
        }

        context.powerGenerated = powerGenerated;
        context.powerUsed = powerUsed;
        context.spaceUsed = spaceUsed;
        context.powerAvailable = powerGenerated - powerUsed;
        context.spaceAvailable = ((this.actor.system as { space?: { total?: number } }).space?.total ?? 0) - spaceUsed;
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _preparePartContext signature uses untyped records
    async _preparePartContext(partId: string, context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: super signature varies between V13/V14 typings
        const partContext = await super._preparePartContext(partId, context, options as unknown as Record<string, unknown>);

        // Add tab metadata for tab parts
        const tabParts = ['stats', 'components', 'weapons', 'crew', 'history'];
        if (tabParts.includes(partId)) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: subclass TABS not on shipped ApplicationV2 ctor type
            const ctor = this.constructor as unknown as { TABS: HandlebarsApplicationV14.TabDescriptor[] };
            const tabConfig = ctor.TABS.find((t: HandlebarsApplicationV14.TabDescriptor) => t.tab === partId);
            const group = tabConfig?.group ?? 'primary';
            partContext.tab = {
                id: partId,
                group,
                active: this.tabGroups[group] === partId,
                cssClass: tabConfig?.cssClass ?? '',
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KStarship for ship-specific access
        const actor = this.actor as unknown as WH40KStarship;
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
        const weapon = actor.items.get(itemId ?? '');
        if (!weapon) return;

        const cardData = {
            actor,
            weapon: weapon,
            crewRating: (actor.system as { crew?: { crewRating?: number } }).crew?.crewRating ?? 30,
            gameSystem: (actor.system as { gameSystem?: string }).gameSystem,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs', cardData);

        const speaker = ChatMessage.getSpeaker({
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KStarship satisfies Actor.Implementation but typings widen
            actor: actor as unknown as Actor.Implementation,
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload not in shipped types for our card shape
        const payload = { user: game.user.id, speaker, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        void ChatMessage.create(payload);
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling starship initiative.
     * @this {StarshipSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(this: StarshipSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollInitiative is defined on Starship document; not on Actor.Implementation
        const a = this.actor as unknown as { rollInitiative?: () => Promise<void> };
        await a.rollInitiative?.();
    }
}
