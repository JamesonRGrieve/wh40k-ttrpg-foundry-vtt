import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Weapon Quality items (reference items for weapon qualities).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class WeaponQualityData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare hasLevel: boolean;
    declare level: number | null;
    declare effect: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Does this quality have a level/rating?
            hasLevel: new fields.BooleanField({ required: true, initial: false }),
            level: new fields.NumberField({ required: false, initial: null, min: 0, integer: true }),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate legacy weapon quality data to new structure.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, any>): void {
        super._migrateData?.(source);
        WeaponQualityData.#migrateRating(source);
        WeaponQualityData.#migrateModifiersAndEffect(source);
        WeaponQualityData.#migrateEffect(source);
        WeaponQualityData.#migrateIdentifier(source);
    }

    static #migrateRating(source: Record<string, any>): void {
        if ('rating' in source) {
            source.hasLevel = source.rating > 0;
            source.level = source.rating > 0 ? source.rating : null;
            delete source.rating;
        }
    }

    static #migrateModifiersAndEffect(source: Record<string, any>): void {
        if ('modifiers' in source || 'specialEffect' in source) {
            const notesParts = [];
            if (source.modifiers) {
                const mods = [];
                if (source.modifiers.damage) mods.push(`Damage: ${source.modifiers.damage >= 0 ? '+' : ''}${source.modifiers.damage}`);
                if (source.modifiers.penetration) mods.push(`Pen: ${source.modifiers.penetration >= 0 ? '+' : ''}${source.modifiers.penetration}`);
                if (source.modifiers.toHit) mods.push(`To Hit: ${source.modifiers.toHit >= 0 ? '+' : ''}${source.modifiers.toHit}`);
                if (source.modifiers.range) mods.push(`Range: ${source.modifiers.range >= 0 ? '+' : ''}${source.modifiers.range}`);
                if (mods.length > 0) notesParts.push(mods.join(', '));
                delete source.modifiers;
            }
            if (source.specialEffect) {
                notesParts.push(source.specialEffect);
                delete source.specialEffect;
            }
            if (notesParts.length > 0) {
                source.notes = notesParts.join('. ');
            }
        }
    }

    static #migrateEffect(source: Record<string, any>): void {
        if (typeof source.effect === 'number') {
            source.effect = `<p>Effect ${source.effect}</p>`;
        }
    }

    static #migrateIdentifier(source: Record<string, any>): void {
        if (!source.identifier && source.name) {
            source.identifier = source.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the full name including level.
     * @type {string}
     */
    get fullName(): string {
        let name = this.parent?.name ?? '';
        if (this.hasLevel && this.level !== null) {
            name += ` (${this.level})`;
        }
        return name;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [];
        if (this.hasLevel && this.level !== null) {
            props.push(`Level: ${this.level}`);
        }
        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            level: this.hasLevel ? this.level : '-',
        };
    }
}
