import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Ship Weapon items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipWeaponData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare weaponType: string;
    declare location: string;
    declare hullType: Set<string>;
    declare power: number;
    declare space: number;
    declare shipPoints: number;
    declare strength: number;
    declare damage: string;
    declare crit: number;
    declare range: number;
    declare special: Set<string>;
    declare availability: string;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField at runtime but TypeScript doesn't know; cast needed for Foundry field registration
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

            // Weapon type
            weaponType: new fields.StringField({
                required: true,
                initial: 'macrobattery',
                choices: ['macrobattery', 'lance', 'nova-cannon', 'torpedo', 'bombardment-cannon', 'landing-bay', 'attack-craft'],
            }),

            // Firing arc/location
            location: new fields.StringField({
                required: true,
                initial: 'dorsal',
                choices: ['prow', 'dorsal', 'port', 'starboard', 'keel'],
            }),

            // Hull type restrictions
            hullType: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set(['all']) }),

            // Resource requirements
            power: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            space: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            shipPoints: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // Weapon stats
            strength: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),
            damage: new fields.StringField({ required: true, initial: '1d10' }),
            crit: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            range: new fields.NumberField({ required: true, initial: 5, min: 0 }),

            // Special qualities
            special: new fields.SetField(new fields.StringField({ required: true }), { required: true, initial: new Set() }),

            // Availability
            availability: new fields.StringField({
                required: true,
                initial: 'common',
            }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate ship weapon data.
     * @param {object} source  The source data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel._migrateData receives raw unknown source data before schema validation
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        ShipWeaponData.#migratePowerUsage(source);
        ShipWeaponData.#migrateSpaceUsage(source);
        ShipWeaponData.#migrateSpCost(source);
        ShipWeaponData.#migrateCritRating(source);
        ShipWeaponData.#migrateType(source);
        ShipWeaponData.#migrateNumericFields(source);
        ShipWeaponData.#migrateHullType(source);
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #migratePowerUsage(source: Record<string, unknown>): void {
        if ('powerUsage' in source && source['power'] === undefined) {
            source['power'] = source['powerUsage'];
            delete source['powerUsage'];
        }
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #migrateSpaceUsage(source: Record<string, unknown>): void {
        if ('spaceUsage' in source && source['space'] === undefined) {
            source['space'] = source['spaceUsage'];
            delete source['spaceUsage'];
        }
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #migrateSpCost(source: Record<string, unknown>): void {
        if ('spCost' in source && source['shipPoints'] === undefined) {
            source['shipPoints'] = source['spCost'];
            delete source['spCost'];
        }
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #migrateCritRating(source: Record<string, unknown>): void {
        if ('critRating' in source && source['crit'] === undefined) {
            source['crit'] = source['critRating'];
            delete source['critRating'];
        }
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #migrateType(source: Record<string, unknown>): void {
        if ('type' in source) {
            if (source['weaponType'] === null || source['weaponType'] === undefined || source['weaponType'] === '') {
                const typeMap: Record<string, string> = {
                    'macrocannon': 'macrobattery',
                    'macrobattery': 'macrobattery',
                    'lance': 'lance',
                    'torpedo': 'torpedo',
                    'topedo warhead': 'torpedo',
                    'nova cannon': 'nova-cannon',
                    'bombardment cannon': 'bombardment-cannon',
                    'landing bay': 'landing-bay',
                    'attack craft': 'attack-craft',
                };
                const normalized = (source['type'] as string).toLowerCase();
                source['weaponType'] = typeMap[normalized] ?? 'macrobattery';
            }
            delete source['type'];
        }
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #migrateNumericFields(source: Record<string, unknown>): void {
        const numericFields = ['power', 'space', 'shipPoints', 'crit', 'strength'];
        for (const field of numericFields) {
            if (source[field] === '-' || source[field] === null || source[field] === undefined) {
                source[field] = 0;
            } else if (typeof source[field] === 'string') {
                const fieldVal = source[field];
                const parsed = parseInt(fieldVal, 10);
                source[field] = Number.isNaN(parsed) ? 0 : parsed;
            }
        }
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #migrateHullType(source: Record<string, unknown>): void {
        if (typeof source['hullType'] === 'string') {
            const types = source['hullType']
                .toLowerCase()
                .replace(/all ships?/i, 'all')
                .split(/[,\s]+/)
                .map((s) => s.trim().replace(/\s+/g, '-'))
                .filter(Boolean);
            source['hullType'] = types.length > 0 ? types : ['all'];
        }
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean ship weapon data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel._cleanData receives raw source before schema validation; options is a Foundry framework type
    static override _cleanData(source: Record<string, unknown> | undefined, options: Record<string, unknown>): void {
        super._cleanData(source, options);
        // Ensure hullType is array
        if (source?.['hullType'] !== null && source?.['hullType'] !== undefined && !Array.isArray(source['hullType'])) {
            if (typeof source['hullType'] === 'string') {
                source['hullType'] = [source['hullType']];
            } else if (source['hullType'] instanceof Set) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: SetField stores unknown elements; cast is safe here as we're converting to array before schema validation
                source['hullType'] = Array.from(source['hullType'] as Set<unknown>);
            }
        }
        // Ensure special is array
        if (source?.['special'] !== null && source?.['special'] !== undefined && !Array.isArray(source['special'])) {
            if (typeof source['special'] === 'string') {
                source['special'] = source['special'].split(',').map((s) => s.trim());
            } else if (source['special'] instanceof Set) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: SetField stores unknown elements; cast is safe here as we're converting to array before schema validation
                source['special'] = Array.from(source['special'] as Set<unknown>);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get isRollable(): boolean {
        return true;
    }

    /**
     * Get the weapon type label.
     * @type {string}
     */
    get weaponTypeLabel(): string {
        return game.i18n.localize(
            `WH40K.ShipWeapon.${this.weaponType
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /**
     * Get the location label.
     * @type {string}
     */
    get locationLabel(): string {
        return game.i18n.localize(`WH40K.ShipLocation.${this.location.capitalize()}`);
    }

    /**
     * Get the damage string.
     * @type {string}
     */
    get damageLabel(): string {
        return `${this.damage}${this.crit > 0 ? ` (Crit ${this.crit}+)` : ''}`;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [
            this.weaponTypeLabel,
            `Location: ${this.locationLabel}`,
            `Str: ${this.strength}`,
            `Damage: ${this.damageLabel}`,
            `Range: ${this.range} VU`,
            `Power: ${this.power}`,
            `Space: ${this.space}`,
            `SP: ${this.shipPoints}`,
        ];

        if (this.special.size) {
            props.push(`Special: ${Array.from(this.special).join(', ')}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels return type is defined in ItemDataModel base class; values are primitive strings/numbers consumed by the sheet template
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            type: this.weaponTypeLabel,
            location: this.locationLabel,
            strength: this.strength,
            damage: this.damageLabel,
            range: `${this.range} VU`,
        };
    }
}
