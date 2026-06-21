import { formatSigned } from '../../utils/format.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import { normalizeToArray } from '../shared/normalize-to-array.ts';
import ShipStatModifiersTemplate, { type ShipStatModifiers } from '../shared/ship-stat-modifiers-template.ts';

/**
 * Data model for Ship Component items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ShipStatModifiersTemplate
 */
export default class ShipComponentData extends ItemDataModel.mixin(DescriptionTemplate, ShipStatModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare componentType: string;
    declare hullType: Set<string>;
    declare power: { used: number; generated: number };
    declare space: number;
    declare shipPoints: number;
    declare availability: string;
    // modifiers (ship-stat block + hasModifiers/modifiersList) from ShipStatModifiersTemplate.
    declare modifiers: ShipStatModifiers;
    declare effect: string;
    declare essential: boolean;
    declare condition: string;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but TS can't verify the mixin constraint without casting
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

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

            // Stat modifiers (9-field block) come from ShipStatModifiersTemplate.

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel override; source mirrors parent migrateData signature
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel override; source mirrors parent cleanData signature
    static override _cleanData(source?: Record<string, unknown>, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
        // Convert the hullType SetField to an array before Foundry serializes (see normalize-to-array.ts).
        normalizeToArray(source, 'hullType', { stringMode: 'wrap' });
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

    // hasModifiers / modifiersList are inherited from ShipStatModifiersTemplate.

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [this.componentTypeLabel, `Hull: ${this.hullTypeLabel}`, `Power: ${this.powerLabel}`, `Space: ${this.space}`, `SP: ${this.shipPoints}`];

        for (const mod of this.modifiersList) {
            props.push(`${mod.label}: ${formatSigned(mod.value)}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels return type mirrors base ItemDataModel schema
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            type: this.componentTypeLabel,
            power: this.powerLabel,
            space: this.space,
            sp: this.shipPoints,
        };
    }
}
