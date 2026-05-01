import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Ship Component items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipComponentData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare componentType: string;
    declare hullType: Set<string>;
    declare power: { used: number; generated: number };
    declare space: number;
    declare shipPoints: number;
    declare availability: string;
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
    declare essential: boolean;
    declare condition: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Component type/category
            componentType: new fields.StringField({
                required: true,
                initial: 'essential',
                choices: [
                    'essential',
                    'supplemental',
                    'weapons',
                    'auger',
                    'gellarField',
                    'voidShields',
                    'warpDrive',
                    'lifeSupport',
                    'quarters',
                    'bridge',
                    'generatorum',
                    'plasmaDrive',
                    'augment',
                    'archeotech',
                    'xenotech',
                ],
            }),

            // Hull type restrictions
            hullType: new fields.SetField(
                new fields.StringField({
                    required: true,
                    choices: ['transport', 'raider', 'frigate', 'light-cruiser', 'cruiser', 'battlecruiser', 'grand-cruiser', 'all'],
                }),
                { required: true, initial: new Set(['all']) },
            ),

            // Resource requirements
            power: new fields.SchemaField({
                used: new fields.NumberField({ required: true, initial: 0, integer: true }),
                generated: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            space: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // Ship Points cost
            shipPoints: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // Availability
            availability: new fields.StringField({
                required: true,
                initial: 'common',
                choices: ['ubiquitous', 'abundant', 'plentiful', 'common', 'average', 'scarce', 'rare', 'very-rare', 'extremely-rare', 'near-unique', 'unique'],
            }),

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

            // Is this component essential (cannot be removed)?
            essential: new fields.BooleanField({ required: true, initial: false }),

            // Component condition
            condition: new fields.StringField({
                required: true,
                initial: 'functional',
                choices: ['functional', 'damaged', 'unpowered', 'destroyed'],
            }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Normalize ship component data shape.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean ship component data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static _cleanData(source: Record<string, unknown> | undefined, options: Record<string, unknown>): void {
        super._cleanData?.(source, options);
        // Ensure hullType is array for Set field
        if (source && source.hullType && !Array.isArray(source.hullType)) {
            if (typeof source.hullType === 'string') {
                source.hullType = [source.hullType];
            } else if (source.hullType instanceof Set) {
                source.hullType = Array.from(source.hullType);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the component type label.
     * @type {string}
     */
    get componentTypeLabel(): string {
        return game.i18n.localize(`WH40K.ShipComponent.${this.componentType.capitalize()}`);
    }

    /**
     * Get the hull type label.
     * @type {string}
     */
    get hullTypeLabel(): string {
        if (this.hullType.has('all')) return game.i18n.localize('WH40K.HullType.All');
        return Array.from(this.hullType)
            .map((h) =>
                game.i18n.localize(
                    `WH40K.HullType.${h
                        .split('-')
                        .map((s) => s.capitalize())
                        .join('')}`,
                ),
            )
            .join(', ');
    }

    /**
     * Net power usage (positive = consumes, negative = generates).
     * @type {number}
     */
    get netPower(): number {
        return this.power.used - this.power.generated;
    }

    /**
     * Get power display string.
     * @type {string}
     */
    get powerLabel(): string {
        if (this.power.generated > 0) return `+${this.power.generated}`;
        if (this.power.used > 0) return `−${this.power.used}`;
        return '0';
    }

    /**
     * Power display for templates (alias for powerLabel).
     * @type {string}
     */
    get powerDisplay(): string {
        return this.powerLabel;
    }

    /**
     * Is this component operational?
     * @type {boolean}
     */
    get isOperational(): boolean {
        return this.condition === 'functional';
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
        const props = [this.componentTypeLabel, `Hull: ${this.hullTypeLabel}`, `Power: ${this.powerLabel}`, `Space: ${this.space}`, `SP: ${this.shipPoints}`];

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
            type: this.componentTypeLabel,
            power: this.powerLabel,
            space: this.space,
            sp: this.shipPoints,
        };
    }
}
