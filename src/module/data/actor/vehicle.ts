import ActorDataModel from '../abstract/actor-data-model.ts';

/**
 * Data model for Vehicle actors.
 * Enhanced V13 schema with proper structure for all vehicle data.
 */
/** Shape of an armour facing (front/side/rear). */
interface VehicleArmourFacing {
    value: number;
    descriptor: string;
}

export default class VehicleData extends ActorDataModel {
    // Typed property declarations matching defineSchema()
    declare vehicleClass: 'ground' | 'air' | 'water' | 'space' | 'walker';
    declare size: number;
    declare sizeDescriptor: string;
    declare faction: string;
    declare subfaction: string;
    declare type: 'vehicle' | 'walker' | 'flyer' | 'skimmer' | 'bike' | 'tank';
    declare threatLevel: number;
    declare armour: {
        front: VehicleArmourFacing;
        side: VehicleArmourFacing;
        rear: VehicleArmourFacing;
    };
    declare speed: {
        cruising: number;
        tactical: number;
        notes: string;
    };
    declare crew: {
        required: number;
        notes: string;
    };
    declare passengers: number;
    declare manoeuverability: number;
    declare carryingCapacity: number;
    declare integrity: {
        max: number;
        value: number;
        critical: number;
    };
    declare weapons: string;
    declare specialRules: string;
    declare traitsText: string;
    /** Flyer altitude tier (without.md p. 54). Ground for non-Flyer vehicles. */
    declare altitude: 'ground' | 'low' | 'high' | 'orbital';
    declare availability: string;
    declare source: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // === Vehicle Classification ===
            vehicleClass: new fields.StringField({
                required: true,
                initial: 'ground',
                choices: ['ground', 'air', 'water', 'space', 'walker'],
                label: 'WH40K.Vehicle.Class',
            }),

            // === Size ===
            size: new fields.NumberField({
                required: true,
                initial: 4, // Average
                integer: true,
                min: 1,
                max: 10,
                label: 'WH40K.Vehicle.Size',
            }),

            sizeDescriptor: new fields.StringField({
                required: false,
                initial: '',
                blank: true,
                label: 'WH40K.Vehicle.SizeDescriptor',
            }),

            // === Threat Classification ===
            faction: new fields.StringField({ required: false, initial: '', blank: true }),
            subfaction: new fields.StringField({ required: false, initial: '', blank: true }),
            type: new fields.StringField({
                required: true,
                initial: 'vehicle',
                choices: ['vehicle', 'walker', 'flyer', 'skimmer', 'bike', 'tank'],
                label: 'WH40K.Vehicle.Type',
            }),
            threatLevel: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // === Armour by Facing (nested for value + descriptor) ===
            armour: new fields.SchemaField({
                front: new fields.SchemaField({
                    value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    descriptor: new fields.StringField({ required: false, initial: '', blank: true }),
                }),
                side: new fields.SchemaField({
                    value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    descriptor: new fields.StringField({ required: false, initial: '', blank: true }),
                }),
                rear: new fields.SchemaField({
                    value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    descriptor: new fields.StringField({ required: false, initial: '', blank: true }),
                }),
            }),

            // === Speed ===
            speed: new fields.SchemaField({
                cruising: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                tactical: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                notes: new fields.StringField({ required: false, initial: '', blank: true }),
            }),

            // === Crew & Passengers ===
            crew: new fields.SchemaField({
                required: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
                notes: new fields.StringField({ required: false, initial: '', blank: true }),
            }),

            passengers: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // === Manoeuverability ===
            manoeuverability: new fields.NumberField({ required: true, initial: 0, integer: true }),

            // === Carrying Capacity ===
            carryingCapacity: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // === Structural Integrity ===
            integrity: new fields.SchemaField({
                max: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                critical: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // === Weapons (rich text for weapon descriptions) ===
            weapons: new fields.HTMLField({ required: true, blank: true }),

            // === Special Rules (rich text) ===
            specialRules: new fields.HTMLField({ required: true, blank: true }),

            // === Traits (text until items are dragged on) ===
            traitsText: new fields.StringField({ required: false, initial: '', blank: true }),

            // === Flyer altitude (without.md p. 54-55) ===
            // Only meaningful when the vehicle has the Flyer trait.
            altitude: new fields.StringField({
                required: true,
                initial: 'ground',
                choices: ['ground', 'low', 'high', 'orbital'],
            }),

            // === Availability & Source ===
            availability: new fields.StringField({ required: false, initial: 'common', blank: true }),
            source: new fields.StringField({ required: false, initial: '', blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @override */
    override prepareBaseData(): void {
        super.prepareBaseData();

        // Ensure integrity.value doesn't exceed max
        if (this.integrity.value > this.integrity.max) {
            this.integrity.value = this.integrity.max;
        }
    }

    /** @override */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
        this._applyVehicleTraitModifiers();
    }

    /**
     * Walk embedded vehicle-trait items and fold their stat modifiers
     * into the derived stat block (core.md §"Vehicle Traits"). Each
     * trait carries `modifiers: { speed, manoeuvrability, armour, integrity }`;
     * non-zero entries adjust the corresponding stat. Armour applies to
     * every facing equally (RAW does not distinguish trait-driven
     * armour by facing; per-facing modifiers come from explicit
     * components, not traits).
     */
    _applyVehicleTraitModifiers(): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: parent.items is an EmbeddedCollection; iteration is typed loose
        const parent = (this as unknown as { parent?: { items?: Iterable<{ type: string; system: unknown }> } }).parent;
        const items = parent?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type !== 'vehicleTrait') continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: per-item system shape narrowed by item type guard above
            const mods = (item.system as { modifiers?: { speed?: number; manoeuvrability?: number; armour?: number; integrity?: number } }).modifiers;
            if (!mods) continue;
            if (typeof mods.speed === 'number') {
                this.speed.cruising = Math.max(0, this.speed.cruising + mods.speed);
                this.speed.tactical = Math.max(0, this.speed.tactical + mods.speed);
            }
            if (typeof mods.manoeuvrability === 'number') {
                this.manoeuverability += mods.manoeuvrability;
            }
            if (typeof mods.armour === 'number') {
                this.armour.front.value = Math.max(0, this.armour.front.value + mods.armour);
                this.armour.side.value = Math.max(0, this.armour.side.value + mods.armour);
                this.armour.rear.value = Math.max(0, this.armour.rear.value + mods.armour);
            }
            if (typeof mods.integrity === 'number') {
                this.integrity.max = Math.max(0, this.integrity.max + mods.integrity);
                if (this.integrity.value > this.integrity.max) this.integrity.value = this.integrity.max;
            }
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Is the vehicle damaged?
     * @type {boolean}
     */
    get isDamaged(): boolean {
        return this.integrity.value < this.integrity.max;
    }

    /**
     * Is the vehicle critically damaged?
     * @type {boolean}
     */
    get isCritical(): boolean {
        return this.integrity.critical > 0;
    }

    /**
     * Is the vehicle destroyed?
     * @type {boolean}
     */
    get isDestroyed(): boolean {
        return this.integrity.value <= 0 && this.integrity.max > 0;
    }

    /**
     * Get armour summary for display.
     * @type {string}
     */
    get armourSummary(): string {
        const f = this.armour.front.value;
        const s = this.armour.side.value;
        const r = this.armour.rear.value;
        return `F:${f} / S:${s} / R:${r}`;
    }

    /**
     * Get speed summary for display.
     * @type {string}
     */
    get speedSummary(): string {
        return `Cruising: ${this.speed.cruising} kph / Tactical: ${this.speed.tactical}m`;
    }

    /**
     * Get size label from config.
     * @type {string}
     */
    get sizeLabel(): string {
        const wh40kCfg = CONFIG.wh40k as
            | { vehicleSizes?: Record<string, { label: string } | undefined>; sizes?: Record<string, { label: string } | undefined> }
            | undefined;
        const sizeConfig = wh40kCfg?.vehicleSizes ?? wh40kCfg?.sizes ?? {};
        const sizeData = sizeConfig[this.size];
        if (sizeData !== undefined) {
            return game.i18n.localize(sizeData.label);
        }
        return this.sizeDescriptor !== '' ? this.sizeDescriptor : `Size ${this.size}`;
    }

    /**
     * Get vehicle class label from config.
     * @type {string}
     */
    get vehicleClassLabel(): string {
        const wh40kCfg = CONFIG.wh40k as { vehicleClasses?: Record<string, { label: string } | undefined> } | undefined;
        const classes = wh40kCfg?.vehicleClasses ?? {};
        const classData = classes[this.vehicleClass];
        if (classData !== undefined) {
            return game.i18n.localize(classData.label);
        }
        return this.vehicleClass;
    }

    /**
     * Get vehicle type label from config.
     * @type {string}
     */
    get vehicleTypeLabel(): string {
        const wh40kCfg = CONFIG.wh40k as { vehicleTypes?: Record<string, { label: string } | undefined> } | undefined;
        const types = wh40kCfg?.vehicleTypes ?? {};
        const typeData = types[this.type];
        if (typeData !== undefined) {
            return game.i18n.localize(typeData.label);
        }
        return this.type;
    }

    /**
     * Get integrity percentage.
     * @type {number}
     */
    get integrityPercentage(): number {
        if (this.integrity.max === 0) return 0;
        return Math.round((this.integrity.value / this.integrity.max) * 100);
    }

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry getRollData() returns dynamic shorthand keys
    override getRollData(): Record<string, unknown> {
        const data = super.getRollData();

        data['man'] = this.manoeuverability;
        data['armF'] = this.armour.front.value;
        data['armS'] = this.armour.side.value;
        data['armR'] = this.armour.rear.value;
        data['size'] = this.size;
        data['integrity'] = this.integrity.value;
        data['integrityMax'] = this.integrity.max;

        return data;
    }
}
