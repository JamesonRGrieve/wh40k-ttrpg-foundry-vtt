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

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but TypeScript cannot verify the constructor shape; cast required for Foundry field registration
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: _migrateData is a Foundry framework override; parameter type is dictated by ItemDataModel base class
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
    }

    /** @inheritdoc */
    override prepareBaseData(): void {
        super.prepareBaseData();

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument -- boundary: this.parent._source is an opaque Foundry Document source; _source type is any in Foundry's type definitions
        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        // eslint-disable-next-line no-restricted-syntax -- boundary: weaponTypes may be a line-variant object {default: Set, bc: Set, ...}; cast to unknown required for resolveLineVariant dispatch
        const resolvedWeaponTypes = resolveLineVariant(this.weaponTypes as unknown, lineKey);
        this.weaponTypes = new Set(
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- resolvedWeaponTypes may be undefined at runtime when variant key is absent; defensive fallback required
            Array.isArray(resolvedWeaponTypes) ? (resolvedWeaponTypes as string[]) : Array.from((resolvedWeaponTypes as Set<string>) ?? new Set()),
        );

        // eslint-disable-next-line no-restricted-syntax -- boundary: resolveLineVariant accepts unknown to dispatch over line-variant union shapes; casts are necessary throughout this block
        this.modifiers = foundry.utils.mergeObject(
            {
                damage: 0,
                penetration: 0,
                range: 0,
                rateOfFire: { single: 0, semi: 0, full: 0 },
            },
            // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: resolveLineVariant may return undefined at runtime when variant key is absent despite the cast type
            (resolveLineVariant(this.modifiers as unknown, lineKey) as Record<string, unknown>) ?? {},
            { inplace: false },
        ) as typeof this.modifiers;

        // eslint-disable-next-line no-restricted-syntax -- boundary: line-variant dispatch requires unknown cast; resolved value may be array or Set
        const resolvedAdded = resolveLineVariant(this.addedQualities as unknown, lineKey);
        this.addedQualities = new Set(
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- resolvedAdded may be undefined at runtime when variant key is absent
            Array.isArray(resolvedAdded) ? (resolvedAdded as string[]) : Array.from((resolvedAdded as Set<string>) ?? new Set()),
        );

        // eslint-disable-next-line no-restricted-syntax -- boundary: line-variant dispatch requires unknown cast; resolved value may be array or Set
        const resolvedRemoved = resolveLineVariant(this.removedQualities as unknown, lineKey);
        this.removedQualities = new Set(
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- resolvedRemoved may be undefined at runtime when variant key is absent
            Array.isArray(resolvedRemoved) ? (resolvedRemoved as string[]) : Array.from((resolvedRemoved as Set<string>) ?? new Set()),
        );

        // eslint-disable-next-line no-restricted-syntax -- boundary: line-variant dispatch requires unknown cast; resolved scalar values cast at call site
        this.clipModifier = Number(resolveLineVariant(this.clipModifier as unknown, lineKey) ?? 0);
        // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: resolveLineVariant may return undefined at runtime when variant key is absent
        this.effect = (resolveLineVariant(this.effect as unknown, lineKey) as string) ?? '';
        // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: resolveLineVariant may return undefined at runtime when variant key is absent
        this.notes = (resolveLineVariant(this.notes as unknown, lineKey) as string) ?? '';
        // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: resolveLineVariant may return undefined at runtime when variant key is absent
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
        if (!this.weaponTypes.size) return game.i18n.localize('WH40K.Ammunition.AllWeapons');
        return Array.from(this.weaponTypes)
            .map((t) => {
                // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: CONFIG.WH40K is populated at Foundry runtime; optional chaining guards against missing registry during early init or tests
                const label = CONFIG.WH40K?.weaponTypes?.[t]?.label;
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- label type may appear non-nullable after the optional chain but can be undefined at runtime
                return label !== undefined ? game.i18n.localize(label) : t;
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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- getOwnPropertyDescriptor may return undefined at runtime despite mixin type guarantees; defensive fallback required
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels return type is dictated by ItemDataModel base class; cannot be narrowed without breaking the override contract
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            weaponTypes: this.weaponTypesLabel,
        };
    }
}
