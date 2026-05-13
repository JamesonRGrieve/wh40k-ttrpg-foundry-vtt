import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DamageTemplate from '../shared/damage-template.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';

/**
 * Data model for Ammunition items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes DamageTemplate
 */
export default class AmmunitionData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, DamageTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare weaponTypes: Set<string>;
    declare modifiers: { damage: number; penetration: number; range: number; rateOfFire: { single: number; semi: number; full: number } };
    declare addedQualities: Set<string>;
    declare removedQualities: Set<string>;
    declare clipModifier: number;
    declare effect: string;
    declare notes: string;
    declare source: { book: string; page: string; custom: string };

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

            // What weapon types can use this ammo
            weaponTypes: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Ammo modifiers (applied to weapon when loaded)
            modifiers: new fields.SchemaField({
                damage: new fields.NumberField({ required: true, initial: 0, integer: true }),
                penetration: new fields.NumberField({ required: true, initial: 0, integer: true }),
                range: new fields.NumberField({ required: true, initial: 0, integer: true }),
                rateOfFire: new fields.SchemaField({
                    single: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    semi: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    full: new fields.NumberField({ required: true, initial: 0, integer: true }),
                }),
            }),

            // Special qualities added by this ammo
            addedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Qualities removed by this ammo
            removedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Clip size modifier
            clipModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),

            // Effect description
            effect: new fields.HTMLField({ required: false, blank: true }),

            // Notes & source
            notes: new fields.StringField({ required: false, blank: true }),
            source: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Normalize ammunition data shape.
     * @param {object} source  The source data
     * @protected
     */
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
    }

    /** @inheritdoc */
    override prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        const resolvedWeaponTypes = resolveLineVariant(this.weaponTypes as unknown, lineKey);
        this.weaponTypes = new Set(
            Array.isArray(resolvedWeaponTypes) ? (resolvedWeaponTypes as string[]) : Array.from((resolvedWeaponTypes as Set<string>) ?? new Set()),
        );

        this.modifiers = foundry.utils.mergeObject(
            {
                damage: 0,
                penetration: 0,
                range: 0,
                rateOfFire: { single: 0, semi: 0, full: 0 },
            },
            (resolveLineVariant(this.modifiers as unknown, lineKey) as Record<string, unknown>) ?? {},
            { inplace: false },
        ) as typeof this.modifiers;

        const resolvedAdded = resolveLineVariant(this.addedQualities as unknown, lineKey);
        this.addedQualities = new Set(Array.isArray(resolvedAdded) ? (resolvedAdded as string[]) : Array.from((resolvedAdded as Set<string>) ?? new Set()));

        const resolvedRemoved = resolveLineVariant(this.removedQualities as unknown, lineKey);
        this.removedQualities = new Set(
            Array.isArray(resolvedRemoved) ? (resolvedRemoved as string[]) : Array.from((resolvedRemoved as Set<string>) ?? new Set()),
        );

        this.clipModifier = Number(resolveLineVariant(this.clipModifier as unknown, lineKey) ?? 0);
        this.effect = (resolveLineVariant(this.effect as unknown, lineKey) as string) ?? '';
        this.notes = (resolveLineVariant(this.notes as unknown, lineKey) as string) ?? '';
        this.source = (resolveLineVariant(this.source as unknown, lineKey) as { book: string; page: string; custom: string }) ?? {
            book: '',
            page: '',
            custom: '',
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the weapon types label.
     * @type {string}
     */
    get weaponTypesLabel(): string {
        if (!this.weaponTypes?.size) return game.i18n.localize('WH40K.Ammunition.AllWeapons');
        return Array.from(this.weaponTypes)
            .map((t) => {
                const label = CONFIG.WH40K?.weaponTypes?.[t]?.label;
                return label ? game.i18n.localize(label) : t;
            })
            .join(', ');
    }

    /**
     * Does this ammo modify weapon stats?
     * @type {boolean}
     */
    get hasModifiers(): boolean {
        const mods = this.modifiers;
        if (mods.damage !== 0) return true;
        if (mods.penetration !== 0) return true;
        if (mods.range !== 0) return true;
        if (Object.values(mods.rateOfFire).some((v) => v !== 0)) return true;
        return false;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [
            ...((Object.getOwnPropertyDescriptor(PhysicalItemTemplate.prototype, 'chatProperties')?.get?.call(this) as string[]) ?? []),
            `For: ${this.weaponTypesLabel}`,
        ];

        const mods = this.modifiers;
        if (mods.damage !== 0) {
            props.push(`Damage: ${mods.damage >= 0 ? '+' : ''}${mods.damage}`);
        }
        if (mods.penetration !== 0) {
            props.push(`Pen: ${mods.penetration >= 0 ? '+' : ''}${mods.penetration}`);
        }

        if (this.addedQualities.size) {
            props.push(`Adds: ${Array.from(this.addedQualities).join(', ')}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            weaponTypes: this.weaponTypesLabel,
        };
    }
}
