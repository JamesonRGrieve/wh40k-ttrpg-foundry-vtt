import SystemDataModel from '../abstract/system-data-model.ts';
import { inferActiveGameLine, isLineVariantContainer, resolveLineVariant } from '../../utils/item-variant-utils.ts';

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
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            attack: new fields.ObjectField({ required: true, initial: AttackTemplate.#emptyAttack() }),
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
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        AttackTemplate.#migrateRateOfFire(source);
    }

    /**
     * Migrate legacy rate of fire formats.
     * @param {object} source  The source data
     */
    static #migrateRateOfFire(source: Record<string, unknown>): void {
        if (!source.attack?.rateOfFire) return;
        const normalizeRateOfFire = (attack: Record<string, unknown>) => {
            const rof = attack?.rateOfFire;
            if (!rof) return;
            if (typeof rof.semi === 'string') rof.semi = Number(rof.semi) || 0;
            if (typeof rof.full === 'string') rof.full = Number(rof.full) || 0;
        };

        if (isLineVariantContainer(source.attack)) {
            for (const branch of Object.values(source.attack)) {
                if (branch && typeof branch === 'object') normalizeRateOfFire(branch as Record<string, unknown>);
            }
            return;
        }

        normalizeRateOfFire(source.attack);
    }

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
    static _cleanData(source: Record<string, unknown> | undefined, options): void {
        super._cleanData?.(source, options);
    }

    /** @inheritdoc */
    prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        const resolvedAttack = resolveLineVariant(this.attack, lineKey) as Record<string, unknown>;

        this.attack = foundry.utils.mergeObject(AttackTemplate.#emptyAttack(), resolvedAttack ?? {}, { inplace: false }) as typeof this.attack;
    }

    /* -------------------------------------------- */

    /**
     * Is this a melee attack?
     * @type {boolean}
     */
    get isMelee(): any {
        return this.attack.type === 'melee';
    }

    /**
     * Is this a ranged attack?
     * @type {boolean}
     */
    get isRanged(): any {
        return this.attack.type === 'ranged' || this.attack.type === 'thrown';
    }

    /**
     * Is this a psychic attack?
     * @type {boolean}
     */
    get isPsychic(): any {
        return this.attack.type === 'psychic';
    }

    /* -------------------------------------------- */

    /**
     * Get a formatted rate of fire string.
     * @type {string}
     */
    get rateOfFireLabel() {
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
