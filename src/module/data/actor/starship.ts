import ActorDataModel from '../abstract/actor-data-model.ts';

/** Subset of ship-component item.system fields used in starship preparation. */
interface ShipComponentSystem {
    condition?: string;
    power?: { generated?: number; used?: number } | number;
    space?: number;
    modifiers?: Record<string, number>;
}

interface ShipItemView {
    type: string;
    system: ShipComponentSystem;
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
    declare shipPoints: number;
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

            // Ship Points (for building)
            shipPoints: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

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
     * Calculate stats from equipped components.
     * Called by the Document after items are ready.
     */
    prepareEmbeddedData(): void {
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
                        if (Object.prototype.hasOwnProperty.call(componentModifiers, key)) {
                            componentModifiers[key] += Number(value);
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
