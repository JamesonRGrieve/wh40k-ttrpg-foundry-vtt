/**
 * @file CraftActorSheet - shared actor sheet for conventional craft
 * (terracraft / aircraft / watercraft). The three craft types extend a common
 * `vehicle` base DataModel and share the conventional-craft stat block
 * (directional armour, cruising/tactical speed, required crew, manoeuverability,
 * passengers, carrying capacity, structural integrity). Aircraft additionally
 * carry `altitude` / `ceiling`, surfaced conditionally via `isAircraft`.
 *
 * Renamed from the former VehicleSheet. Void/ship-scale craft use the dedicated
 * VoidcraftActorSheet instead.
 */

import type { VehicleCharacteristics } from '../../data/actor/vehicle.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { occupantsOf, unfilledCrew } from '../../rules/vehicle-occupancy.ts';
import BaseActorSheet from './base-actor-sheet.ts';

/** A single armour facing on a craft (front / side / rear). */
interface CraftArmourFacing {
    value: number;
    descriptor: string;
}

/**
 * Conventional-craft system shape (mirrors the shared `vehicle` base
 * DataModel plus the aircraft `altitude` / `ceiling` extension). Read off the
 * owning actor; the schema is owned by the data-model layer.
 */
interface CraftSystemData {
    locomotion?: string;
    type?: string;
    faction?: string;
    subfaction?: string;
    size: number;
    armour: {
        front: CraftArmourFacing;
        side: CraftArmourFacing;
        rear: CraftArmourFacing;
    };
    speed: {
        cruising: number;
        tactical: number;
        /** IM-only named zone-movement band; blank on the six FFG lines. */
        band: string;
        notes: string;
    };
    crew: {
        required: number;
        notes: string;
    };
    passengers: number;
    manoeuverability: number;
    carryingCapacity: number;
    integrity: {
        max: number;
        value: number;
        critical: number;
    };
    /**
     * Creature-style profile — an object on animate craft (daemon-engines /
     * walkers / Dreadnoughts), `null` on ordinary vehicles. Always present
     * (the DataModel defaults it to `null`), so never `undefined`.
     */
    characteristics: VehicleCharacteristics | null;
    /** Aircraft-only altitude tier + service ceiling. */
    altitude?: string;
    ceiling?: number;
    /** Shared `{value, chat, summary}` block — same shape items carry. */
    description: { value: string; chat: string; summary: string };
    /** Structured per-line provenance, collapsed to the active line. */
    source: { provenance: string; book: string; page: string; url: string; derivedFrom: string; errata: boolean };
    /** DW-only acquisition gate; blank on the other six lines. */
    renown?: string;
}

/** Craft actor — an Actor whose `system` is one of the craft DataModels. */
type CraftActor = Actor.Implementation & {
    system: CraftSystemData;
    rollCharacteristic: (characteristic: string) => void;
    rollSkill: (skill: string, specialization?: string) => void;
    rollInitiative: (options: { createCombatants?: boolean }) => Promise<void>;
};

/** Item with a roll() method (weapons). */
type RollableItem = WH40KItem & { roll: () => Promise<void> };

/** Prepared armour-by-facing rollup for the overview/combat panels. */
interface PreparedCraftStats {
    size: number;
    speed: { cruising: number; tactical: number; notes: string };
    armour: { front: number; side: number; rear: number };
    manoeuverability: number;
    passengers: number;
    carryingCapacity: number;
    integrity: { value: number; max: number; critical: number; percent: number };
    altitude: string;
    ceiling: number;
}

interface PreparedCraftCrew {
    required: number;
    notes: string;
    /** Who is actually aboard, seat-ordered (#508) — not just how many fit. */
    occupants: PreparedOccupant[];
    /** Crew seats still empty, so the tab can say what the vehicle is missing. */
    unfilled: number;
}

/** One occupant row on the crew tab. */
interface PreparedOccupant {
    name: string;
    /** Localized seat label. */
    role: string;
    /** Actor uuid, so the row can open the character sheet. */
    uuid: string;
    /** Portrait. Nullable because Foundry's FilePathField admits null. */
    img: string | null;
}

interface PreparedTab {
    id: string;
    tab: string;
    group: string;
    label: string;
    active: boolean;
    cssClass: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: matches ApplicationV2._prepareContext return contract
interface CraftSheetContext extends Record<string, unknown> {
    system?: CraftSystemData;
    items?: WH40KItem[];
    isCraft?: boolean;
    isTerracraft?: boolean;
    isAircraft?: boolean;
    isWatercraft?: boolean;
    craftStats?: PreparedCraftStats;
    crew?: PreparedCraftCrew;
    /** Altitude-tier choices for the aircraft select, as the shared field-row wants them. */
    altitudeOptions?: Record<string, string>;
    /** Animate-craft profile (daemon-engines / walkers); `null` on ordinary vehicles. */
    characteristics?: VehicleCharacteristics | null;
    /** Talents / traits carried by an animate craft (Unnatural Strength (X), Swift Attack, …). */
    profileAbilities?: WH40KItem[];
    weapons?: WH40KItem[];
    vehicleTraits?: WH40KItem[];
    vehicleUpgrades?: WH40KItem[];
    components?: WH40KItem[];
    otherItems?: WH40KItem[];
    tabs?: PreparedTab[];
}

/**
 * Shared actor sheet for the three conventional craft actor types
 * (`terracraft`, `aircraft`, `watercraft`). Aircraft-only sections (altitude /
 * ceiling) are gated by `isAircraft` in the templates.
 *
 * @extends {BaseActorSheet}
 */
export default class CraftActorSheet extends BaseActorSheet {
    declare actor: CraftActor;

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'actor', 'player', 'craft'],
        position: {
            width: 1000,
            height: 800,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'overview', group: 'primary' }],
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...BaseActorSheet.DEFAULT_OPTIONS.actions,
            rollCharacteristic: CraftActorSheet.#rollCharacteristic,
            rollSkill: CraftActorSheet.#rollSkill,
            rollWeapon: CraftActorSheet.#rollWeapon,
            rollInitiative: CraftActorSheet.#rollInitiative,
            adjustIntegrity: CraftActorSheet.#adjustIntegrity,
            repairDamage: CraftActorSheet.#repairDamage,
            toggleComponentActive: CraftActorSheet.#toggleComponentActive,
            damageComponent: CraftActorSheet.#damageComponent,
            openOccupant: CraftActorSheet.#openOccupant,
            embarkSelected: CraftActorSheet.#embarkSelected,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...(BaseActorSheet as typeof BaseActorSheet & { PARTS?: Record<string, ApplicationV2Config.PartConfiguration> }).PARTS,
        header: {
            template: 'systems/wh40k-rpg/templates/actor/craft/header.hbs',
            container: {
                classes: [
                    'wh40k-sidebar',
                    'tw-flex',
                    'tw-flex-col',
                    'tw-h-full',
                    'tw-min-h-0',
                    'tw-min-w-0',
                    'tw-overflow-y-auto',
                    'tw-overflow-x-hidden',
                    'tw-bg-[var(--color-bg-secondary,#252525)]',
                    'tw-border-r-2',
                    'tw-border-solid',
                    'tw-border-[var(--wh40k-sidebar-accent,var(--wh40k-color-gold,#d4af37))]',
                ],
                id: 'sidebar',
            },
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/craft/tabs.hbs',
            container: {
                classes: ['wh40k-sidebar', 'tw-flex', 'tw-flex-col', 'tw-h-full', 'tw-min-h-0'],
                id: 'sidebar',
            },
        },
        overview: {
            template: 'systems/wh40k-rpg/templates/actor/craft/tab-overview.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        combat: {
            template: 'systems/wh40k-rpg/templates/actor/craft/tab-combat.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        crew: {
            template: 'systems/wh40k-rpg/templates/actor/craft/tab-crew.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        components: {
            template: 'systems/wh40k-rpg/templates/actor/craft/tab-components.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        notes: {
            template: 'systems/wh40k-rpg/templates/actor/craft/tab-notes.hbs',
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
    override tabGroups: HandlebarsApplicationV14.TabGroupsState = {
        primary: 'overview',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext return contract
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // Coarse craft class is the actor `type` suffix (`*-terracraft` /
        // `*-aircraft` / `*-watercraft`); legacy `*-vehicle` renders as land.
        // (The `locomotion` field is the fine propulsion adjective, not this.)
        const actorType = this.actor.type;
        const context: CraftSheetContext = {
            ...(await super._prepareContext(options)),
            isCraft: true,
            isTerracraft: actorType.includes('terracraft') || actorType.includes('vehicle'),
            isAircraft: actorType.includes('aircraft'),
            isWatercraft: actorType.includes('watercraft'),
        };

        context.craftStats = this._prepareCraftStats();
        context.crew = this._prepareCrew();
        // The altitude tier moved from a hand-written <select> in the template
        // to the shared field-row partial (#502), which takes its choices as a
        // value → label map.
        context.altitudeOptions = {
            ground: game.i18n.localize('WH40K.Vehicle.AltitudeTier.Ground'),
            low: game.i18n.localize('WH40K.Vehicle.AltitudeTier.Low'),
            high: game.i18n.localize('WH40K.Vehicle.AltitudeTier.High'),
            orbital: game.i18n.localize('WH40K.Vehicle.AltitudeTier.Orbital'),
        };
        // Animate craft (daemon-engines / walkers) expose a creature profile; ordinary vehicles are null.
        context.characteristics = this.actor.system.characteristics;

        // Categorize items
        this._prepareItems(context);

        // Prepare tabs
        context.tabs = this._prepareCraftTabs();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare the conventional-craft stat rollup for display.
     * @returns {PreparedCraftStats} Craft stats object.
     * @protected
     */
    _prepareCraftStats(): PreparedCraftStats {
        const sys = this.actor.system;
        const integrity = sys.integrity;
        const max = integrity.max;
        return {
            size: sys.size,
            speed: {
                cruising: sys.speed.cruising,
                tactical: sys.speed.tactical,
                notes: sys.speed.notes,
            },
            armour: {
                front: sys.armour.front.value,
                side: sys.armour.side.value,
                rear: sys.armour.rear.value,
            },
            manoeuverability: sys.manoeuverability,
            passengers: sys.passengers,
            carryingCapacity: sys.carryingCapacity,
            integrity: {
                value: integrity.value,
                max,
                critical: integrity.critical,
                percent: Math.round((integrity.value / Math.max(1, max)) * 100),
            },
            altitude: sys.altitude ?? 'ground',
            ceiling: sys.ceiling ?? 0,
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare crew info for display: the authored capacity, plus who is actually
     * aboard (#508).
     *
     * Occupancy is stored on the passenger, so the roster is a scan of the
     * world's actors rather than a list held here — see `rules/vehicle-occupancy.ts`
     * for why that direction was chosen. `unfilled` lets the tab report what the
     * vehicle is missing rather than only whether it is full.
     * @returns {PreparedCraftCrew} Crew object.
     * @protected
     */
    _prepareCrew(): PreparedCraftCrew {
        const crew = this.actor.system.crew;
        const uuid = this.actor.uuid;
        const occupants = uuid === null ? [] : occupantsOf(uuid, game.actors);
        // Capacity is read off the typed DataModel fields directly rather than
        // through `capacityOf`: that helper exists to normalise an untyped system
        // payload, and routing schema-backed numbers through it would throw away
        // the typing to get the same values back.
        const capacity = { crew: crew.required, passengers: this.actor.system.passengers };
        return {
            required: crew.required,
            notes: crew.notes,
            occupants: occupants.map(({ actor, role }) => ({
                name: actor.name,
                role: game.i18n.localize(`WH40K.Vehicle.Role.${role}`),
                uuid: actor.uuid,
                img: actor.img,
            })),
            unfilled: unfilledCrew(occupants, capacity),
        };
    }

    /* -------------------------------------------- */

    /**
     * Categorize and prepare items.
     * @param {CraftSheetContext} context - The render context.
     * @protected
     */
    override _prepareItems(context: CraftSheetContext): void {
        const weapons: WH40KItem[] = [];
        const vehicleTraits: WH40KItem[] = [];
        const vehicleUpgrades: WH40KItem[] = [];
        const profileAbilities: WH40KItem[] = [];
        const components: WH40KItem[] = [];
        const other: WH40KItem[] = [];

        const buckets: Record<string, WH40KItem[]> = {
            weapon: weapons,
            vehicleTrait: vehicleTraits,
            vehicleUpgrade: vehicleUpgrades,
            // Animate craft (daemon-engines / walkers) carry creature talents/traits.
            talent: profileAbilities,
            trait: profileAbilities,
        };
        for (const item of context.items ?? []) {
            (buckets[item.type] ?? other).push(item);
        }

        context.weapons = weapons;
        context.vehicleTraits = vehicleTraits;
        context.vehicleUpgrades = vehicleUpgrades;
        context.profileAbilities = profileAbilities;
        context.components = components;
        context.otherItems = other;
    }

    /* -------------------------------------------- */

    /**
     * Prepare tabs configuration.
     * @returns {PreparedTab[]} Tabs configuration array.
     * @protected
     */
    _prepareCraftTabs(): PreparedTab[] {
        const TabsCtor = this.constructor as typeof CraftActorSheet;
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
    override async _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const partContext = await super._preparePartContext(partId, context, options);

        // Add tab metadata for all tab parts
        const tabParts = ['overview', 'combat', 'crew', 'components', 'notes'];
        if (tabParts.includes(partId)) {
            const TabsCtor = this.constructor as typeof CraftActorSheet;
            const tabConfig = TabsCtor.TABS.find((t) => t.tab === partId);
            const group = tabConfig?.group ?? 'primary';
            partContext['tab'] = {
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
     * @this {CraftActorSheet}
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #rollCharacteristic(this: CraftActorSheet, _event: PointerEvent, target: HTMLElement): void {
        const char = target.dataset['characteristic'];
        if (char === undefined || char === '') return;

        this.actor.rollCharacteristic(char);
    }

    /* -------------------------------------------- */

    /**
     * Handle skill roll.
     * @this {CraftActorSheet}
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #rollSkill(this: CraftActorSheet, _event: PointerEvent, target: HTMLElement): void {
        const skill = target.dataset['skill'];
        const spec = target.dataset['specialization'];
        if (skill === undefined || skill === '') return;

        this.actor.rollSkill(skill, spec);
    }

    /* -------------------------------------------- */

    /**
     * Handle weapon roll.
     * @this {CraftActorSheet}
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollWeapon(this: CraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;

        const item = this.actor.items.get(itemId) as RollableItem | undefined;
        if (!item) return;

        await item.roll();
    }

    /* -------------------------------------------- */

    /**
     * Handle initiative roll.
     * @this {CraftActorSheet}
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollInitiative(this: CraftActorSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        await this.actor.rollInitiative({ createCombatants: true });
    }

    /* -------------------------------------------- */

    /**
     * Adjust structural integrity by a signed delta (clamped to 0..max).
     * @this {CraftActorSheet}
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #adjustIntegrity(this: CraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const delta = parseInt(target.dataset['delta'] ?? '0', 10) || 0;
        const { value: current, max } = this.actor.system.integrity;

        const newValue = Math.max(0, Math.min(max, current + delta));
        await this.actor.update({ 'system.integrity.value': newValue });
    }

    /* -------------------------------------------- */

    /**
     * Repair integrity damage.
     * @this {CraftActorSheet}
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #repairDamage(this: CraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const amount = parseInt(target.dataset['amount'] ?? '1', 10) || 1;
        const { value: current, max } = this.actor.system.integrity;

        const newValue = Math.min(max, current + amount);
        await this.actor.update({ 'system.integrity.value': newValue });

        ui.notifications.info(game.i18n.format('WH40K.Vehicle.Repaired', { amount: String(amount) }));
    }

    /* -------------------------------------------- */

    /**
     * Toggle component active state.
     * @this {CraftActorSheet}
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #toggleComponentActive(this: CraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const item = this._resolveItemFromTarget(target);
        if (!item) return;

        const componentSystem = item.system as { active?: boolean };
        await item.update({ 'system.active': componentSystem.active !== true });
    }

    /* -------------------------------------------- */

    /**
     * Apply damage to component (toggles its damaged flag).
     * @this {CraftActorSheet}
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #damageComponent(this: CraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const item = this._resolveItemFromTarget(target);
        if (!item) return;

        const componentSystem = item.system as { damaged?: boolean };
        const damaged = componentSystem.damaged === true;
        await item.update({ 'system.damaged': !damaged });

        ui.notifications.info(
            damaged
                ? game.i18n.format('WH40K.Vehicle.ComponentRepaired', { name: item.name })
                : game.i18n.format('WH40K.Vehicle.ComponentDamaged', { name: item.name }),
        );
    }

    /* -------------------------------------------- */

    /**
     * Open an occupant's character sheet from the crew roster (#508).
     * @this {CraftActorSheet}
     * @param {PointerEvent} _event  Triggering click.
     * @param {HTMLElement} target  The roster row's link, carrying the actor uuid.
     */
    static async #openOccupant(this: CraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const uuid = target.dataset['uuid'];
        if (uuid === undefined || uuid === '') return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: `fromUuid` is a Foundry global resolving to an untyped Document union
        const occupant = (await fromUuid(uuid)) as { sheet?: { render: (force: boolean) => unknown } } | null;
        occupant?.sheet?.render(true);
    }

    static async #embarkSelected(this: CraftActorSheet): Promise<void> {
        const { embark } = await import('../../rules/vehicle-embark.ts');
        // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.tokens.controlled is Foundry's selected token array
        const controlled = (canvas as { tokens?: { controlled?: Array<{ actor?: { uuid?: string } }> } }).tokens?.controlled ?? [];
        if (controlled.length === 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.Vehicle.SelectTokenFirst'));
            return;
        }
        for (const token of controlled) {
            if (token.actor === undefined) continue;
            // eslint-disable-next-line no-restricted-syntax, no-await-in-loop -- boundary: sheet/token actor types don't structurally match EmbarkableActor/VehicleActorish; sequential for capacity enforcement
            await (embark as (a: unknown, v: unknown) => Promise<boolean>)(token.actor, this.actor);
        }
        await this.render();
    }
}
