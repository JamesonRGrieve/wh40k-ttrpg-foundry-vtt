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

            // @ts-expect-error - argument count
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

    /** @override */
    get isRollable(): boolean {
        return true;
    }

    /**
     * Get the test characteristic label.
     * @type {string}
     */
    get testCharacteristicLabel(): string {
        return game.i18n.localize(`WH40K.Characteristic.${this.test.characteristic.capitalize()}`);
    }

    /**
     * Get the test description.
     * @type {string}
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

    /** @override */
    get chatProperties(): string[] {
        // @ts-expect-error - TS2339
        const props = [`Test: ${this.testLabel}`, ...ActivationTemplate.prototype.chatProperties.call(this)];

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            test: this.testLabel,
            action: this.activationLabel,
        };
    }
}
