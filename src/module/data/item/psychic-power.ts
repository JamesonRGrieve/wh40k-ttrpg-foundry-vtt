import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import ActivationTemplate from '../shared/activation-template.ts';
import DamageTemplate from '../shared/damage-template.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Psychic Power items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ActivationTemplate
 * @mixes DamageTemplate
 */
export default class PsychicPowerData extends ItemDataModel.mixin(DescriptionTemplate, ActivationTemplate, DamageTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare discipline: string;
    declare prCost: number;
    declare focusPower: { characteristic: string; modifier: number; threshold: number; opposed: boolean; opposedCharacteristic: string };
    declare effect: string;
    declare overbleed: string;
    declare isAttack: boolean;
    declare phenomenaModifier: number;
    declare sustained: boolean;
    declare rangePerPR: number;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Psychic discipline
            discipline: new fields.StringField({
                required: true,
                initial: 'telepathy',
                choices: ['telepathy', 'telekinesis', 'divination', 'pyromancy', 'biomancy', 'daemonology', 'malefic', 'sanctic'],
            }),

            // Psy Rating cost
            prCost: new fields.NumberField({ required: true, initial: 1, min: 0, integer: true }),

            // Focus Power Test
            focusPower: new fields.SchemaField({
                characteristic: new fields.StringField({
                    required: true,
                    initial: 'willpower',
                }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                threshold: new fields.NumberField({ required: false, initial: null }),
                opposed: new fields.BooleanField({ required: true, initial: false }),
                opposedCharacteristic: new fields.StringField({ required: false, blank: true }),
            }),

            // Power effect (enhanced description)
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Overbleed effect (pushing the power)
            overbleed: new fields.HTMLField({ required: false, blank: true }),

            // Is this an attack power?
            isAttack: new fields.BooleanField({ required: true, initial: false }),

            // Phenomena modifiers
            phenomenaModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),

            // Sustained power
            sustained: new fields.BooleanField({ required: true, initial: false }),

            // Range scaling with PR
            rangePerPR: new fields.NumberField({ required: false, initial: null }),

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
     * Get the discipline label.
     * @type {string}
     */
    get disciplineLabel(): string {
        return game.i18n.localize(`WH40K.PsychicDiscipline.${this.discipline.capitalize()}`);
    }

    /**
     * Get the focus power characteristic label.
     * @type {string}
     */
    get focusCharacteristicLabel(): string {
        return game.i18n.localize(`WH40K.Characteristic.${this.focusPower.characteristic.capitalize()}`);
    }

    /**
     * Get the focus test description.
     * @type {string}
     */
    get focusTestLabel(): string {
        let label = this.focusCharacteristicLabel;
        if (this.focusPower.modifier !== 0) {
            label += ` ${this.focusPower.modifier >= 0 ? '+' : ''}${this.focusPower.modifier}`;
        }
        if (this.focusPower.opposed) {
            const oppChar = this.focusPower.opposedCharacteristic || 'willpower';
            label += ` (Opposed by ${game.i18n.localize(`WH40K.Characteristic.${oppChar.capitalize()}`)})`;
        }
        return label;
    }

    /**
     * Is this power dangerous (causes phenomena)?
     * @type {boolean}
     */
    get causesPhenomena(): boolean {
        return true; // All psychic powers can cause phenomena
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [
            this.disciplineLabel,
            `PR Cost: ${this.prCost}`,
            `Focus: ${this.focusTestLabel}`,
            // @ts-expect-error - TS2339
            ...ActivationTemplate.prototype.chatProperties.call(this),
        ];

        if (this.isAttack) {
            // @ts-expect-error - TS2339
            props.push(...DamageTemplate.prototype.chatProperties.call(this));
        }

        if (this.sustained) {
            props.push(game.i18n.localize('WH40K.PsychicPower.Sustained'));
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            discipline: this.disciplineLabel,
            prCost: this.prCost,
            focus: this.focusTestLabel,
            action: this.activationLabel,
        };
    }
}
