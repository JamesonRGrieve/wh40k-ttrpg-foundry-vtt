import ItemDataModel from '../abstract/item-data-model.ts';
import { identifierField } from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import { normalizeNestedToArray, normalizeToArray } from '../shared/normalize-to-array.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';

/**
 * Data model for Weapon Modification items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 */
export default class WeaponModificationData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare category: string;
    declare restrictions: { weaponClasses: Set<string>; weaponTypes: Set<string> };
    declare modifiers: {
        damage: number;
        penetration: number;
        range: number;
        rangeMultiplier: number;
        clip: number;
        toHit: number;
        weight: number;
        rateOfFire: { single: number; semi: number; full: number };
    };
    declare addedQualities: Set<string>;
    declare removedQualities: Set<string>;
    declare effect: string;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: identifierField({ required: true, blank: true }),

            // Modification category (for visual grouping and icons)
            category: new fields.StringField({
                required: true,
                initial: 'accessory',
                choices: ['sight', 'barrel', 'stock', 'magazine', 'accessory', 'other'],
            }),

            // What weapon classes/types this can be applied to
            restrictions: new fields.SchemaField({
                weaponClasses: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set() }),
                weaponTypes: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set() }),
            }),

            // Stat modifiers
            modifiers: new fields.SchemaField({
                damage: new fields.NumberField({ required: true, initial: 0, integer: true }),
                penetration: new fields.NumberField({ required: true, initial: 0, integer: true }),
                range: new fields.NumberField({ required: true, initial: 0, integer: true }),
                rangeMultiplier: new fields.NumberField({ required: true, initial: 1, min: 0 }),
                clip: new fields.NumberField({ required: true, initial: 0, integer: true }),
                toHit: new fields.NumberField({ required: true, initial: 0, integer: true }),
                weight: new fields.NumberField({ required: true, initial: 0 }),
                rateOfFire: new fields.SchemaField({
                    single: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    semi: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    full: new fields.NumberField({ required: true, initial: 0, integer: true }),
                }),
            }),

            // Qualities added
            addedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set() }),

            // Qualities removed
            removedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set() }),

            // Effect description
            effect: new fields.HTMLField({ required: false }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Convert SetField values to Arrays for storage. The schema initial
     * for the `restrictions.weapon{Classes,Types}` / `addedQualities` /
     * `removedQualities` fields is `new Set()` for in-memory ergonomics,
     * but Foundry's persistence layer JSON-serializes the cleaned data and
     * Sets are not JSON-serializable — they round-trip to `{}` on save,
     * which then fails SetField validation on the next load, causing
     * `Item.create` to silently return null.
     *
     * `ArmourModificationData` already handles this; mirror it here.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _cleanData receives raw untyped Foundry source data; Record<string,unknown> is the documented DataModel pattern
    static override _cleanData(source: Record<string, unknown> | undefined, options: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
        // Convert SetFields to arrays for storage (see normalize-to-array.ts).
        normalizeNestedToArray(source, 'restrictions', 'weaponClasses');
        normalizeNestedToArray(source, 'restrictions', 'weaponTypes');
        normalizeToArray(source, 'addedQualities');
        normalizeToArray(source, 'removedQualities');
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get category icon class.
     * @type {string}
     */
    get categoryIcon(): string {
        const icons: Record<string, string | undefined> = {
            sight: 'fa-crosshairs',
            barrel: 'fa-gun',
            stock: 'fa-wrench',
            magazine: 'fa-database',
            accessory: 'fa-cog',
            other: 'fa-tools',
        };
        return icons[this.category] ?? 'fa-cog';
    }

    /**
     * Get category label.
     * @type {string}
     */
    get categoryLabel(): string {
        return game.i18n.localize(`WH40K.Modification.Category.${this.category.capitalize()}`);
    }

    /**
     * Has any non-zero modifiers?
     * @type {boolean}
     */
    get hasModifiers(): boolean {
        const mods = this.modifiers;
        if (mods.damage !== 0) return true;
        if (mods.penetration !== 0) return true;
        if (mods.range !== 0) return true;
        if (mods.rangeMultiplier !== 1) return true;
        if (mods.clip !== 0) return true;
        if (mods.toHit !== 0) return true;
        if (mods.weight !== 0) return true;
        if (Object.values(mods.rateOfFire).some((v) => v !== 0)) return true;
        return false;
    }
}
