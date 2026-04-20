import SystemDataModel from '../abstract/system-data-model.ts';
import FormulaField from '../fields/formula-field.ts';
import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';

/**
 * Template for items that deal damage.
 * @mixin
 */
export default class DamageTemplate extends SystemDataModel {
    // Typed property declarations matching defineSchema()
    declare damage: { formula: string; type: string; bonus: number; penetration: number };
    declare special: Set<string>;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            damage: new fields.SchemaField({
                // @ts-expect-error - argument count
                formula: new FormulaField({ required: true, blank: true, initial: '' }),
                type: new fields.StringField({
                    required: true,
                    initial: 'impact',
                    choices: ['impact', 'rending', 'explosive', 'energy', 'fire', 'shock', 'cold', 'toxic'],
                }),
                bonus: new fields.NumberField({ required: true, initial: 0, integer: true }),
                penetration: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
            }),
            special: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: [] }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate damage data.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        DamageTemplate.#migrateSpecial(source);
    }

    /**
     * Migrate special from Array to Set.
     * @param {object} source  The source data
     */
    static #migrateSpecial(source: Record<string, unknown>): void {
        if (source.special && Array.isArray(source.special)) {
            source.special = new Set(source.special);
        }
    }

    static #emptyDamage(): Record<string, unknown> {
        return {
            formula: '',
            type: 'impact',
            bonus: 0,
            penetration: 0,
        };
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean damage template data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static _cleanData(source: Record<string, unknown> | undefined, options): void {
        super._cleanData?.(source, options);
    }

    /** @inheritdoc */
    prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        const resolvedDamage = resolveLineVariant(this.damage, lineKey) as Record<string, unknown>;
        const resolvedSpecial = resolveLineVariant(this.special, lineKey) as string[] | Set<string> | null;

        this.damage = foundry.utils.mergeObject(DamageTemplate.#emptyDamage(), resolvedDamage ?? {}, { inplace: false }) as typeof this.damage;

        if (resolvedSpecial instanceof Set) {
            this.special = resolvedSpecial;
        } else if (Array.isArray(resolvedSpecial)) {
            this.special = new Set(resolvedSpecial);
        } else {
            this.special = new Set();
        }
    }

    /* -------------------------------------------- */

    /**
     * Get a formatted damage string.
     * @type {string}
     */
    get damageLabel(): string {
        const dmg = this.damage;
        if (!dmg.formula) return '-';

        let label = dmg.formula;
        if (dmg.bonus > 0) label += `+${dmg.bonus}`;
        else if (dmg.bonus < 0) label += dmg.bonus.toString();

        return `${label} ${this.damageTypeAbbr}`;
    }

    /* -------------------------------------------- */

    /**
     * Get the damage type abbreviation.
     * @type {string}
     */
    get damageTypeAbbr() {
        const abbrs = {
            impact: 'I',
            rending: 'R',
            explosive: 'X',
            energy: 'E',
            fire: 'F',
            shock: 'S',
            cold: 'C',
            toxic: 'T',
        };
        return abbrs[this.damage.type] ?? this.damage.type.charAt(0).toUpperCase();
    }

    /* -------------------------------------------- */

    /**
     * Get localized damage type label.
     * @type {string}
     */
    get damageTypeLabel(): string {
        return game.i18n.localize(`WH40K.DamageType.${this.damage.type.capitalize()}`);
    }

    /* -------------------------------------------- */

    /**
     * Properties for chat display.
     * @type {string[]}
     */
    get chatProperties(): string[] {
        const props = [];
        if (this.damage.formula) {
            props.push(`Damage: ${this.damageLabel}`);
            props.push(`Pen: ${this.damage.penetration}`);
        }
        if (this.special?.size) {
            props.push(`Special: ${Array.from(this.special as Set<string>).join(', ')}`);
        }
        return props;
    }

    /* -------------------------------------------- */

    /**
     * Check if this has a specific special quality.
     * @param {string} quality   The quality to check.
     * @returns {boolean}
     */
    hasSpecial(quality): boolean {
        return this.special?.has(quality.toLowerCase()) ?? false;
    }
}
