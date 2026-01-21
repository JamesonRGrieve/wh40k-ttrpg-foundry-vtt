import ItemDataModel from '../abstract/item-data-model.mjs';
import DescriptionTemplate from '../shared/description-template.mjs';
import ModifiersTemplate from '../shared/modifiers-template.mjs';
import IdentifierField from '../fields/identifier-field.mjs';

/**
 * Data model for Critical Injury items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class CriticalInjuryData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    /** @inheritdoc */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Damage type that caused this
            damageType: new fields.StringField({
                required: true,
                initial: 'impact',
                choices: ['impact', 'rending', 'explosive', 'energy'],
            }),

            // Body part affected
            bodyPart: new fields.StringField({
                required: true,
                initial: 'body',
                choices: ['head', 'arm', 'body', 'leg'],
            }),

            // Current severity level (1-10+)
            severity: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),

            // LEGACY: Single effect description (deprecated, use effects object)
            effect: new fields.HTMLField({ required: false, blank: true }),

            // NEW: Effects object storing all severity levels (1-10)
            // Structure: { "1": { text: "...", permanent: false }, "2": { ... }, ... }
            effects: new fields.ObjectField({
                required: false,
                initial: {},
            }),

            // Is this injury permanent? (legacy, now stored per-severity in effects)
            permanent: new fields.BooleanField({ required: false, initial: false }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Check if this injury uses the new consolidated format.
     * @type {boolean}
     */
    get isConsolidated() {
        return Object.keys(this.effects || {}).length > 0;
    }

    /**
     * Get the current effect text for the active severity level.
     * Supports both legacy (single effect) and consolidated (effects object) formats.
     * @type {string}
     */
    get currentEffect() {
        if (this.isConsolidated) {
            const severityData = this.effects[this.severity];
            return severityData?.text || '';
        }
        // Legacy format
        return this.effect || '';
    }

    /**
     * Check if current severity is permanent.
     * @type {boolean}
     */
    get isPermanent() {
        if (this.isConsolidated) {
            const severityData = this.effects[this.severity];
            return severityData?.permanent || false;
        }
        // Legacy format
        return this.permanent || false;
    }

    /**
     * Get all severity levels available (1-10 or custom).
     * Returns array of numbers.
     * @type {number[]}
     */
    get availableSeverities() {
        if (this.isConsolidated) {
            return Object.keys(this.effects)
                .map((k) => parseInt(k))
                .sort((a, b) => a - b);
        }
        // Legacy format - only current severity
        return [this.severity];
    }

    /**
     * Get the damage type label.
     * @type {string}
     */
    get damageTypeLabel() {
        const key = `RT.DamageType.${this.damageType.capitalize()}`;
        return game.i18n.has(key) ? game.i18n.localize(key) : this.damageType.capitalize();
    }

    /**
     * Get the body part label.
     * @type {string}
     */
    get bodyPartLabel() {
        const key = `RT.BodyPart.${this.bodyPart.capitalize()}`;
        return game.i18n.has(key) ? game.i18n.localize(key) : this.bodyPart.capitalize();
    }

    /**
     * Get the severity label.
     * @type {string}
     */
    get severityLabel() {
        const key = 'RT.CriticalInjury.Severity';
        const label = game.i18n.has(key) ? game.i18n.localize(key) : 'Severity';
        return `${label}: ${this.severity}`;
    }

    /**
     * Get icon for damage type.
     * @type {string}
     */
    get damageTypeIcon() {
        const icons = {
            impact: 'fa-hammer',
            rending: 'fa-cut',
            explosive: 'fa-bomb',
            energy: 'fa-bolt',
        };
        return icons[this.damageType] || 'fa-band-aid';
    }

    /**
     * Get icon for body part.
     * @type {string}
     */
    get bodyPartIcon() {
        const icons = {
            head: 'fa-head-side-brain',
            arm: 'fa-hand-paper',
            body: 'fa-user',
            leg: 'fa-shoe-prints',
        };
        return icons[this.bodyPart] || 'fa-user';
    }

    /**
     * Get CSS class for severity level.
     * @type {string}
     */
    get severityClass() {
        if (this.severity <= 3) return 'severity-minor';
        if (this.severity <= 6) return 'severity-moderate';
        if (this.severity <= 9) return 'severity-severe';
        return 'severity-fatal';
    }

    /**
     * Get full injury description (combines effect + notes).
     * Uses currentEffect to support both legacy and consolidated formats.
     * @type {string}
     */
    get fullDescription() {
        let desc = this.currentEffect || '';
        if (this.notes) {
            desc += desc ? `\n\n<strong>Notes:</strong> ${this.notes}` : this.notes;
        }
        return desc;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties() {
        const props = [this.damageTypeLabel, this.bodyPartLabel, this.severityLabel];

        if (this.isPermanent) {
            const key = 'RT.CriticalInjury.Permanent';
            props.push(game.i18n.has(key) ? game.i18n.localize(key) : 'Permanent');
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels() {
        return {
            type: this.damageTypeLabel,
            location: this.bodyPartLabel,
            severity: `${this.severity}/10`,
        };
    }
}
