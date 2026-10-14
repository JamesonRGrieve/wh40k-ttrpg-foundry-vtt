import { t } from '../../i18n/t.ts';
import {
    DAMAGE_SOURCE_CHOICES,
    DAMAGE_TYPE_CHOICES,
    type DamageBand,
    type DamageSourceKind,
    damageTypeAbbreviation,
    formulaWithBonus,
} from '../../rules/damage-profile.ts';
import { normalizeNoDamageNotation } from '../../rules/no-damage.ts';
import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';
import SystemDataModel from '../abstract/system-data-model.ts';
import FormulaField from '../fields/formula-field.ts';

/** A damage profile as `DamageTemplate` declares it (#601 `none`, #608 bands / table / borrowed). */
export interface DamageProfileData {
    formula: string;
    type: string;
    bonus: number;
    penetration: number;
    none: boolean;
    /** Ordered range bands; the attack distance picks one (#608). */
    bands: DamageBand[];
    /** UUID of a RollTable whose results carry the damage (#608); '' = none. */
    table: string;
    /** Borrow the damage of the mounted weapon or the wielder's melee weapon (#608). */
    from: DamageSourceKind;
}

/** The FormulaField constructor options (the shipped field types reject the StringField options bag). */
type FormulaFieldOptions = ConstructorParameters<typeof FormulaField>[0];

/** A dice-formula field. */
function formulaField(options: { required: boolean; blank: boolean; initial: string }): FormulaField {
    // eslint-disable-next-line no-restricted-syntax -- boundary: FormulaField extends StringField, ctor param shape mismatch
    return new FormulaField(options as unknown as FormulaFieldOptions);
}

/**
 * Template for items that deal damage.
 * @mixin
 */
export default class DamageTemplate extends SystemDataModel {
    // Typed property declarations matching defineSchema()
    declare damage: DamageProfileData;
    declare special: Set<string>;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        const damageType = (): foundry.data.fields.DataField.Any =>
            new fields.StringField({ required: true, initial: 'impact', choices: [...DAMAGE_TYPE_CHOICES] });
        return {
            damage: new fields.SchemaField({
                formula: formulaField({ required: true, blank: true, initial: '' }),
                type: damageType(),
                bonus: new fields.NumberField({ required: true, initial: 0, integer: true }),
                penetration: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
                // A penetration the book prints as a value of the user ("equal to the
                // psyker's Psy Rating" → "PR"). When set it is rolled instead of `penetration`.
                penetrationFormula: formulaField({ required: false, blank: true, initial: '' }),
                // The book prints a dash: this profile deals no damage, so no damage
                // roll is made and only the qualities apply (#601). Distinct from an
                // empty `formula`, which means no dice were authored.
                none: new fields.BooleanField({ required: false, initial: false }),
                // Damage that depends on the attack (#608). Each is an alternative to
                // `formula`, resolved at attack time by `rules/damage-profile.ts`:
                // range bands picked by the measured distance (in authored order, the
                // last may be unbounded), a RollTable whose results carry the damage,
                // or the profile of the mounted weapon / the wielder's melee weapon.
                bands: new fields.ArrayField(
                    new fields.SchemaField({
                        maxRange: new fields.NumberField({ required: true, nullable: true, initial: null, min: 0 }),
                        formula: formulaField({ required: true, blank: false, initial: '1d10' }),
                        type: damageType(),
                        penetration: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 }),
                        bonus: new fields.NumberField({ required: true, initial: 0, integer: true }),
                        qualities: new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { required: true, initial: [] }),
                    }),
                    { required: false, initial: [] },
                ),
                table: new fields.DocumentUUIDField({ required: false, nullable: false, blank: true, initial: '', type: 'RollTable' }),
                from: new fields.StringField({ required: false, blank: true, initial: '', choices: [...DAMAGE_SOURCE_CHOICES] }),
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry migration source data
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        DamageTemplate.#migrateSpecial(source);
        normalizeNoDamageNotation(source);
    }

    /**
     * Migrate special from Array to Set.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry migration source data
    static #migrateSpecial(source: Record<string, unknown>): void {
        if (Array.isArray(source['special'])) {
            source['special'] = new Set(source['special']);
        }
    }

    static #emptyDamage(): DamageProfileData {
        return {
            formula: '',
            type: 'impact',
            bonus: 0,
            penetration: 0,
            none: false,
            bands: [],
            table: '',
            from: '',
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry _cleanData source data
    static override _cleanData(source?: Record<string, unknown>, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
    }

    /** @inheritdoc */
    override prepareBaseData(): void {
        super.prepareBaseData();

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry parent _source data
        const parent = this.parent as { _source?: { system?: Record<string, unknown> }; actor?: unknown } | undefined;
        const lineKey = inferActiveGameLine(parent ?? null);
        const resolvedSpecial = resolveLineVariant(this.special, lineKey) as string[] | Set<string> | null;

        // The resolved branch may be partial (an older per-line branch without the
        // #601 / #608 keys); the empty profile fills what it leaves out.
        this.damage = { ...DamageTemplate.#emptyDamage(), ...resolveLineVariant(this.damage, lineKey) };

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
        // Damage resolved at attack time (#608) labels what it depends on.
        if (dmg.bands.length > 0)
            return dmg.bands.map((band) => `${formulaWithBonus(band.formula, band.bonus)} ${damageTypeAbbreviation(band.type)}`).join(' / ');
        if (dmg.table !== '') return t('WH40K.Weapon.DamageProfile.Table');
        if (dmg.from === 'mount') return t('WH40K.Weapon.DamageProfile.Mount');
        if (dmg.from === 'wielder-melee') return t('WH40K.Weapon.DamageProfile.WielderMelee');
        if (dmg.formula === '') return '-';
        return `${formulaWithBonus(dmg.formula, dmg.bonus)} ${this.damageTypeAbbr}`;
    }

    /* -------------------------------------------- */

    /**
     * Get the damage type abbreviation.
     * @type {string}
     */
    get damageTypeAbbr(): string {
        return damageTypeAbbreviation(this.damage.type);
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
        const props: string[] = [];
        if (this.damage.formula !== '') {
            props.push(`Damage: ${this.damageLabel}`);
            props.push(`Pen: ${this.damage.penetration}`);
        }
        if (this.special.size > 0) {
            props.push(`Special: ${Array.from(this.special).join(', ')}`);
        }
        return props;
    }

    /* -------------------------------------------- */

    /**
     * Check if this has a specific special quality.
     * @param {string} quality   The quality to check.
     * @returns {boolean}
     */
    hasSpecial(quality: string): boolean {
        return this.special.has(quality.toLowerCase());
    }
}
