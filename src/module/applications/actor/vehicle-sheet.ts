/**
 * @file VehicleSheet - Dedicated sheet for vehicle/ship NPCs
 * Completely different layout optimized for vehicle combat and crew management
 * Phase 6 implementation for npcV2 actors with primaryUse="vehicle" or "ship"
 */

import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KNPC } from '../../documents/npc.ts';
import BaseActorSheet from './base-actor-sheet.ts';

/**
 * Vehicle/ship NPC characteristic shape (mirrors NPC characteristic schema).
 */
interface VehicleCharacteristicData {
    label?: string;
    short?: string;
    base?: number;
    modifier?: number;
    unnatural?: number;
    total?: number;
    bonus?: number;
}

/**
 * Vehicle/ship-only system extras. These fields are NOT in the NPCData
 * schema yet — the sheet reads them defensively pending schema growth.
 * Fields that already exist on `NPCData` (wounds, size, characteristics)
 * are inherited from `WH40KNPC['system']` and not redeclared here.
 */
interface VehicleSystemExtras {
    speed?: {
        cruising?: number;
        tactical?: number;
        notes?: string;
    };
    handling?: number;
    hull?: number;
}

/** Vehicle/ship-only crew extras read defensively (not on the NPC schema). */
interface VehicleCrewExtras {
    rating?: number;
    morale?: number;
}

/**
 * Prepared vehicle stats object exposed on the render context.
 */
interface PreparedVehicleStats {
    size: number;
    speed: { cruising: number; tactical: number; notes: string };
    handling: number;
    structure: { value: number; max: number; percent: number };
    hull: number;
    manoeuvrability: number;
}

interface PreparedCrewStats {
    required: number;
    rating: number;
    morale: number;
    notes: string;
}

interface PreparedCharacteristic {
    key: string;
    label: string | undefined;
    short: string | undefined;
    base: number | undefined;
    modifier: number | undefined;
    unnatural: number | undefined;
    total: number | undefined;
    bonus: number | undefined;
    hasUnnatural: boolean;
}

/**
 * Sheet render context shape — additive on top of the parent's
 * `Record<string, unknown>` return so we can add typed fields without
 * losing what the base class already populates.
 */
type VehicleActorSystem = WH40KNPC['system'] & VehicleSystemExtras;

interface PreparedTab {
    id: string;
    tab: string;
    group: string;
    label: string;
    active: boolean;
    cssClass: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: matches ApplicationV2._prepareContext return contract
interface VehicleSheetContext extends Record<string, unknown> {
    system?: VehicleActorSystem;
    items?: WH40KItem[];
    isVehicle?: boolean;
    isShip?: boolean;
    vehicleStats?: PreparedVehicleStats;
    crewStats?: PreparedCrewStats;
    characteristicsArray?: PreparedCharacteristic[];
    weapons?: WH40KItem[];
    vehicleTraits?: WH40KItem[];
    vehicleUpgrades?: WH40KItem[];
    components?: WH40KItem[];
    otherItems?: WH40KItem[];
    tabs?: PreparedTab[];
}

/**
 * NPC document with vehicle-typed `system`. The runtime document is a
 * standard `WH40KNPC` whose `system.primaryUse === 'vehicle' | 'ship'`; the
 * vehicle-only extras (hull, handling, crew.rating, crew.morale, …) are
 * read defensively pending schema growth.
 */
type VehicleActor = WH40KNPC & {
    system: VehicleActorSystem;
    rollCharacteristic: (characteristicKey: string, flavor?: string) => Promise<void>;
    rollSkill: (skillName: string, flavor?: string) => Promise<void>;
    rollInitiative: (options: { createCombatants?: boolean }) => Promise<void>;
};

/** Item with a roll() method (weapons). */
type RollableItem = WH40KItem & { roll: () => Promise<void> };

/**
 * Actor sheet for npcV2 actors used as vehicles/ships.
 * Provides specialized UI for vehicle combat, crew, and components.
 *
 * @extends {BaseActorSheet}
 */
export default class VehicleSheet extends BaseActorSheet {
    declare actor: VehicleActor;

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'actor', 'vehicle'],
        position: {
            width: 1000,
            height: 800,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'overview', group: 'primary' }],
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...BaseActorSheet.DEFAULT_OPTIONS.actions,
            rollCharacteristic: VehicleSheet.#rollCharacteristic,
            rollSkill: VehicleSheet.#rollSkill,
            rollWeapon: VehicleSheet.#rollWeapon,
            rollInitiative: VehicleSheet.#rollInitiative,
            adjustStructure: VehicleSheet.#adjustStructure,
            repairDamage: VehicleSheet.#repairDamage,
            modifyCrew: VehicleSheet.#modifyCrew,
            adjustCrewMorale: VehicleSheet.#adjustCrewMorale,
            toggleComponentActive: VehicleSheet.#toggleComponentActive,
            damageComponent: VehicleSheet.#damageComponent,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...(BaseActorSheet as typeof BaseActorSheet & { PARTS?: Record<string, ApplicationV2Config.PartConfiguration> }).PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle/tabs.hbs',
        },
        overview: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle/tab-overview.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        combat: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle/tab-combat.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        crew: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle/tab-crew.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        components: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle/tab-components.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        notes: {
            template: 'systems/wh40k-rpg/templates/actor/vehicle/tab-notes.hbs',
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext return contract
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context: VehicleSheetContext = {
            ...(await super._prepareContext(options)),
            isVehicle: true,
            isShip: this.actor.system.primaryUse === 'ship',
        };

        // Vehicle-specific context
        context.vehicleStats = this._prepareVehicleStats(context);
        context.crewStats = this._prepareCrewStats(context);
        context.characteristicsArray = this._prepareCharacteristics(context);

        // Categorize items
        this._prepareItems(context);

        // Prepare tabs
        context.tabs = this._prepareVehicleTabs();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare vehicle stats for display.
     * @param {object} context - The render context.
     * @returns {object} Vehicle stats object.
     * @protected
     */
    _prepareVehicleStats(_context: VehicleSheetContext): PreparedVehicleStats {
        const sys = this.actor.system;
        const speed = sys.speed ?? {};
        const woundsValue = sys.wounds.value;
        const woundsMax = sys.wounds.max;

        return {
            size: sys.size,
            speed: {
                cruising: speed.cruising ?? 0,
                tactical: speed.tactical ?? 0,
                notes: speed.notes ?? '',
            },
            handling: sys.handling ?? 0,
            structure: {
                value: woundsValue,
                max: woundsMax,
                percent: Math.round((woundsValue / Math.max(1, woundsMax)) * 100),
            },
            hull: sys.hull ?? 0,
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
    _prepareCrewStats(_context: VehicleSheetContext): PreparedCrewStats {
        const crew = this.actor.system.crew as { required?: number; notes?: string; rating?: number; morale?: number } | undefined;

        return {
            required: crew?.required ?? 1,
            rating: crew?.rating ?? 30,
            morale: crew?.morale ?? 50,
            notes: crew?.notes ?? '',
        };
    }

    /* -------------------------------------------- */

    /**
     * Calculate manoeuvrability from handling and size.
     * @param {object} system - Actor system data.
     * @returns {number} Calculated manoeuvrability.
     * @protected
     */
    _calculateManoeuvrability(system: VehicleActorSystem): number {
        // Example: Handling - (Size modifier)
        const handling = system.handling ?? 0;
        const sizeMod = Math.floor(system.size / 2);
        return handling - sizeMod;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristics for display.
     * @param {object} context - The render context.
     * @returns {Array} Characteristics array.
     * @protected
     */
    _prepareCharacteristics(context: VehicleSheetContext): PreparedCharacteristic[] {
        const chars: Record<string, VehicleCharacteristicData> = context.system?.characteristics ?? {};
        const charArray: PreparedCharacteristic[] = [];

        for (const [key, char] of Object.entries(chars)) {
            charArray.push({
                key,
                label: char.label,
                short: char.short,
                base: char.base,
                modifier: char.modifier,
                unnatural: char.unnatural,
                total: char.total,
                bonus: char.bonus,
                hasUnnatural: (char.unnatural ?? 0) >= 2,
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
    _prepareItems(context: VehicleSheetContext): void {
        const weapons: WH40KItem[] = [];
        const vehicleTraits: WH40KItem[] = [];
        const vehicleUpgrades: WH40KItem[] = [];
        const components: WH40KItem[] = [];
        const other: WH40KItem[] = [];

        for (const item of context.items ?? []) {
            const itemType: string = item.type;
            switch (itemType) {
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
    _prepareVehicleTabs(): PreparedTab[] {
        const TabsCtor = this.constructor as typeof VehicleSheet;
        return TabsCtor.TABS.map((tab) => ({
            id: tab.tab,
            tab: tab.tab,
            group: tab.group ?? 'primary',
            label: game.i18n.localize(tab.label),
            active: this.tabGroups[tab.group ?? 'primary'] === tab.tab,
            cssClass: tab.cssClass ?? '',
        }));
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._preparePartContext signature contract
    async _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const partContext = await super._preparePartContext(partId, context, options);

        // Add tab metadata for all tab parts
        const tabParts = ['overview', 'combat', 'crew', 'components', 'notes'];
        if (tabParts.includes(partId)) {
            const TabsCtor = this.constructor as typeof VehicleSheet;
            const tabConfig = TabsCtor.TABS.find((t) => t.tab === partId);
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
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle characteristic roll.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollCharacteristic(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const char = target.dataset.characteristic;
        if (char === undefined || char === '') return;

        await this.actor.rollCharacteristic(char);
    }

    /* -------------------------------------------- */

    /**
     * Handle skill roll.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollSkill(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const skill = target.dataset.skill;
        const spec = target.dataset.specialization;
        if (skill === undefined || skill === '') return;

        await this.actor.rollSkill(skill, spec);
    }

    /* -------------------------------------------- */

    /**
     * Handle weapon roll.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollWeapon(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (itemId === undefined || itemId === '') return;

        const item = this.actor.items.get(itemId) as RollableItem | undefined;
        if (!item) return;

        await item.roll();
    }

    /* -------------------------------------------- */

    /**
     * Handle initiative roll.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollInitiative(this: VehicleSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        await this.actor.rollInitiative({ createCombatants: true });
    }

    /* -------------------------------------------- */

    /**
     * Adjust structure/wounds.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #adjustStructure(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta ?? '0', 10) || 0;
        const { value: current, max } = this.actor.system.wounds;

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
    static async #repairDamage(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const amount = parseInt(target.dataset.amount ?? '1', 10) || 1;
        const { value: current, max } = this.actor.system.wounds;

        const newValue = Math.min(max, current + amount);
        await this.actor.update({ 'system.wounds.value': newValue });

        ui.notifications.info(`Repaired ${String(amount)} structure points.`);
    }

    /* -------------------------------------------- */

    /**
     * Modify crew rating.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #modifyCrew(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta ?? '0', 10) || 0;
        const crew = this.actor.system.crew as typeof this.actor.system.crew & VehicleCrewExtras;
        const current = crew.rating ?? 30;

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
    static async #adjustCrewMorale(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset.delta ?? '0', 10) || 0;
        const crew = this.actor.system.crew as typeof this.actor.system.crew & VehicleCrewExtras;
        const current = crew.morale ?? 50;

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
    static async #toggleComponentActive(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (itemId === undefined || itemId === '') return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        const componentSystem = item.system as { active?: boolean };
        await item.update({ 'system.active': componentSystem.active !== true });
    }

    /* -------------------------------------------- */

    /**
     * Apply damage to component.
     * @this {VehicleSheet}
     * @param {Event} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #damageComponent(this: VehicleSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (itemId === undefined || itemId === '') return;

        const item = this.actor.items.get(itemId);
        if (!item) return;

        // Toggle damaged state or apply specific damage
        const componentSystem = item.system as { damaged?: boolean };
        const damaged = componentSystem.damaged === true;
        await item.update({ 'system.damaged': !damaged });

        ui.notifications.info(`${item.name} ${damaged ? 'repaired' : 'damaged'}.`);
    }
}
