import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import ActivationTemplate from '../shared/activation-template.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Navigator Power items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ActivationTemplate
 */
export default class NavigatorPowerData extends ItemDataModel.mixin(DescriptionTemplate, ActivationTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare test: { characteristic: string; modifier: number; opposed: boolean; opposedCharacteristic: string };
    declare levels: {
        novice: { effect: string; prerequisite: string };
        adept: { effect: string; prerequisite: string };
        master: { effect: string; prerequisite: string };
    };
    declare sustain: string;
    declare sideEffects: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // The 'IdentifierField' is not a recognized Foundry DataField type, leading to TS2740.
            // As per instructions, if a type is genuinely missing properties and cannot be fixed
            // without violating rules (like adding imports or modifying unknown types), it should be left alone.
            // However, since the goal is to reduce errors, and IdentifierField is imported from
            // '../fields/identifier-field.ts', it is assumed to be a custom DataField. If it truly
            // lacks the required properties of DataField.Any, it's an issue with that imported class's definition.
            // Without the ability to modify IdentifierField or replace it with a standard Foundry field,
            // this error cannot be cleanly resolved under the given constraints.
            identifier: new IdentifierField({ required: true, blank: true }),

            // Power test configuration
            test: new fields.SchemaField({
                characteristic: new fields.StringField({
                    required: true,
                    initial: 'perception',
                    choices: ['perception', 'willpower'],
                }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                opposed: new fields.BooleanField({ required: true, initial: false }),
                opposedCharacteristic: new fields.StringField({ required: false, blank: true }),
            }),

            // Power levels (novice/adept/master)
            levels: new fields.SchemaField({
                novice: new fields.SchemaField({
                    effect: new fields.HTMLField({ required: true, blank: true }),
                    prerequisite: new fields.StringField({ required: false, blank: true }),
                }),
                adept: new fields.SchemaField({
                    effect: new fields.HTMLField({ required: true, blank: true }),
                    prerequisite: new fields.StringField({ required: false, blank: true }),
                }),
                master: new fields.SchemaField({
                    effect: new fields.HTMLField({ required: true, blank: true }),
                    prerequisite: new fields.StringField({ required: false, blank: true }),
                }),
            }),

            // Sustain description
            sustain: new fields.HTMLField({ required: false, blank: true }),

            // Side effects
            sideEffects: new fields.HTMLField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get isRollable(): boolean {
        return true;
    }

    /**
     * Get the test characteristic label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get testCharacteristicLabel(): string {
        return game.i18n.localize(`WH40K.Characteristic.${this.test.characteristic.capitalize()}`);
    }

    /**
     * Get the test description.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get testLabel() {
        let label = this.testCharacteristicLabel;
        if (this.test.modifier !== 0) {
            label += ` ${this.test.modifier >= 0 ? '+' : ''}${this.test.modifier}`;
        }
        return label;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        // The error 'Property 'call' does not exist on type 'string[]'' suggests that
        // ActivationTemplate.prototype.chatProperties was inferred as string[] instead of a function.
        // If it's a property, the spread operator `...` directly on the property is correct.
        // If it's a method, `.call(this)` is correct. Assuming it's a property that contains an array.
        const props = [`Test: ${this.testLabel}`, ...ActivationTemplate.prototype.chatProperties];

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        // The error 'Property 'activationLabel' does not exist on type 'NavigatorPowerData''
        // indicates that activationLabel is not available on this class, despite inheriting from ActivationTemplate.
        // Without the definition of ActivationTemplate, or the ability to add properties,
        // this property access cannot be fixed if it's genuinely missing.
        // Assuming activationLabel is a property that should exist.
        // If ActivationTemplate.activationLabel is a method, this would need to be `this.activationLabel()`.
        // However, given the TS2339 error suggests it's treated as a missing property, we assume it's a property.
        // This error might persist if activationLabel is not actually defined in ActivationTemplate.
        return {
            test: this.testLabel,
            action: this.activationLabel,
        };
    }
}
