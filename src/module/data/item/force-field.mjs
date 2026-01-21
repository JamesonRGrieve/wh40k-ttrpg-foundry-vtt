import ItemDataModel from '../abstract/item-data-model.mjs';
import DescriptionTemplate from '../shared/description-template.mjs';
import PhysicalItemTemplate from '../shared/physical-item-template.mjs';
import EquippableTemplate from '../shared/equippable-template.mjs';
import IdentifierField from '../fields/identifier-field.mjs';

/**
 * Data model for Force Field items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 */
export default class ForceFieldData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate) {
    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /**
     * Migrate legacy force field data to V13 schema.
     * @param {object} source  The source data
     * @returns {object}       Migrated data
     */
    static migrateData(source) {
        const updates = {};

        // Migrate old overloadThreshold field to overloadMin/overloadMax
        if (source.overloadThreshold !== undefined && source.overloadMin === undefined) {
            updates.overloadMin = 1;
            updates.overloadMax = source.overloadThreshold;
        }

        // Apply updates
        if (Object.keys(updates).length > 0) {
            foundry.utils.mergeObject(source, updates);
        }

        return source;
    }

    /** @inheritdoc */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Protection rating (1-100 roll threshold)
            protectionRating: new fields.NumberField({
                required: true,
                initial: 50,
                min: 0,
                max: 100,
                integer: true,
            }),

            // Current state
            activated: new fields.BooleanField({ required: true, initial: false }),
            overloaded: new fields.BooleanField({ required: true, initial: false }),

            // Overload threshold range (rolls within this range cause overload)
            // e.g., 01-10 means rolls 1-10 cause overload
            overloadMin: new fields.NumberField({
                required: true,
                initial: 1,
                min: 0,
                max: 100,
                integer: true,
            }),

            overloadMax: new fields.NumberField({
                required: true,
                initial: 10,
                min: 0,
                max: 100,
                integer: true,
            }),

            // Overload duration
            overloadDuration: new fields.StringField({
                required: true,
                initial: '1d5 rounds',
            }),

            // Effect description
            effect: new fields.HTMLField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get isRollable() {
        return true;
    }

    /**
     * Get the status label.
     * @type {string}
     */
    get statusLabel() {
        if (this.overloaded) return game.i18n.localize('RT.ForceField.Overloaded');
        if (this.activated) return game.i18n.localize('RT.ForceField.Active');
        return game.i18n.localize('RT.ForceField.Inactive');
    }

    /**
     * Is the field currently providing protection?
     * @type {boolean}
     */
    get isProtecting() {
        return this.activated && !this.overloaded;
    }

    /**
     * Get craftsmanship-derived modifiers for force fields.
     * Applies Rogue Trader force field craftsmanship rules:
     *
     * FORCE FIELDS:
     * - Poor: Overload on 01-20
     * - Common: Overload on 01-10
     * - Good: Overload on 01-05
     * - Best: Overload on 01 only (1% chance)
     *
     * @type {object}
     */
    get craftsmanshipModifiers() {
        const mods = {
            overloadMin: 1,
            overloadMax: 10,
        };

        switch (this.craftsmanship) {
            case 'poor':
                mods.overloadMax = 20; // 01-20 overload (20% chance)
                break;
            case 'common':
                mods.overloadMax = 10; // 01-10 overload (10% chance)
                break;
            case 'good':
                mods.overloadMax = 5; // 01-05 overload (5% chance)
                break;
            case 'best':
                mods.overloadMax = 1; // 01 only overload (1% chance)
                break;
        }

        return mods;
    }

    /**
     * Get effective overload range (including craftsmanship).
     * @type {object}
     */
    get effectiveOverloadRange() {
        const craftMods = this.craftsmanshipModifiers;

        // If item has explicit overload values, use those
        // Otherwise use craftsmanship-derived values
        if (this.overloadMin !== 1 || this.overloadMax !== 10) {
            return {
                min: this.overloadMin,
                max: this.overloadMax,
            };
        }

        return {
            min: craftMods.overloadMin,
            max: craftMods.overloadMax,
        };
    }

    /**
     * Check if a protection roll causes overload.
     * @param {number} roll - The d100 protection roll
     * @returns {boolean}
     */
    checksOverload(roll) {
        const range = this.effectiveOverloadRange;
        return roll >= range.min && roll <= range.max;
    }

    /**
     * Get overload range label for display.
     * @type {string}
     */
    get overloadRangeLabel() {
        const range = this.effectiveOverloadRange;
        if (range.min === range.max) {
            return `${String(range.min).padStart(2, '0')}`;
        }
        return `${String(range.min).padStart(2, '0')}-${String(range.max).padStart(2, '0')}`;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties() {
        const props = [
            ...PhysicalItemTemplate.prototype.chatProperties.call(this),
            `Protection: ${this.protectionRating}%`,
            `Overload: ${this.overloadRangeLabel}`,
            this.statusLabel,
        ];

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels() {
        return {
            protection: `${this.protectionRating}%`,
            overload: this.overloadRangeLabel,
            status: this.statusLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels() {
        return {
            protection: `${this.protectionRating}%`,
            overload: `${this.overloadThreshold}+`,
            status: this.statusLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Toggle activation state.
     * @returns {Promise<Item>}
     */
    async toggleActivated() {
        return this.parent?.update({ 'system.activated': !this.activated });
    }

    /**
     * Set overloaded state.
     * @param {boolean} overloaded
     * @returns {Promise<Item>}
     */
    async setOverloaded(overloaded) {
        return this.parent?.update({ 'system.overloaded': overloaded });
    }

    /**
     * Recover from overload.
     * @returns {Promise<Item>}
     */
    async recover() {
        return this.parent?.update({ 'system.overloaded': false });
    }

    /**
     * Roll protection check against incoming damage.
     * @param {object} [options] - Roll options
     * @returns {Promise<object>} - Result object with { isProtected: boolean, overloaded: boolean, roll: Roll }
     */
    async rollProtection(options = {}) {
        if (!this.isProtecting) {
            return { isProtected: false, overloaded: false, roll: null, inactive: true };
        }

        // Roll d100
        const roll = await new Roll('1d100').evaluate();

        // Check if protected (roll <= protection rating)
        const isProtected = roll.total <= this.protectionRating;

        // Check if overloaded (roll in overload range)
        const overloaded = this.checksOverload(roll.total);

        // Show roll to chat
        await roll.toMessage({
            flavor: game.i18n.format('RT.ForceField.ProtectionRoll', {
                name: this.parent?.name || 'Force Field',
                isProtected: isProtected ? game.i18n.localize('RT.ForceField.Protected') : game.i18n.localize('RT.ForceField.NotProtected'),
                overloaded: overloaded ? ` (${game.i18n.localize('RT.ForceField.Overloaded')}!)` : '',
            }),
            speaker: options.speaker,
        });

        // Update overload state if necessary
        if (overloaded) {
            await this.setOverloaded(true);
        }

        return { isProtected, overloaded, roll };
    }
}
