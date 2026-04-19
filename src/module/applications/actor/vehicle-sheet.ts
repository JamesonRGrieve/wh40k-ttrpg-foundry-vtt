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
// @ts-expect-error - TS2417 static side inheritance
export default class VehicleSheet extends BaseActorSheet {
    declare actor: WH40KVehicle;
    declare document: WH40KVehicle;

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'actor', 'vehicle-v2'],
        position: {
            width: 1000,
            height: 800,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'overview', group: 'primary' }],
        actions: {
            // Vehicle-specific actions
            rollCharacteristic: VehicleSheet.#rollCharacteristic,
            rollSkill: VehicleSheet.#rollSkill,
            rollWeapon: VehicleSheet.#rollWeapon,
            rollInitiative: VehicleSheet.#rollInitiative,

            // Vehicle damage/repair
            adjustStructure: VehicleSheet.#adjustStructure,
            repairDamage: VehicleSheet.#repairDamage,

            // Crew management
            modifyCrew: VehicleSheet.#modifyCrew,
            adjustCrewMorale: VehicleSheet.#adjustCrewMorale,

            // Component actions
            toggleComponentActive: VehicleSheet.#toggleComponentActive,
            damageComponent: VehicleSheet.#damageComponent,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        header: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tabs.hbs',
        },
        overview: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-overview.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        combat: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-combat.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        crew: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-crew.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        components: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-components.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
        notes: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle-v2/tab-notes.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'overview', label: 'WH40K.Tabs.Overview', group: 'primary', cssClass: 'tab-overview' },
        { tab: 'combat', label: 'WH40K.Tabs.Combat', group: 'primary', cssClass: 'tab-combat' },
        { tab: 'crew', label: 'WH40K.Vehicle.Crew', group: 'primary', cssClass: 'tab-crew' },
        { tab: 'components', label: 'WH40K.Vehicle.Components', group: 'primary', cssClass: 'tab-components' },
        { tab: 'notes', label: 'WH40K.NPC.Notes', group: 'primary', cssClass: 'tab-notes' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'overview',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context: any = {
            actor: this.actor,
            system: this.actor.system,
            source: this.isEditable ? this.actor.system._source : this.actor.system,
            fields: this.actor.system.schema?.fields ?? {},
            effects: this.actor.getEmbeddedCollection('ActiveEffect').contents,
            items: Array.from(this.actor.items),
            limited: this.actor.limited,
            rollableClass: this.isEditable ? 'rollable' : '',
            isGM: (game as any).user.isGM,
            editable: this.isEditable,
            isVehicle: true,
            isShip: this.actor.system.primaryUse === 'ship',
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
    _prepareVehicleStats(context: Record<string, unknown>): any {
        const sys = context.system as any;

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
    _prepareCrewStats(context: Record<string, unknown>): any {
        const sys = context.system as any;

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
    _prepareCharacteristics(context: Record<string, unknown>): any {
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
    _prepareItems(context: Record<string, any>): void {
        const weapons = [];
        const vehicleTraits = [];
        const vehicleUpgrades = [];
        const components = [];
        const other = [];

        for (const item of context.items) {
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
        return (this.constructor as any).TABS.map((tab: any) => ({
            id: tab.tab,
            tab: tab.tab,
            group: tab.group,
            label: (game as any).i18n.localize(tab.label),
            active: this.tabGroups[tab.group] === tab.tab,
            cssClass: tab.cssClass,
        }));
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const partContext = await super._preparePartContext(partId, context, options);

        // Add tab metadata for all tab parts
        const tabParts = ['overview', 'combat', 'crew', 'components', 'notes'];
        if (tabParts.includes(partId)) {
            const tabConfig = (this.constructor as any).TABS.find((t: any) => t.tab === partId);
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
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle characteristic roll.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollCharacteristic(this: any, event: Event, target: HTMLElement): Promise<void> {
        const char = target.dataset.characteristic;
        if (!char) return;

        await this.actor.rollCharacteristic(char);
    }

    /* -------------------------------------------- */

    /**
     * Handle skill roll.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollSkill(this: any, event: Event, target: HTMLElement): Promise<void> {
        const skill = target.dataset.skill;
        const spec = target.dataset.specialization;
        if (!skill) return;

        await this.actor.rollSkill(skill, spec);
    }

    /* -------------------------------------------- */

    /**
     * Handle weapon roll.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollWeapon(this: any, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        await item.roll();
    }

    /* -------------------------------------------- */

    /**
     * Handle initiative roll.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollInitiative(this: any, event: Event, target: HTMLElement): Promise<void> {
        await this.actor.rollInitiative({ createCombatants: true });
    }

    /* -------------------------------------------- */

    /**
     * Adjust structure/wounds.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #adjustStructure(this: any, event: Event, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta) || 0;
        const current = this.actor.system.wounds.value;
        const max = this.actor.system.wounds.max;

        const newValue = Math.max(0, Math.min(max, current + delta));
        await this.actor.update({ 'system.wounds.value': newValue });
    }

    /* -------------------------------------------- */

    /**
     * Repair damage.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #repairDamage(this: any, event: Event, target: HTMLElement): Promise<void> {
        const amount = parseInt(target.dataset.amount) || 1;
        const current = this.actor.system.wounds.value;
        const max = this.actor.system.wounds.max;

        const newValue = Math.min(max, current + amount);
        await this.actor.update({ 'system.wounds.value': newValue });

        ui.notifications.info(`Repaired ${amount} structure points.`);
    }

    /* -------------------------------------------- */

    /**
     * Modify crew rating.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #modifyCrew(this: any, event: Event, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta) || 0;
        const current = this.actor.system.crew?.rating || 30;

        const newValue = Math.max(1, Math.min(100, current + delta));
        await this.actor.update({ 'system.crew.rating': newValue });
    }

    /* -------------------------------------------- */

    /**
     * Adjust crew morale.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #adjustCrewMorale(this: any, event: Event, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta) || 0;
        const current = this.actor.system.crew?.morale || 50;

        const newValue = Math.max(0, Math.min(100, current + delta));
        await this.actor.update({ 'system.crew.morale': newValue });
    }

    /* -------------------------------------------- */

    /**
     * Toggle component active state.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #toggleComponentActive(this: any, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        await item.update({ 'system.active': !item.system.active });
    }

    /* -------------------------------------------- */

    /**
     * Apply damage to component.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #damageComponent(this: any, event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        // Toggle damaged state or apply specific damage
        const damaged = item.system.damaged || false;
        await item.update({ 'system.damaged': !damaged });

        ui.notifications.info(`${item.name} ${damaged ? 'repaired' : 'damaged'}.`);
    }
}
