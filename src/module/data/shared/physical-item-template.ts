import SystemDataModel from '../abstract/system-data-model.ts';

/**
 * Template for physical items with weight and availability.
 * @mixin
 */
export default class PhysicalItemTemplate extends SystemDataModel {
    // Typed property declarations matching defineSchema()
    declare weight: number;
    declare availability: string;
    declare craftsmanship: string;
    declare quantity: number;
    declare cost: {
        dh1: {
            throneGelt: number | null;
        };
        dh2: {
            influence: number | null;
            homebrew: {
                requisition: number | null;
                throneGelt: number | null;
            };
        };
        rt: {
            profitFactor: number | null;
        };
        dw: {
            requisition: number | null;
        };
        bc: {
            infamy: number | null;
        };
        ow: {
            logistics: number | null;
        };
    };

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            weight: new fields.NumberField({
                required: true,
                nullable: false,
                initial: 0,
                min: 0,
            }),
            availability: new fields.StringField({
                required: true,
                initial: 'common',
                choices: () =>
                    Object.keys(CONFIG.WH40K?.availabilities ?? {}).length
                        ? Object.keys(CONFIG.WH40K.availabilities)
                        : [
                              'ubiquitous',
                              'abundant',
                              'plentiful',
                              'common',
                              'average',
                              'scarce',
                              'rare',
                              'very-rare',
                              'extremely-rare',
                              'near-unique',
                              'unique',
                          ],
            }),
            craftsmanship: new fields.StringField({
                required: true,
                initial: 'common',
                choices: () =>
                    Object.keys(CONFIG.WH40K?.craftsmanships ?? {}).length ? Object.keys(CONFIG.WH40K.craftsmanships) : ['poor', 'common', 'good', 'best'],
            }),
            quantity: new fields.NumberField({
                required: true,
                nullable: false,
                initial: 1,
                min: 0,
                integer: true,
            }),
            cost: new fields.SchemaField({
                dh1: new fields.SchemaField({
                    throneGelt: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                }),
                dh2: new fields.SchemaField({
                    influence: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                    homebrew: new fields.SchemaField({
                        requisition: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                        throneGelt: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                    }),
                }),
                rt: new fields.SchemaField({
                    profitFactor: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                }),
                dw: new fields.SchemaField({
                    requisition: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                }),
                bc: new fields.SchemaField({
                    infamy: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                }),
                ow: new fields.SchemaField({
                    logistics: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate physical item data.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        PhysicalItemTemplate.#migrateCost(source);
    }

    /**
     * Normalize cost field shape.
     * @param {object} source  The source data
     */
    static #migrateCost(source: Record<string, unknown>): void {
        const emptyCost = PhysicalItemTemplate.#emptyCost();
        const normalizeNullableNumber = (value: unknown): number | null => {
            if (value === null || value === undefined || value === '') return null;
            const numericValue = Number(value);
            if (!Number.isFinite(numericValue)) return null;
            return numericValue;
        };

        if (!source.cost || typeof source.cost !== 'object') {
            source.cost = emptyCost;
            return;
        }

        source.cost = {
            dh1: {
                throneGelt: normalizeNullableNumber(source.cost.dh1?.throneGelt),
            },
            dh2: {
                influence: normalizeNullableNumber(source.cost.dh2?.influence),
                homebrew: {
                    requisition: normalizeNullableNumber(source.cost.dh2?.homebrew?.requisition),
                    throneGelt: normalizeNullableNumber(source.cost.dh2?.homebrew?.throneGelt),
                },
            },
            rt: {
                profitFactor: normalizeNullableNumber(source.cost.rt?.profitFactor),
            },
            dw: {
                requisition: normalizeNullableNumber(source.cost.dw?.requisition),
            },
            bc: {
                infamy: normalizeNullableNumber(source.cost.bc?.infamy),
            },
            ow: {
                logistics: normalizeNullableNumber(source.cost.ow?.logistics),
            },
        };
    }

    static #emptyCost(): Record<string, unknown> {
        return {
            dh1: {
                throneGelt: null,
            },
            dh2: {
                influence: null,
                homebrew: {
                    requisition: null,
                    throneGelt: null,
                },
            },
            rt: {
                profitFactor: null,
            },
            dw: {
                requisition: null,
            },
            bc: {
                infamy: null,
            },
            ow: {
                logistics: null,
            },
        };
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean physical item template data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static _cleanData(source: Record<string, unknown> | undefined, options): void {
        super._cleanData?.(source, options);
    }

    /* -------------------------------------------- */

    /**
     * Get the total weight considering quantity.
     * @type {number}
     */
    get totalWeight() {
        return this.weight * (this.quantity || 1);
    }

    /* -------------------------------------------- */

    /**
     * Get localized availability label.
     * @type {string}
     */
    get availabilityLabel(): string {
        return game.i18n.localize(`WH40K.Availability.${this.availability.capitalize()}`);
    }

    /* -------------------------------------------- */

    /**
     * Get localized craftsmanship label.
     * @type {string}
     */
    get craftsmanshipLabel(): string {
        return game.i18n.localize(`WH40K.Craftsmanship.${this.craftsmanship.capitalize()}`);
    }

    /* -------------------------------------------- */

    /**
     * Properties for chat display.
     * @type {string[]}
     */
    get chatProperties(): string[] {
        const props = [];
        if (this.weight) props.push(`${this.weight} kg`);
        if (this.availability) props.push(this.availabilityLabel);
        if (this.craftsmanship && this.craftsmanship !== 'common') {
            props.push(this.craftsmanshipLabel);
        }
        return props;
    }
}
