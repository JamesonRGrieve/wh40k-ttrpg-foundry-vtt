import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
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

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but Foundry types don't reflect that
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

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
        if (!source) return;
        const restrictions = source['restrictions'];
        if (restrictions instanceof Object) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: restrictions is untyped Foundry migration data
            const restrictionsRecord = restrictions as Record<string, unknown>;
            if (restrictionsRecord['weaponClasses'] instanceof Set) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Set<unknown> required for Array.from on untyped Foundry SetField data
                restrictionsRecord['weaponClasses'] = Array.from(restrictionsRecord['weaponClasses'] as Set<unknown>);
            }
            if (restrictionsRecord['weaponTypes'] instanceof Set) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Set<unknown> required for Array.from on untyped Foundry SetField data
                restrictionsRecord['weaponTypes'] = Array.from(restrictionsRecord['weaponTypes'] as Set<unknown>);
            }
        }
        if (source['addedQualities'] instanceof Set) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Set<unknown> required for Array.from on untyped Foundry SetField data
            source['addedQualities'] = Array.from(source['addedQualities'] as Set<unknown>);
        }
        if (source['removedQualities'] instanceof Set) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Set<unknown> required for Array.from on untyped Foundry SetField data
            source['removedQualities'] = Array.from(source['removedQualities'] as Set<unknown>);
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get restrictions label.
     * @type {string}
     */
    get restrictionsLabel(): string {
        const parts: string[] = [];
        if (this.restrictions.weaponClasses.size > 0) {
            parts.push(`Classes: ${Array.from(this.restrictions.weaponClasses).join(', ')}`);
        }
        if (this.restrictions.weaponTypes.size > 0) {
            parts.push(`Types: ${Array.from(this.restrictions.weaponTypes).join(', ')}`);
        }
        const joined = parts.join('; ');
        return joined !== '' ? joined : game.i18n.localize('WH40K.Modification.NoRestrictions');
    }

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

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- intentionally invoke the prototype getter via .call
        const inheritedGetter = Object.getOwnPropertyDescriptor(PhysicalItemTemplate.prototype, 'chatProperties')?.get;
        const inheritedProps = (inheritedGetter?.call(this) ?? []) as string[];
        const props: string[] = [...inheritedProps, this.restrictionsLabel];

        const mods = this.modifiers;
        if (mods.damage !== 0) props.push(`Damage: ${mods.damage >= 0 ? '+' : ''}${mods.damage}`);
        if (mods.penetration !== 0) props.push(`Pen: ${mods.penetration >= 0 ? '+' : ''}${mods.penetration}`);
        if (mods.toHit !== 0) props.push(`To Hit: ${mods.toHit >= 0 ? '+' : ''}${mods.toHit}`);
        if (mods.range !== 0) props.push(`Range: ${mods.range >= 0 ? '+' : ''}${mods.range}`);

        if (this.addedQualities.size > 0) {
            props.push(`Adds: ${Array.from(this.addedQualities).join(', ')}`);
        }
        if (this.removedQualities.size > 0) {
            props.push(`Removes: ${Array.from(this.removedQualities).join(', ')}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel.headerLabels typed loosely across item types
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            restrictions: this.restrictionsLabel,
        };
    }
}
