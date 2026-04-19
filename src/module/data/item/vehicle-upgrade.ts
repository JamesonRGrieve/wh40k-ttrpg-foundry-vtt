import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Vehicle Upgrade items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class VehicleUpgradeData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare upgradeType: string;
    declare allowedVehicles: string;
    declare difficulty: number;
    declare descriptionText: string;
    declare availability: string;
    declare source: string;
    declare installCost: number;
    declare modifiers: { speed: number; manoeuvrability: number; armour: number; integrity: number };
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Upgrade type (Standard, Integral, Custom)
            upgradeType: new fields.StringField({
                required: true,
                initial: 'standard',
                choices: ['standard', 'integral', 'custom'],
                label: 'WH40K.VehicleUpgrade.Type',
            }),

            // Allowed vehicles (Any, Ground Only, etc.)
            allowedVehicles: new fields.StringField({
                required: false,
                initial: 'any',
                blank: true,
                label: 'WH40K.VehicleUpgrade.AllowedVehicles',
            }),

            // Installation difficulty modifier
            difficulty: new fields.NumberField({
                required: true,
                initial: 0,
                integer: true,
                label: 'WH40K.VehicleUpgrade.Difficulty',
            }),

            // Plain text description
            descriptionText: new fields.StringField({ required: false, initial: '', blank: true }),

            // Availability
            availability: new fields.StringField({
                required: true,
                initial: 'common',
                label: 'WH40K.Availability',
            }),

            // Source book reference
            source: new fields.StringField({ required: false, initial: '', blank: true }),

            // Installation cost (Throne Gelt or Influence)
            installCost: new fields.NumberField({
                required: true,
                initial: 0,
                min: 0,
                integer: true,
                label: 'WH40K.VehicleUpgrade.InstallCost',
            }),

            // Stat modifiers
            modifiers: new fields.SchemaField({
                speed: new fields.NumberField({ required: true, initial: 0, integer: true }),
                manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
                armour: new fields.NumberField({ required: true, initial: 0, integer: true }),
                integrity: new fields.NumberField({ required: true, initial: 0, integer: true }),
            }),

            // Notes
            notes: new fields.StringField({ required: false, initial: '', blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

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
                const label = game.i18n.localize(`WH40K.VehicleStat.${key.charAt(0).toUpperCase()}${key.slice(1)}`);
                list.push({
                    key,
                    label,
                    value,
                    formatted: `${(value as number) >= 0 ? '+' : ''}${value as number}`,
                });
            }
        }
        return list;
    }

    /**
     * Get upgrade type label from config.
     * @type {string}
     */
    get upgradeTypeLabel(): string {
        const types = CONFIG.wh40k?.vehicleUpgradeTypes || {};
        const typeData = types[this.upgradeType];
        if (typeData) {
            return game.i18n.localize(typeData.label);
        }
        return this.upgradeType;
    }

    /**
     * Get difficulty formatted with sign.
     * @type {string}
     */
    get difficultyFormatted(): string {
        if (this.difficulty === 0) return '+0';
        return `${this.difficulty > 0 ? '+' : ''}${this.difficulty}`;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [
            game.i18n.localize(`WH40K.Availability.${this.availability.charAt(0).toUpperCase()}${this.availability.slice(1)}`),
            `Type: ${this.upgradeTypeLabel}`,
            `Difficulty: ${this.difficultyFormatted}`,
        ];

        if (this.installCost > 0) {
            props.push(`Cost: ${this.installCost}`);
        }

        for (const mod of this.modifiersList) {
            props.push(`${mod.label}: ${mod.formatted}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            availability: this.availability,
            type: this.upgradeTypeLabel,
        };
    }
}
