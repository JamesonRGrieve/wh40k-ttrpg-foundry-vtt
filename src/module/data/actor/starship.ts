import ActorDataModel from '../abstract/actor-data-model.ts';

/** Subset of ship-component item.system fields used in starship preparation. */
interface ShipComponentSystem {
    condition?: string;
    componentType?: string;
    essential?: boolean;
    power?: { generated?: number; used?: number } | number;
    space?: number;
    shipPoints?: number;
    modifiers?: Record<string, number>;
}

interface ShipItemView {
    id?: string;
    uuid?: string;
    name?: string;
    type: string;
    system: ShipComponentSystem;
}

/**
 * RAW Rogue Trader requires every hull to be fitted with a fixed inventory of
 * essential components before launch. These slots are content-agnostic — they
 * apply to every hull class — so the slot list is a primitive enum maintained
 * in code. Each slot's *filling* (which compendium component fills it) is the
 * content-specific part and lives on the actor's owned items.
 */
export const ESSENTIAL_SHIP_SLOTS: readonly string[] = [
    'plasmaDrive',
    'warpDrive',
    'gellarField',
    'voidShields',
    'bridge',
    'lifeSupport',
    'quarters',
    'auger',
] as const;

/** Validation result for a starship build (computed in prepareDerivedData). */
export interface StarshipBuildValidation {
    /** SP currently allocated across owned components + weapons + upgrades. */
    spent: number;
    /** SP budget granted by the hull (mirrors `shipPoints.budget`). */
    budget: number;
    /** True when `spent > budget`. */
    isOverBudget: boolean;
    /** Essential slot names that have no owned component filling them. */
    missingEssentialSlots: string[];
    /** Convenience: build is valid iff !isOverBudget && missingEssentialSlots.length === 0. */
    isValid: boolean;
}

/**
 * Data model for Starship actors.
 * Matches template.json "starship" structure.
 */
export default class StarshipData extends ActorDataModel {
    // Typed property declarations matching defineSchema()
    declare hullType: string;
    declare hullClass: string;
    declare dimensions: string;
    declare crew: {
        population: number;
        crewRating: number;
        morale: {
            max: number;
            value: number;
        };
    };
    declare speed: number;
    declare manoeuvrability: number;
    declare detection: number;
    declare armour: number;
    declare voidShields: number;
    declare turretRating: number;
    declare hullIntegrity: {
        max: number;
        value: number;
    };
    declare space: {
        total: number;
        used: number;
        /** Computed in _prepareResources / prepareEmbeddedData */
        available: number;
        consumed?: number;
    };
    declare power: {
        total: number;
        used: number;
        /** Computed in _prepareResources / prepareEmbeddedData */
        available: number;
        generated?: number;
        consumed?: number;
    };
    declare shipPoints: {
        /** Total SP allocated across owned components / weapons / upgrades. Recomputed. */
        spent: number;
        /** SP budget granted by the hull (set on hull selection / from compendium). */
        budget: number;
    };
    declare components: Array<{ slot: string; itemUuid: string; sp: number }>;
    /** Computed by `prepareDerivedData()` — see `StarshipBuildValidation`. */
    declare buildValidation: StarshipBuildValidation;
    declare machineSpiritOddities: string;
    declare pastHistory: string;
    declare complications: string;
    declare weaponCapacity: {
        dorsal: number;
        prow: number;
        port: number;
        starboard: number;
        keel: number;
    };
    declare notes: string;

    /** Computed during _prepareCombatStats */
    declare detectionBonus: number;
    declare hullPercentage: number;
    declare moralePercentage: number;

    /** Computed during prepareEmbeddedData */
    declare componentModifiers: Record<string, number>;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Hull information (flat fields matching template.json)
            hullType: new fields.StringField({ required: false, initial: '', blank: true }),
            hullClass: new fields.StringField({ required: false, initial: '', blank: true }),
            dimensions: new fields.StringField({ required: false, initial: '', blank: true }),

            // Crew
            crew: new fields.SchemaField({
                population: new fields.NumberField({ required: true, initial: 100, min: 0, integer: true }),
                crewRating: new fields.NumberField({ required: true, initial: 30, min: 0, max: 100, integer: true }),
                morale: new fields.SchemaField({
                    max: new fields.NumberField({ required: true, initial: 100, min: 0, integer: true }),
                    value: new fields.NumberField({ required: true, initial: 100, min: 0, integer: true }),
                }),
            }),

            // Ship stats
            speed: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
            detection: new fields.NumberField({ required: true, initial: 0, integer: true }),
            armour: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            voidShields: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            turretRating: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // Hull Integrity
            hullIntegrity: new fields.SchemaField({
                max: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // Resources
            space: new fields.SchemaField({
                total: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                used: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),
            power: new fields.SchemaField({
                total: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                used: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // Ship Points budget vs spent (issue #190 — RAW build validation).
            // `spent` is recomputed in prepareDerivedData from owned components;
            // `budget` is the hull's SP budget (mirrors the hull entry's shipPoints
            // value from the rt-core-actors-ships compendium).
            shipPoints: new fields.SchemaField({
                spent: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                budget: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // Slot → component assignments for the build (issue #190). Sheet-side
            // UI fills this from drag-drops of compendium components; runtime
            // resolution walks the array and matches against owned items by UUID.
            components: new fields.ArrayField(
                new fields.SchemaField({
                    slot: new fields.StringField({ required: true, blank: false, initial: 'bridge' }),
                    itemUuid: new fields.StringField({ required: true, blank: true, initial: '' }),
                    sp: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                }),
                { required: true, initial: [] },
            ),

            // Ship quirks
            machineSpiritOddities: new fields.StringField({ required: false, initial: '', blank: true }),
            pastHistory: new fields.StringField({ required: false, initial: '', blank: true }),
            complications: new fields.StringField({ required: false, initial: '', blank: true }),

            // Weapon capacity per location
            weaponCapacity: new fields.SchemaField({
                dorsal: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                prow: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                port: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                starboard: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                keel: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // Notes
            notes: new fields.StringField({ required: false, initial: '', blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @override */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
        this._prepareResources();
        this._prepareCombatStats();
        this._prepareBuildValidation();
    }

    /**
     * Migrate legacy numeric `shipPoints` (pre-#190) to the `{spent, budget}` shape.
     * Existing actors and compendium hull entries stored a single number — that
     * value is the hull's SP budget. The `spent` field is recomputed each prep.
     */
    static override migrateData(source: Record<string, unknown>): Record<string, unknown> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: SystemDataModel.migrateData inherits an untyped Foundry signature
        const out = (super.migrateData(source) as Record<string, unknown>) ?? source;
        const sp = out['shipPoints'];
        if (typeof sp === 'number') {
            out['shipPoints'] = { spent: 0, budget: sp };
        } else if (sp !== undefined && sp !== null && typeof sp === 'object') {
            // Ensure both keys exist even when one was omitted.
            const obj = sp as Record<string, unknown>;
            const budget = typeof obj['budget'] === 'number' ? obj['budget'] : 0;
            const spent = typeof obj['spent'] === 'number' ? obj['spent'] : 0;
            out['shipPoints'] = { spent, budget };
        }
        return out;
    }

    /**
     * Calculate resource availability.
     * @protected
     */
    _prepareResources(): void {
        // Add computed available fields
        this.space.available = this.space.total - this.space.used;
        this.power.available = this.power.total - this.power.used;
    }

    /**
     * Calculate combat-derived stats.
     * @protected
     */
    _prepareCombatStats(): void {
        // Detection Bonus (tens digit) for initiative
        this.detectionBonus = Math.floor(this.detection / 10);

        // Hull percentage for status display
        if (this.hullIntegrity.max > 0) {
            this.hullPercentage = Math.round((this.hullIntegrity.value / this.hullIntegrity.max) * 100);
        } else {
            this.hullPercentage = 100;
        }

        // Morale percentage
        if (this.crew.morale.max > 0) {
            this.moralePercentage = Math.round((this.crew.morale.value / this.crew.morale.max) * 100);
        } else {
            this.moralePercentage = 100;
        }
    }

    /**
     * Seed `buildValidation` from current state. Called from `prepareDerivedData`
     * before items are loaded; the post-items pass in `prepareEmbeddedData`
     * refines `spent` and `missingEssentialSlots` once owned items are visible.
     * @protected
     */
    _prepareBuildValidation(): void {
        const budget = this.shipPoints.budget;
        const spent = this.shipPoints.spent; // may be stale until prepareEmbeddedData
        this.buildValidation = {
            spent,
            budget,
            isOverBudget: spent > budget,
            missingEssentialSlots: [...ESSENTIAL_SHIP_SLOTS],
            isValid: false,
        };
    }

    /**
     * Recompute SP spent and essential-slot coverage from owned items.
     * Walks every shipComponent / shipWeapon / shipUpgrade on the actor:
     *   • sums their `system.shipPoints` into `shipPoints.spent`;
     *   • marks each essential slot as covered when an owned component of that
     *     `componentType` is functional.
     * @protected
     */
    _refreshBuildValidation(items: Iterable<ShipItemView>): void {
        let spSpent = 0;
        const covered = new Set<string>();
        for (const item of items) {
            const sys = item.system;
            if (item.type === 'shipComponent' || item.type === 'shipWeapon' || item.type === 'shipUpgrade') {
                spSpent += sys.shipPoints ?? 0;
            }
            if (item.type === 'shipComponent' && typeof sys.componentType === 'string') {
                // Only "functional" components count toward filling a required slot —
                // a destroyed bridge does not satisfy the bridge requirement.
                if (sys.condition === undefined || sys.condition === 'functional') {
                    covered.add(sys.componentType);
                    // Some compendium components are tagged `essential: true` but use
                    // an `essential` / `supplemental` componentType bucket; in that
                    // case fall back to the explicit flag.
                    if (sys.essential === true && sys.componentType === 'essential') {
                        // Cannot determine which slot it fills without more data;
                        // skip silently — the explicit slot types above are preferred.
                    }
                }
            }
        }

        this.shipPoints.spent = spSpent;

        const budget = this.shipPoints.budget;
        const missing: string[] = ESSENTIAL_SHIP_SLOTS.filter((slot) => !covered.has(slot));
        const isOverBudget = spSpent > budget;
        this.buildValidation = {
            spent: spSpent,
            budget,
            isOverBudget,
            missingEssentialSlots: missing,
            isValid: !isOverBudget && missing.length === 0,
        };
    }

    /**
     * Pure validator usable from tests and the sheet without prepping the full
     * DataModel. Returns a `StarshipBuildValidation` for the given budget and
     * iterable of component-like views.
     */
    static validateBuild(budget: number, items: Iterable<{ type: string; system: ShipComponentSystem }>): StarshipBuildValidation {
        let spent = 0;
        const covered = new Set<string>();
        for (const item of items) {
            const sys = item.system;
            if (item.type === 'shipComponent' || item.type === 'shipWeapon' || item.type === 'shipUpgrade') {
                spent += sys.shipPoints ?? 0;
            }
            if (item.type === 'shipComponent' && typeof sys.componentType === 'string') {
                if (sys.condition === undefined || sys.condition === 'functional') {
                    covered.add(sys.componentType);
                }
            }
        }
        const missing: string[] = ESSENTIAL_SHIP_SLOTS.filter((slot) => !covered.has(slot));
        const isOverBudget = spent > budget;
        return {
            spent,
            budget,
            isOverBudget,
            missingEssentialSlots: missing,
            isValid: !isOverBudget && missing.length === 0,
        };
    }

    /**
     * Calculate stats from equipped components.
     * Called by the Document after items are ready.
     */
    override prepareEmbeddedData(): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.items collection
        const actor = this.parent as { items?: Iterable<unknown> } | null | undefined;
        if (actor === null || actor === undefined) return;
        const items = actor.items;
        if (items === undefined) return;

        // Calculate power and space from components
        let powerGenerated = 0;
        let powerUsed = 0;
        let spaceUsed = 0;

        // Track stat modifiers from components
        const componentModifiers: Record<string, number> = {
            speed: 0,
            manoeuvrability: 0,
            detection: 0,
            armour: 0,
            hullIntegrity: 0,
            turretRating: 0,
            voidShields: 0,
            morale: 0,
            crewRating: 0,
        };

        // Process ship components
        for (const rawItem of items) {
            const item = rawItem as ShipItemView;
            const sys = item.system;
            if (item.type === 'shipComponent' && sys.condition === 'functional') {
                // Power
                const power = typeof sys.power === 'object' ? sys.power : undefined;
                const genPower = power?.generated ?? 0;
                const usePower = power?.used ?? 0;
                powerGenerated += genPower;
                powerUsed += usePower;

                // Space
                spaceUsed += sys.space ?? 0;

                // Modifiers
                if (sys.modifiers !== undefined) {
                    for (const [key, value] of Object.entries(sys.modifiers)) {
                        const existing = componentModifiers[key];
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Record<string,number> index may return undefined at runtime
                        if (existing !== undefined) {
                            componentModifiers[key] = existing + Number(value);
                        }
                    }
                }
            } else if (item.type === 'shipWeapon') {
                powerUsed += typeof sys.power === 'number' ? sys.power : 0;
                spaceUsed += sys.space ?? 0;
            } else if (item.type === 'shipUpgrade') {
                const power = typeof sys.power === 'object' ? sys.power : undefined;
                const genPower = power?.generated ?? 0;
                const usePower = power?.used ?? 0;
                powerGenerated += genPower;
                powerUsed += usePower;
                spaceUsed += sys.space ?? 0;
            }
        }

        // Store calculated values
        this.power.generated = powerGenerated;
        this.power.consumed = powerUsed;
        this.space.consumed = spaceUsed;

        // Update totals if auto-calculation is enabled
        this.power.total = powerGenerated;
        this.power.used = powerUsed;
        this.space.used = spaceUsed;

        // Recalculate availability
        this.space.available = this.space.total - this.space.used;
        this.power.available = this.power.total - this.power.used;

        // Store component modifiers for display
        this.componentModifiers = componentModifiers;

        // Refresh SP-budget + essential-slot validation now that items are
        // visible. The earlier `_prepareBuildValidation()` call seeded the
        // shape with stale `spent` and the full essential-slot list; this pass
        // computes the accurate state for the rendered sheet.
        const itemsForValidation: ShipItemView[] = [];
        for (const rawItem of items) {
            const item = rawItem as ShipItemView;
            if (item.type === 'shipComponent' || item.type === 'shipWeapon' || item.type === 'shipUpgrade') {
                itemsForValidation.push(item);
            }
        }
        this._refreshBuildValidation(itemsForValidation);
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the hull type label.
     * @type {string}
     */
    get hullTypeLabel(): string {
        if (!this.hullType) return '';
        return game.i18n.localize(
            `WH40K.HullType.${this.hullType
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /**
     * Is the ship damaged?
     * @type {boolean}
     */
    get isDamaged(): boolean {
        return this.hullIntegrity.value < this.hullIntegrity.max;
    }

    /**
     * Is the ship crippled (below half hull)?
     * @type {boolean}
     */
    get isCrippled(): boolean {
        return this.hullIntegrity.value <= Math.floor(this.hullIntegrity.max / 2);
    }

    /**
     * Has power shortage?
     * @type {boolean}
     */
    get hasPowerShortage(): boolean {
        return this.power.available < 0;
    }

    /**
     * Has space shortage?
     * @type {boolean}
     */
    get hasSpaceShortage(): boolean {
        return this.space.available < 0;
    }

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry getRollData() returns dynamic shorthand keys
    override getRollData(): Record<string, unknown> {
        const data = super.getRollData();

        data['speed'] = this.speed;
        data['man'] = this.manoeuvrability;
        data['det'] = this.detection;
        data['arm'] = this.armour;
        data['vs'] = this.voidShields;
        data['tr'] = this.turretRating;
        data['cr'] = this.crew.crewRating;

        return data;
    }
}
