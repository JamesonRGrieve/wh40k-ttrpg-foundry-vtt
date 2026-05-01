import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Ship Upgrade items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipUpgradeData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare power: number;
    declare space: number;
    declare shipPoints: number;
    declare modifiers: {
        speed: number;
        manoeuvrability: number;
        detection: number;
        armour: number;
        hullIntegrity: number;
        turretRating: number;
        voidShields: number;
        morale: number;
        crewRating: number;
    };
    declare effect: string;
    declare availability: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Resource requirements
            power: new fields.NumberField({ required: true, initial: 0, integer: true }),
            space: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            shipPoints: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // Stat modifiers
            modifiers: new fields.SchemaField({
                speed: new fields.NumberField({ required: true, initial: 0, integer: true }),
                manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
                detection: new fields.NumberField({ required: true, initial: 0, integer: true }),
                armour: new fields.NumberField({ required: true, initial: 0, integer: true }),
                hullIntegrity: new fields.NumberField({ required: true, initial: 0, integer: true }),
                turretRating: new fields.NumberField({ required: true, initial: 0, integer: true }),
                voidShields: new fields.NumberField({ required: true, initial: 0, integer: true }),
                morale: new fields.NumberField({ required: true, initial: 0, integer: true }),
                crewRating: new fields.NumberField({ required: true, initial: 0, integer: true }),
            }),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Availability
            availability: new fields.StringField({
                required: true,
                initial: 'common',
            }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Normalize ship upgrade data shape.
     * @param {object} source  Candidate source data
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        ShipUpgradeData.#initializeDefaults(source);
    }

    /**
     * Initialize missing fields with defaults.
     * @param {object} source  The source data
     */
    static #initializeDefaults(source: Record<string, unknown>): void {
        source.power ??= 0;
        source.space ??= 0;
        source.availability ??= 'common';
        source.notes ??= '';
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean ship upgrade data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static _cleanData(source: Record<string, unknown> | undefined, options: Record<string, unknown>): void {
        super._cleanData?.(source, options);
        // Ensure power and space are numbers
        if (source) {
            if (typeof source.power === 'string') {
                source.power = parseInt(source.power) || 0;
            }
            if (typeof source.space === 'string') {
                source.space = parseInt(source.space) || 0;
            }
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Net power usage.
     * @type {string}
     */
    get powerLabel(): string {
        if (this.power > 0) return `-${this.power}`;
        if (this.power < 0) return `+${Math.abs(this.power)}`;
        return '0';
    }

    /**
     * Has any non-zero modifiers?
     * @type {boolean}
     */
    get hasModifiers() {
        return Object.values(this.modifiers).some((v) => v !== 0);
    }

    /**
     * Get modifiers as a formatted list.
     * @type {object[]}
     */
    get modifiersList() {
        const list = [];
        for (const [key, value] of Object.entries(this.modifiers)) {
            if (value !== 0) {
                list.push({
                    key,
                    label: game.i18n.localize(`WH40K.ShipStat.${key.capitalize()}`),
                    value,
                });
            }
        }
        return list;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [`Power: ${this.powerLabel}`, `Space: ${this.space}`, `SP: ${this.shipPoints}`];

        for (const mod of this.modifiersList) {
            props.push(`${mod.label}: ${mod.value >= 0 ? '+' : ''}${mod.value}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            power: this.powerLabel,
            space: this.space,
            sp: this.shipPoints,
        };
    }
}
