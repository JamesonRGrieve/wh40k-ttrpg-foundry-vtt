import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Order items (ship orders/commands).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class OrderData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare category: string;
    declare actionType: string;
    declare test: { skill: string; characteristic: string; modifier: number };
    declare requirements: string;
    declare effect: string;
    declare failure: string;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends `any`; the as-unknown chain satisfies DataField.Any brand without runtime effect
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

            // Order category
            category: new fields.StringField({
                required: true,
                initial: 'combat',
                choices: ['combat', 'maneuver', 'command', 'support', 'special'],
            }),

            // Action type
            actionType: new fields.StringField({
                required: true,
                initial: 'extended-action',
                choices: ['extended-action', 'reaction', 'shooting-action', 'maneuver-action'],
            }),

            // Required test
            test: new fields.SchemaField({
                skill: new fields.StringField({ required: true, initial: 'command' }),
                characteristic: new fields.StringField({ required: false, blank: true }),
                modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
            }),

            // Requirements
            requirements: new fields.HTMLField({ required: false, blank: true }),

            // Effect on success
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Failure consequences
            failure: new fields.HTMLField({ required: false, blank: true }),

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
     * Get the category label.
     * @type {string}
     */
    get categoryLabel(): string {
        return game.i18n.localize(`WH40K.OrderCategory.${this.category.capitalize()}`);
    }

    /**
     * Pill descriptor consumed by item-list-row.hbs for the category badge.
     */
    get pill(): { bgClass: string; textClass: string; icon: string; label: string } {
        const map: Record<string, { bgClass: string; textClass: string; icon: string }> = {
            combat: { bgClass: 'tw-bg-[rgba(239,68,68,0.2)]', textClass: 'tw-text-[#ef4444]', icon: 'fa-crosshairs' },
            maneuver: { bgClass: 'tw-bg-[rgba(59,130,246,0.2)]', textClass: 'tw-text-[#3b82f6]', icon: 'fa-route' },
            command: { bgClass: 'tw-bg-[rgba(245,158,11,0.2)]', textClass: 'tw-text-[#f59e0b]', icon: 'fa-bullhorn' },
            support: { bgClass: 'tw-bg-[rgba(34,197,94,0.2)]', textClass: 'tw-text-[#22c55e]', icon: 'fa-hands-helping' },
            special: { bgClass: 'tw-bg-[rgba(139,92,246,0.2)]', textClass: 'tw-text-[#8b5cf6]', icon: 'fa-star' },
        };
        const fallback = { bgClass: 'tw-bg-[rgba(0,0,0,0.1)]', textClass: 'tw-text-[color:var(--wh40k-text-muted)]', icon: 'fa-ship' };
        return { ...(map[this.category] ?? fallback), label: this.categoryLabel };
    }

    /**
     * Get the action type label.
     * @type {string}
     */
    get actionTypeLabel(): string {
        return game.i18n.localize(
            `WH40K.ActionType.${this.actionType
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /**
     * Get the test description.
     * @type {string}
     */
    get testLabel(): string {
        let label = this.test.skill;
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
        const props = [this.categoryLabel, this.actionTypeLabel, `Test: ${this.testLabel}`];

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels is a free-form record consumed by sheet templates
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            category: this.categoryLabel,
            action: this.actionTypeLabel,
            test: this.testLabel,
        };
    }
}
