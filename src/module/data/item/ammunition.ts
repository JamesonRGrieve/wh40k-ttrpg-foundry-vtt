import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DamageTemplate from '../shared/damage-template.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';
import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';

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
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // What weapon types can use this ammo
            weaponTypes: new fields.ObjectField({ required: true, initial: [] }),

            // Ammo modifiers (applied to weapon when loaded)
            modifiers: new fields.ObjectField({
                required: true,
                initial: {
                    damage: 0,
                    penetration: 0,
                    range: 0,
                    rateOfFire: { single: 0, semi: 0, full: 0 },
                },
            }),

            // Special qualities added by this ammo
            addedQualities: new fields.ObjectField({ required: true, initial: [] }),

            // Qualities removed by this ammo
            removedQualities: new fields.ObjectField({ required: true, initial: [] }),

            // Clip size modifier
            clipModifier: new fields.ObjectField({ required: true, initial: 0 }),

            // Effect description
            effect: new fields.ObjectField({ required: false, initial: '' }),

            // Notes & source
            notes: new fields.ObjectField({ required: false, initial: '' }),
            source: new fields.ObjectField({ required: false, initial: '' }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate ammunition data.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        // Legacy field cleanup
        delete source.usedWith;
        delete source.damageOrEffect;
        delete source.qualities;
        delete source.damageModifier;
        delete source.penetrationModifier;
        delete source.specialRules;
    }

    /** @inheritdoc */
    prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        const resolvedWeaponTypes = resolveLineVariant(this.weaponTypes as unknown, lineKey);
        this.weaponTypes = new Set(Array.isArray(resolvedWeaponTypes) ? resolvedWeaponTypes : Array.from((resolvedWeaponTypes as Set<string>) ?? new Set()));

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
        this.addedQualities = new Set(Array.isArray(resolvedAdded) ? resolvedAdded : Array.from((resolvedAdded as Set<string>) ?? new Set()));

        const resolvedRemoved = resolveLineVariant(this.removedQualities as unknown, lineKey);
        this.removedQualities = new Set(Array.isArray(resolvedRemoved) ? resolvedRemoved : Array.from((resolvedRemoved as Set<string>) ?? new Set()));

        this.clipModifier = Number(resolveLineVariant(this.clipModifier as unknown, lineKey) ?? 0);
        this.effect = (resolveLineVariant(this.effect as unknown, lineKey) as string) ?? '';
        this.notes = (resolveLineVariant(this.notes as unknown, lineKey) as string) ?? '';
        this.source =
            (resolveLineVariant(this.source as unknown, lineKey) as { book: string; page: string; custom: string }) ??
            ({ book: '', page: '', custom: '' } as Record<string, string>);
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the weapon types label.
     * @type {string}
     */
    get weaponTypesLabel(): string {
        if (!this.weaponTypes || !this.weaponTypes.size) return game.i18n.localize('WH40K.Ammunition.AllWeapons');
        return Array.from(this.weaponTypes as Set<string>)
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
        // @ts-expect-error - TS2339
        const props = [...PhysicalItemTemplate.prototype.chatProperties.call(this), `For: ${this.weaponTypesLabel}`];

        const mods = this.modifiers;
        if (mods.damage !== 0) {
            props.push(`Damage: ${mods.damage >= 0 ? '+' : ''}${mods.damage}`);
        }
        if (mods.penetration !== 0) {
            props.push(`Pen: ${mods.penetration >= 0 ? '+' : ''}${mods.penetration}`);
        }

        if (this.addedQualities.size) {
            props.push(`Adds: ${Array.from(this.addedQualities as Set<string>).join(', ')}`);
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
