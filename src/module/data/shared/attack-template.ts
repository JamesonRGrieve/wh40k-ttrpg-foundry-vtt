import { inferActiveGameLine, resolveLineVariant } from '../../utils/item-variant-utils.ts';
import SystemDataModel from '../abstract/system-data-model.ts';

/** Typed shape of the parent document's _source.system used during prepareBaseData. */
interface AttackParentSource {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry _source.system is untyped at this layer; Record<string,unknown> is the narrowest safe type
    _source?: { system?: Record<string, unknown> };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry parent actor reference is untyped at the DataModel layer
    actor?: unknown;
}

/**
 * Template for items with attack capabilities.
 * @mixin
 */
export default class AttackTemplate extends SystemDataModel {
    // Typed property declarations matching defineSchema()
    declare attack: {
        type: string;
        characteristic: string;
        modifier: number;
        range: { value: number; units: string; special: string };
        rateOfFire: { single: boolean; semi: number; full: number };
    };

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            attack: new fields.SchemaField({
                type: new fields.StringField({
                    required: true,
                    initial: 'melee',
                    choices: ['melee', 'ranged', 'thrown', 'psychic'],
                }),
                characteristic: new fields.StringField({
                    required: true,
                    initial: 'weaponSkill',
                    choices: ['weaponSkill', 'ballisticSkill', 'willpower', 'perception'],
                }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                range: new fields.SchemaField({
                    value: new fields.NumberField({ required: false, initial: 0, min: 0 }),
                    units: new fields.StringField({ required: false, initial: 'm' }),
                    special: new fields.StringField({ required: false, blank: true }),
                }),
                rateOfFire: new fields.SchemaField({
                    single: new fields.BooleanField({ required: true, initial: true }),
                    semi: new fields.NumberField({ required: true, initial: 0, min: 0 }),
                    full: new fields.NumberField({ required: true, initial: 0, min: 0 }),
                }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate attack data.
     * @param {object} source  The source data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel override; source mirrors parent migrateData signature
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: attack empty-value shape mirrors Foundry Record schema
    static #emptyAttack(): Record<string, unknown> {
        return {
            type: 'melee',
            characteristic: 'weaponSkill',
            modifier: 0,
            range: {
                value: 0,
                units: 'm',
                special: '',
            },
            rateOfFire: {
                single: true,
                semi: 0,
                full: 0,
            },
        };
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean attack template data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel override; source mirrors parent cleanData signature
    static override _cleanData(source?: Record<string, unknown>, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
    }

    /** @inheritdoc */
    override prepareBaseData(): void {
        super.prepareBaseData();

        const parent = this.parent as AttackParentSource | undefined;
        const lineKey = inferActiveGameLine(parent?._source?.system ?? {}, parent ?? null);
        // eslint-disable-next-line no-restricted-syntax -- boundary: per-line variant resolved at runtime
        const resolvedAttack = resolveLineVariant(this.attack, lineKey) as Record<string, unknown>;

        this.attack = foundry.utils.mergeObject(AttackTemplate.#emptyAttack(), resolvedAttack, { inplace: false }) as typeof this.attack;
    }

    /* -------------------------------------------- */

    /**
     * Is this a melee attack?
     * @type {boolean}
     */
    get isMelee(): boolean {
        return this.attack.type === 'melee';
    }

    /**
     * Is this a ranged attack?
     * @type {boolean}
     */
    get isRanged(): boolean {
        return this.attack.type === 'ranged' || this.attack.type === 'thrown';
    }

    /**
     * Is this a psychic attack?
     * @type {boolean}
     */
    get isPsychic(): boolean {
        return this.attack.type === 'psychic';
    }

    /* -------------------------------------------- */

    /**
     * Get a formatted rate of fire string.
     * @type {string}
     */
    get rateOfFireLabel(): string {
        const rof = this.attack.rateOfFire;
        const parts = [];
        parts.push(rof.single ? 'S' : '-');
        parts.push(rof.semi > 0 ? rof.semi.toString() : '-');
        parts.push(rof.full > 0 ? rof.full.toString() : '-');
        return parts.join('/');
    }

    /* -------------------------------------------- */

    /**
     * Get a formatted range string.
     * @type {string}
     */
    get rangeLabel(): string {
        const range = this.attack.range;
        if (range.special) return range.special;
        if (range.value) return `${range.value}${range.units}`;
        return '-';
    }

    /* -------------------------------------------- */

    /**
     * Properties for chat display.
     * @type {string[]}
     */
    get chatProperties(): string[] {
        const props = [];
        if (this.isRanged) {
            props.push(`Range: ${this.rangeLabel}`);
            props.push(`RoF: ${this.rateOfFireLabel}`);
        }
        return props;
    }
}
