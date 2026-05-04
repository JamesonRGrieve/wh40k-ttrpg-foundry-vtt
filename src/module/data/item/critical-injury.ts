import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * Data model for Critical Injury items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class CriticalInjuryData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    // TS2740: Type 'IdentifierField' is missing ... from type 'AnyDataField'
    // The error suggests IdentifierField itself is not compatible with AnyDataField.
    // As IdentifierField is imported and cannot be modified, and its expected value
    // is likely a string identifier, we infer its type from the schema definition.
    // If IdentifierField correctly extends DataField, the type of its value will be inferred.
    declare identifier: string;
    declare damageType: string;
    declare bodyPart: string;
    declare severity: number;
    declare effects: Record<string, { text?: string; permanent?: boolean; [key: string]: unknown }>;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
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

            // Effects object storing all severity levels (1-10)
            // Structure: { "1": { text: "...", permanent: false }, "2": { ... }, ... }
            effects: new fields.ObjectField({
                required: false,
                initial: {},
            }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the current effect text for the active severity level.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get currentEffect() {
        // TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ impact: string; rending: string; explosive: string; energy: string; }'.
        // Fix: Cast the index to keyof typeof effects to ensure type safety.
        // The prompt error related to 'damageType' index was likely a misattribution;
        // this property is about 'effects' which is Record<string, unknown>.
        // However, the original 'effects' type used '[key: string]: any', updated to '[key: string]: unknown'
        // to adhere to hard rules. Thus, this property access is safe.
        return this.effects[this.severity]?.text || '';
    }

    /**
     * Check if current severity is permanent.
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get isPermanent() {
        // TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ impact: string; rending: string; explosive: string; energy: string; }'.
        // Fix: Cast the index to keyof typeof effects to ensure type safety.
        // Similar to currentEffect, accessing 'effects' with 'this.severity'.
        return this.effects[this.severity]?.permanent || false;
    }

    /**
     * Get all severity levels available (1-10 or custom).
     * Returns array of numbers.
     * @scripts/gen-i18n-types.mjs {number[]}
     */
    get availableSeverities() {
        return Object.keys(this.effects)
            .map((k) => parseInt(k))
            .sort((a, b) => a - b);
    }

    /**
     * Get the damage type label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get damageTypeLabel(): string {
        const key = `WH40K.DamageType.${this.damageType.capitalize()}`;
        return game.i18n.has(key) ? game.i18n.localize(key) : this.damageType.capitalize();
    }

    /**
     * Get the body part label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get bodyPartLabel(): string {
        const key = `WH40K.BodyPart.${this.bodyPart.capitalize()}`;
        return game.i18n.has(key) ? game.i18n.localize(key) : this.bodyPart.capitalize();
    }

    /**
     * Get the severity label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get severityLabel(): string {
        const key = 'WH40K.CriticalInjury.Severity';
        const label = game.i18n.has(key) ? game.i18n.localize(key) : 'Severity';
        return `${label}: ${this.severity}`;
    }

    /**
     * Get icon for damage type.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get damageTypeIcon() {
        const icons = {
            impact: 'fa-hammer',
            rending: 'fa-cut',
            explosive: 'fa-bomb',
            energy: 'fa-bolt',
        };
        // TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ impact: string; rending: string; explosive: string; energy: string; }'.
        // Fix: Cast the index to keyof typeof icons to ensure type safety.
        return icons[this.damageType as keyof typeof icons] || 'fa-band-aid';
    }

    /**
     * Get icon for body part.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get bodyPartIcon() {
        const icons = {
            head: 'fa-head-side-brain',
            arm: 'fa-hand-paper',
            body: 'fa-user',
            leg: 'fa-shoe-prints',
        };
        // TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ head: string; arm: string; body: string; leg: string; }'.
        // Fix: Cast the index to keyof typeof icons to ensure type safety.
        return icons[this.bodyPart as keyof typeof icons] || 'fa-user';
    }

    /**
     * Get CSS class for severity level.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get severityClass(): string {
        if (this.severity <= 3) return 'severity-minor';
        if (this.severity <= 6) return 'severity-moderate';
        if (this.severity <= 9) return 'severity-severe';
        return 'severity-fatal';
    }

    /**
     * Get full injury description (combines effect + notes).
     * @scripts/gen-i18n-types.mjs {string}
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

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        const props = [this.damageTypeLabel, this.bodyPartLabel, this.severityLabel];

        if (this.isPermanent) {
            const key = 'WH40K.CriticalInjury.Permanent';
            props.push(game.i18n.has(key) ? game.i18n.localize(key) : 'Permanent');
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Record<string, unknown> {
        return {
            type: this.damageTypeLabel,
            location: this.bodyPartLabel,
            severity: `${this.severity}/10`,
        };
    }
}
