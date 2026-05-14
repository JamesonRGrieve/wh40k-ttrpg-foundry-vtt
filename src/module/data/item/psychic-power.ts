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

    // Getters from ActivationTemplate
    declare activationLabel: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but TS can't verify the mixin constraint without casting
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

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
     * Pill style descriptor consumed by item-list-row.hbs to render the
     * discipline badge.
     */
    get pill(): { bgClass: string; textClass: string; icon: string; label: string } {
        const map: Record<string, { bgClass: string; textClass: string }> = {
            telepathy: { bgClass: 'tw-bg-[rgba(139,92,246,0.2)]', textClass: 'tw-text-[#8b5cf6]' },
            telekinesis: { bgClass: 'tw-bg-[rgba(6,182,212,0.2)]', textClass: 'tw-text-[#06b6d4]' },
            divination: { bgClass: 'tw-bg-[rgba(245,158,11,0.2)]', textClass: 'tw-text-[#f59e0b]' },
            pyromancy: { bgClass: 'tw-bg-[rgba(239,68,68,0.2)]', textClass: 'tw-text-[#ef4444]' },
            biomancy: { bgClass: 'tw-bg-[rgba(34,197,94,0.2)]', textClass: 'tw-text-[#22c55e]' },
            daemonology: { bgClass: 'tw-bg-[rgba(220,38,38,0.2)]', textClass: 'tw-text-[#dc2626]' },
            malefic: { bgClass: 'tw-bg-[rgba(124,45,18,0.2)]', textClass: 'tw-text-[#7c2d12]' },
            sanctic: { bgClass: 'tw-bg-[rgba(234,179,8,0.2)]', textClass: 'tw-text-[#eab308]' },
        };
        const fallback = { bgClass: 'tw-bg-[rgba(0,0,0,0.1)]', textClass: 'tw-text-[color:var(--wh40k-text-muted)]' };
        return { ...(map[this.discipline] ?? fallback), icon: 'fa-brain', label: this.disciplineLabel };
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
            ...((Object.getOwnPropertyDescriptor(ActivationTemplate.prototype, 'chatProperties')?.get?.call(this) as string[] | undefined) ?? []),
        ];

        if (this.isAttack) {
            props.push(...((Object.getOwnPropertyDescriptor(DamageTemplate.prototype, 'chatProperties')?.get?.call(this) as string[] | undefined) ?? []));
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels return type mirrors base ItemDataModel schema
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            discipline: this.disciplineLabel,
            prCost: this.prCost,
            focus: this.focusTestLabel,
            action: this.activationLabel,
        };
    }
}
