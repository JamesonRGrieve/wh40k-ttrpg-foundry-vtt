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
    declare homebrew: {
        inventory: {
            profiles: Set<string>;
            weight: number | null;
        };
    };
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
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
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
                choices: () => {
                    const keys = Object.keys(CONFIG.wh40k.availabilities);
                    return keys.length > 0
                        ? keys
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
                          ];
                },
            }),
            craftsmanship: new fields.StringField({
                required: true,
                initial: 'common',
                choices: () => {
                    const keys = Object.keys(CONFIG.wh40k.craftsmanships);
                    return keys.length > 0 ? keys : ['poor', 'common', 'good', 'best'];
                },
            }),
            quantity: new fields.NumberField({
                required: true,
                nullable: false,
                initial: 1,
                min: 0,
                integer: true,
            }),
            // Inventory-generator tagging. Content-agnostic primitive: a free
            // set of profile tags + an optional relative draw weight. The tag
            // *values* (vendor types / armoury tiers) live in compendium
            // `_source/*.json`, never in `src/` (Direction #7). The generator
            // discovers the available profiles by scanning the packs at
            // runtime — nothing here enumerates them.
            homebrew: new fields.SchemaField({
                inventory: new fields.SchemaField({
                    profiles: new fields.SetField(new fields.StringField({ required: true, blank: false }), {
                        required: true,
                        initial: [],
                    }),
                    weight: new fields.NumberField({ required: false, nullable: true, initial: null, min: 0 }),
                }),
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel._migrateData receives raw unknown source data before schema validation
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        PhysicalItemTemplate.#migrateCost(source);
        PhysicalItemTemplate.#migrateHomebrew(source);
    }

    /**
     * Normalize the homebrew inventory-tag field shape so legacy documents
     * authored before the field existed validate under V14 strict mode.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData before schema validation
    static #migrateHomebrew(source: Record<string, unknown>): void {
        interface HomebrewShape {
            inventory?: {
                profiles?: unknown; // eslint-disable-line no-restricted-syntax -- boundary: pre-migration field value may be any type before schema validation
                weight?: unknown; // eslint-disable-line no-restricted-syntax -- boundary: pre-migration field value may be any type before schema validation
            };
        }
        const raw = (source['homebrew'] ?? {}) as HomebrewShape;
        const inv = raw.inventory ?? {};

        const profilesRaw = inv.profiles;
        const profiles = Array.isArray(profilesRaw)
            ? profilesRaw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map((p) => p.trim())
            : [];

        const weightRaw = inv.weight;
        let weight: number | null = null;
        if (weightRaw !== null && weightRaw !== undefined && weightRaw !== '') {
            const numeric = Number(weightRaw);
            if (Number.isFinite(numeric) && numeric >= 0) weight = numeric;
        }

        source['homebrew'] = { inventory: { profiles, weight } };
    }

    /**
     * Normalize cost field shape.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #migrateCost(source: Record<string, unknown>): void {
        const emptyCost = PhysicalItemTemplate.#emptyCost();
        // eslint-disable-next-line no-restricted-syntax -- boundary: normalizeNullableNumber receives raw field values from pre-migration source data
        const normalizeNullableNumber = (value: unknown): number | null => {
            if (value === null || value === undefined || value === '') return null;
            const numericValue = Number(value);
            if (!Number.isFinite(numericValue)) return null;
            return numericValue;
        };

        if (source['cost'] === null || source['cost'] === undefined || typeof source['cost'] !== 'object') {
            source['cost'] = emptyCost;
            return;
        }

        interface CostShape {
            dh1?: { throneGelt?: unknown }; // eslint-disable-line no-restricted-syntax -- boundary: pre-migration numeric field value may be any type
            dh2?: { influence?: unknown; homebrew?: { requisition?: unknown; throneGelt?: unknown } }; // eslint-disable-line no-restricted-syntax -- boundary: pre-migration numeric field values may be any type
            rt?: { profitFactor?: unknown }; // eslint-disable-line no-restricted-syntax -- boundary: pre-migration numeric field value may be any type
            dw?: { requisition?: unknown }; // eslint-disable-line no-restricted-syntax -- boundary: pre-migration numeric field value may be any type
            bc?: { infamy?: unknown }; // eslint-disable-line no-restricted-syntax -- boundary: pre-migration numeric field value may be any type
            ow?: { logistics?: unknown }; // eslint-disable-line no-restricted-syntax -- boundary: pre-migration numeric field value may be any type
        }
        const cost = source['cost'] as CostShape;

        source['cost'] = {
            dh1: {
                throneGelt: normalizeNullableNumber(cost.dh1?.throneGelt),
            },
            dh2: {
                influence: normalizeNullableNumber(cost.dh2?.influence),
                homebrew: {
                    requisition: normalizeNullableNumber(cost.dh2?.homebrew?.requisition),
                    throneGelt: normalizeNullableNumber(cost.dh2?.homebrew?.throneGelt),
                },
            },
            rt: {
                profitFactor: normalizeNullableNumber(cost.rt?.profitFactor),
            },
            dw: {
                requisition: normalizeNullableNumber(cost.dw?.requisition),
            },
            bc: {
                infamy: normalizeNullableNumber(cost.bc?.infamy),
            },
            ow: {
                logistics: normalizeNullableNumber(cost.ow?.logistics),
            },
        };
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: emptyCost returns a raw object assigned to source data before schema validation
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel._cleanData receives raw source before schema validation
    static override _cleanData(source: Record<string, unknown> | undefined, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
    }

    /* -------------------------------------------- */

    /**
     * Get the total weight considering quantity.
     * @type {number}
     */
    get totalWeight(): number {
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
