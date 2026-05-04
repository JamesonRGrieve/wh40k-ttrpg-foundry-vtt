import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * Data model for Condition items (status effects).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class ConditionData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: IdentifierField;
    declare nature: 'beneficial' | 'harmful' | 'neutral';
    declare effect: string;
    declare removal: string;
    declare stackable: boolean;
    declare stacks: number;
    declare appliesTo: 'self' | 'target' | 'both' | 'area';
    declare duration: { value: number; units: string };
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Is this a beneficial or harmful condition?
            nature: new fields.StringField({
                required: true,
                initial: 'harmful',
                choices: ['beneficial', 'harmful', 'neutral'],
            }),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // How to remove the condition
            removal: new fields.HTMLField({ required: false, blank: true }),

            // Is this stackable?
            stackable: new fields.BooleanField({ required: true, initial: false }),
            stacks: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),

            // Who does it apply to?
            appliesTo: new fields.StringField({
                required: true,
                initial: 'self',
                choices: ['self', 'target', 'both', 'area'],
            }),

            // Duration tracking
            duration: new fields.SchemaField({
                value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                units: new fields.StringField({
                    required: true,
                    initial: 'permanent',
                    choices: ['rounds', 'minutes', 'hours', 'days', 'permanent'],
                }),
            }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the nature label with safe fallback.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get natureLabel(): string {
        const key = `WH40K.Condition.Nature.${this.nature.capitalize()}`;
        return game.i18n.has(key) ? game.i18n.localize(key) : this.nature.capitalize();
    }

    /**
     * Get the nature icon class.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get natureIcon() {
        const icons = {
            beneficial: 'fa-plus-circle',
            harmful: 'fa-exclamation-triangle',
            neutral: 'fa-info-circle',
        };
        // Cast is safe because this.nature is guaranteed to be one of the keys by its type
        return icons[this.nature as keyof typeof icons] || 'fa-question-circle';
    }

    /**
     * Get the nature CSS class.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get natureClass(): string {
        return `nature-${this.nature}`;
    }

    /**
     * Get the appliesTo label with safe fallback.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get appliesToLabel(): string {
        const key = `WH40K.Condition.AppliesTo.${this.appliesTo.capitalize()}`;
        return game.i18n.has(key) ? game.i18n.localize(key) : this.appliesTo.capitalize();
    }

    /**
     * Get the appliesTo icon class.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get appliesToIcon() {
        const icons = {
            self: 'fa-user',
            target: 'fa-crosshairs',
            both: 'fa-users',
            area: 'fa-circle-notch',
        };
        // Cast is safe because this.appliesTo is guaranteed to be one of the keys by its type
        return icons[this.appliesTo as keyof typeof icons] || 'fa-question';
    }

    /**
     * Get the full name with stacks.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get fullName() {
        let name = this.parent?.name ?? '';
        if (this.stackable && this.stacks > 1) {
            name += ` (×${this.stacks})`;
        }
        return name;
    }

    /**
     * Get the duration display string.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get durationDisplay(): string {
        if (this.duration.units === 'permanent') {
            const key = 'WH40K.Condition.Duration.Permanent';
            return game.i18n.has(key) ? game.i18n.localize(key) : 'Permanent';
        }
        const unitKey = `WH40K.Condition.Duration.${this.duration.units.capitalize()}`;
        const unit = game.i18n.has(unitKey) ? game.i18n.localize(unitKey) : this.duration.units;
        return `${this.duration.value} ${unit}`;
    }

    /**
     * Is this condition temporary?
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get isTemporary() {
        return this.duration.units !== 'permanent';
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        const props = [this.natureLabel, this.appliesToLabel];

        if (this.stackable) {
            const stacksKey = 'WH40K.Condition.Stacks.Label';
            const stacksLabel = game.i18n.has(stacksKey) ? game.i18n.localize(stacksKey) : 'Stacks';
            props.push(`${stacksLabel}: ${this.stacks}`);
        }

        if (this.isTemporary) {
            const durationKey = 'WH40K.Condition.Duration.Label';
            const durationLabel = game.i18n.has(durationKey) ? game.i18n.localize(durationKey) : 'Duration';
            props.push(`${durationLabel}: ${this.durationDisplay}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            nature: this.natureLabel,
            stacks: this.stackable ? this.stacks : '-',
            duration: this.durationDisplay,
        };
    }
}
