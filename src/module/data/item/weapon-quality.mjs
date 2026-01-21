import ItemDataModel from '../abstract/item-data-model.mjs';
import DescriptionTemplate from '../shared/description-template.mjs';
import IdentifierField from '../fields/identifier-field.mjs';

/**
 * Data model for Weapon Quality items (reference items for weapon qualities).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class WeaponQualityData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @inheritdoc */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

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
     * @inheritdoc
     */
    static migrateData(source) {
        // Migrate old schema fields to new schema
        // Old: { rating, modifiers, specialEffect }
        // New: { identifier, hasLevel, level, effect, notes }

        // Migrate rating -> hasLevel + level
        if ('rating' in source) {
            source.hasLevel = source.rating > 0;
            source.level = source.rating > 0 ? source.rating : null;
            delete source.rating;
        }

        // Migrate modifiers/specialEffect -> notes
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

        // Migrate corrupt effect field (sometimes stored as number instead of HTML)
        if (typeof source.effect === 'number') {
            // Convert number to placeholder text
            source.effect = `<p>Effect ${source.effect}</p>`;
        }

        // Ensure identifier exists (generate from name if missing)
        if (!source.identifier && source.name) {
            source.identifier = source.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }

        return super.migrateData(source);
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the full name including level.
     * @type {string}
     */
    get fullName() {
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
    get chatProperties() {
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
    get headerLabels() {
        return {
            level: this.hasLevel ? this.level : '-',
        };
    }
}
