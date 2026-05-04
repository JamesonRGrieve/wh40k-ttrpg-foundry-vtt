import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import ActivationTemplate from '../shared/activation-template.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Ritual items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ActivationTemplate
 */
export default class RitualData extends ItemDataModel.mixin(DescriptionTemplate, ActivationTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare type: string;
    declare test: { characteristic: string; skill: string; modifier: number; threshold: number };
    declare requirements: string;
    declare effect: string;
    declare failure: string;
    declare costs: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Ritual type
            type: new fields.StringField({
                required: true,
                initial: 'prayer',
                choices: ['prayer', 'rite', 'invocation', 'ceremony', 'tech-rite'],
            }),

            // Required test
            test: new fields.SchemaField({
                characteristic: new fields.StringField({
                    required: true,
                    initial: 'willpower',
                }),
                skill: new fields.StringField({ required: false, blank: true }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                threshold: new fields.NumberField({ required: false, initial: null }),
            }),

            // Requirements
            requirements: new fields.HTMLField({ required: false, blank: true }),

            // Success effect
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Failure consequences
            failure: new fields.HTMLField({ required: false, blank: true }),

            // Costs (materials, time, etc.)
            costs: new fields.HTMLField({ required: false, blank: true }),

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
     * Get the ritual type label.
     * @type {string}
     */
    get typeLabel(): string {
        return game.i18n.localize(
            `WH40K.RitualType.${this.type
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /**
     * Pill style descriptor consumed by item-list-row.hbs to render the ritual
     * type badge. Maps each ritual type to its Tailwind background, text colour,
     * and FA icon.
     */
    get pill(): { bgClass: string; textClass: string; icon: string; label: string } {
        const map: Record<string, { bgClass: string; textClass: string; icon: string }> = {
            'prayer': { bgClass: 'tw-bg-[rgba(217,119,6,0.2)]', textClass: 'tw-text-[#d97706]', icon: 'fa-praying-hands' },
            'rite': { bgClass: 'tw-bg-[rgba(124,58,237,0.2)]', textClass: 'tw-text-[#7c3aed]', icon: 'fa-book-dead' },
            'invocation': { bgClass: 'tw-bg-[rgba(220,38,38,0.2)]', textClass: 'tw-text-[#dc2626]', icon: 'fa-hand-sparkles' },
            'ceremony': { bgClass: 'tw-bg-[rgba(2,132,199,0.2)]', textClass: 'tw-text-[#0284c7]', icon: 'fa-church' },
            'tech-rite': { bgClass: 'tw-bg-[rgba(100,116,139,0.2)]', textClass: 'tw-text-[#64748b]', icon: 'fa-cog' },
        };
        const fallback = { bgClass: 'tw-bg-[rgba(0,0,0,0.1)]', textClass: 'tw-text-[color:var(--wh40k-text-muted)]', icon: 'fa-scroll' };
        return { ...(map[this.type] ?? fallback), label: this.typeLabel };
    }

    /**
     * Get the test description.
     * @type {string}
     */
    get testLabel() {
        let label = game.i18n.localize(`WH40K.Characteristic.${this.test.characteristic.capitalize()}`);
        if (this.test.skill) label = this.test.skill;
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
        const props = [this.typeLabel, `Test: ${this.testLabel}`, ...ActivationTemplate.prototype.chatProperties.call(this)];

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            type: this.typeLabel,
            test: this.testLabel,
            action: this.activationLabel,
        };
    }
}
