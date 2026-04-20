/**
 * @file VehicleSheetV2 - Dedicated sheet for vehicle/ship NPCs
 * Completely different layout optimized for vehicle combat and crew management
 * Phase 6 implementation for npcV2 actors with primaryUse="vehicle" or "ship"
 */

import type { WH40KVehicle } from '../../documents/vehicle.ts';
import BaseActorSheet from './base-actor-sheet.ts';

/**
 * Actor sheet for npcV2 actors used as vehicles/ships.
 * Provides specialized UI for vehicle combat, crew, and components.
 *
 * @extends {BaseActorSheet}
 */
export default class VehicleSheet extends BaseActorSheet {
    declare actor: WH40KVehicle;
    declare document: WH40KVehicle;

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'actor', 'vehicle-v2'],
        position: {
            width: 1000,
            height: 800,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'overview', group: 'primary' }],
        actions: {
            ...BaseActorSheet.DEFAULT_OPTIONS.actions,
            rollCharacteristic: (VehicleSheet as any).#rollCharacteristic,
            rollSkill: (VehicleSheet as any).#rollSkill,
            rollWeapon: (VehicleSheet as any).#rollWeapon,
            rollInitiative: (VehicleSheet as any).#rollInitiative,
            adjustStructure: (VehicleSheet as any).#adjustStructure,
            repairDamage: (VehicleSheet as any).#repairDamage,
            modifyCrew: (VehicleSheet as any).#modifyCrew,
            adjustCrewMorale: (VehicleSheet as any).#adjustCrewMorale,
            toggleComponentActive: (VehicleSheet as any).#toggleComponentActive,
            damageComponent: (VehicleSheet as any).#damageComponent,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...BaseActorSheet.PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tabs.hbs',
        },
        overview: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-overview.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        combat: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-combat.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        crew: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-crew.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        components: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-components.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        notes: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-notes.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS: HandlebarsApplicationV14.TabDescriptor[] = [
        { tab: 'overview', label: 'WH40K.Tabs.Overview', group: 'primary', cssClass: 'tab-overview' },
        { tab: 'combat', label: 'WH40K.Tabs.Combat', group: 'primary', cssClass: 'tab-combat' },
        { tab: 'crew', label: 'WH40K.Vehicle.Crew', group: 'primary', cssClass: 'tab-crew' },
        { tab: 'components', label: 'WH40K.Vehicle.Components', group: 'primary', cssClass: 'tab-components' },
        { tab: 'notes', label: 'WH40K.NPC.Notes', group: 'primary', cssClass: 'tab-notes' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups: HandlebarsApplicationV14.TabGroupsState = {
        primary: 'overview',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = {
            ...(await super._prepareContext(options)),
            isVehicle: true,
            isShip: (this.actor.system as any).primaryUse === 'ship',
        };

        // Vehicle-specific context
        context.vehicleStats = this._prepareVehicleStats(context);
        context.crewStats = this._prepareCrewStats(context);
        context.characteristicsArray = this._prepareCharacteristics(context);

        // Categorize items
        await this._prepareItems(context);

        // Prepare tabs
        context.tabs = this._prepareTabs();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare vehicle stats for display.
     * @param {object} context - The render context.
     * @returns {object} Vehicle stats object.
     * @protected
     */
    _prepareVehicleStats(context: Record<string, unknown>): Record<string, unknown> {
        const sys = (context.system as any) ?? {};

        return {
            size: sys.size || 4,
            speed: {
                cruising: sys.speed?.cruising || 0,
                tactical: sys.speed?.tactical || 0,
                notes: sys.speed?.notes || '',
            },
            handling: sys.handling || 0,
            structure: {
                value: sys.wounds?.value || 0,
                max: sys.wounds?.max || 0,
                percent: Math.round(((sys.wounds?.value || 0) / Math.max(1, sys.wounds?.max || 1)) * 100),
            },
            hull: sys.hull || 0,
            manoeuvrability: this._calculateManoeuvrability(sys),
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare crew stats for display.
     * @param {object} context - The render context.
     * @returns {object} Crew stats object.
     * @protected
     */
    _prepareCrewStats(context: Record<string, unknown>): Record<string, unknown> {
        const sys = (context.system as any) ?? {};

        return {
            required: sys.crew?.required || 1,
            rating: sys.crew?.rating || 30,
            morale: sys.crew?.morale || 50,
            notes: sys.crew?.notes || '',
        };
    }

    /* -------------------------------------------- */

    /**
     * Calculate manoeuvrability from handling and size.
     * @param {object} system - Actor system data.
     * @returns {number} Calculated manoeuvrability.
     * @protected
     */
    _calculateManoeuvrability(system: any): number {
        // Example: Handling - (Size modifier)
        const handling = system.handling || 0;
        const sizeMod = Math.floor((system.size || 4) / 2);
        return handling - sizeMod;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristics for display.
     * @param {object} context - The render context.
     * @returns {Array} Characteristics array.
     * @protected
     */
    _prepareCharacteristics(context: Record<string, unknown>): Record<string, unknown>[] {
        const chars = (context.system as any).characteristics || {};
        const charArray = [];

        for (const [key, char] of Object.entries(chars) as any) {
            charArray.push({
                key,
                label: char.label,
                short: char.short,
                base: char.base,
                modifier: char.modifier,
                unnatural: char.unnatural,
                total: char.total,
                bonus: char.bonus,
                hasUnnatural: (char.unnatural || 0) >= 2,
            });
        }

        return charArray;
    }

    /* -------------------------------------------- */

    /**
     * Categorize and prepare items.
     * @param {object} context - The render context.
     * @protected
     */
    async _prepareItems(context: Record<string, unknown>): Promise<void> {
        const weapons: any[] = [];
        const vehicleTraits: any[] = [];
        const vehicleUpgrades: any[] = [];
        const components: any[] = [];
        const other: any[] = [];

        for (const item of (context as any).items) {
            switch (item.type) {
                case 'weapon':
                case 'shipWeapon':
                    weapons.push(item);
                    break;
                case 'vehicleTrait':
                    vehicleTraits.push(item);
                    break;
                case 'vehicleUpgrade':
                    vehicleUpgrades.push(item);
                    break;
                case 'shipComponent':
                    components.push(item);
                    break;
                default:
                    other.push(item);
            }
        }

        context.weapons = weapons;
        context.vehicleTraits = vehicleTraits;
        context.vehicleUpgrades = vehicleUpgrades;
        context.components = components;
        context.otherItems = other;
    }

    /* -------------------------------------------- */

    /**
     * Prepare tabs configuration.
     * @returns {Array} Tabs configuration array.
     * @protected
     */
    _prepareTabs(): Record<string, unknown>[] {
        return (this.constructor as any).TABS.map((tab: HandlebarsApplicationV14.TabDescriptor) => ({
            id: tab.tab,
            tab: tab.tab,
            group: tab.group,
            label: game.i18n.localize(tab.label),
            active: this.tabGroups[tab.group ?? 'primary'] === tab.tab,
            cssClass: tab.cssClass,
        }));
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _preparePartContext(partId: string, context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const partContext = await super._preparePartContext(partId, context, options);

        // Add tab metadata for all tab parts
        const tabParts = ['overview', 'combat', 'crew', 'components', 'notes'];
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
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle characteristic roll.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollCharacteristic(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const char = target.dataset.characteristic;
        if (!char) return;

        await this.actor.rollCharacteristic(char);
    }

    /* -------------------------------------------- */

    /**
     * Handle skill roll.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollSkill(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const skill = target.dataset.skill;
        const spec = target.dataset.specialization;
        if (!skill) return;

        await this.actor.rollSkill(skill, spec);
    }

    /* -------------------------------------------- */

    /**
     * Handle weapon roll.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollWeapon(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        await (item as any).roll();
    }

    /* -------------------------------------------- */

    /**
     * Handle initiative roll.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollInitiative(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        await this.actor.rollInitiative({ createCombatants: true });
    }

    /* -------------------------------------------- */

    /**
     * Adjust structure/wounds.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #adjustStructure(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta ?? '0') || 0;
        const current = (this.actor.system as any).wounds.value;
        const max = (this.actor.system as any).wounds.max;

        const newValue = Math.max(0, Math.min(max, current + delta));
        await this.actor.update({ 'system.wounds.value': newValue });
    }

    /* -------------------------------------------- */

    /**
     * Repair damage.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #repairDamage(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const amount = parseInt(target.dataset.amount ?? '1') || 1;
        const current = (this.actor.system as any).wounds.value;
        const max = (this.actor.system as any).wounds.max;

        const newValue = Math.min(max, current + amount);
        await this.actor.update({ 'system.wounds.value': newValue });

        ui.notifications.info(`Repaired ${amount} structure points.`);
    }

    /* -------------------------------------------- */

    /**
     * Modify crew rating.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #modifyCrew(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta ?? '0') || 0;
        const current = (this.actor.system as any).crew?.rating || 30;

        const newValue = Math.max(1, Math.min(100, current + delta));
        await this.actor.update({ 'system.crew.rating': newValue });
    }

    /* -------------------------------------------- */

    /**
     * Adjust crew morale.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #adjustCrewMorale(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta ?? '0') || 0;
        const current = (this.actor.system as any).crew?.morale || 50;

        const newValue = Math.max(0, Math.min(100, current + delta));
        await this.actor.update({ 'system.crew.morale': newValue });
    }

    /* -------------------------------------------- */

    /**
     * Toggle component active state.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #toggleComponentActive(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        await item.update({ 'system.active': !(item.system as any).active });
    }

    /* -------------------------------------------- */

    /**
     * Apply damage to component.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #damageComponent(this: VehicleSheet, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        // Toggle damaged state or apply specific damage
        const damaged = (item.system as any).damaged || false;
        await item.update({ 'system.damaged': !damaged });

        ui.notifications.info(`${item.name} ${damaged ? 'repaired' : 'damaged'}.`);
    }
}
