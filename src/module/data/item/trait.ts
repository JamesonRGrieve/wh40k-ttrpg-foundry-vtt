import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * Data model for Trait items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class TraitData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare category: string;
    declare requirements: string;
    declare benefit: string;
    declare level: number;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Category/type of trait
            category: new fields.StringField({
                required: false,
                initial: 'general',
                blank: true,
            }),

            // Requirements (text description)
            requirements: new fields.StringField({
                required: false,
                initial: '',
                blank: true,
            }),

            // Benefit/effect description (HTML)
            benefit: new fields.HTMLField({
                required: false,
                initial: '',
                blank: true,
            }),

            // Level/rating (matching template.json)
            level: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Does this trait have a level/rating?
     * @type {boolean}
     */
    get hasLevel(): boolean {
        return this.level > 0;
    }

    /**
     * Get the full name including level.
     * @type {string}
     */
    get fullName() {
        let name = this.parent?.name ?? '';
        if (this.hasLevel) {
            name += ` (${this.level})`;
        }
        return name;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [];

        if (this.hasLevel) {
            props.push(`Level: ${this.level}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            level: this.hasLevel ? this.level : '-',
        };
    }

    /**
     * Get category label.
     * @type {string}
     */
    get categoryLabel(): string {
        if (!this.category) return game.i18n.localize('WH40K.TraitCategory.General');
        const key = `WH40K.TraitCategory.${this.category.capitalize()}`;
        const localized = game.i18n.localize(key);
        return localized === key ? this.category : localized;
    }

    /**
     * Is this a variable trait (name contains (X))?
     * @type {boolean}
     */
    get isVariable() {
        const name = this.parent?.name ?? '';
        return name.includes('(X)') || name.includes('(x)');
    }

    /* -------------------------------------------- */
    /*  Vocalization                                */
    /* -------------------------------------------- */

    /**
     * Post this trait to chat as a rich card.
     * @param {object} [options]  Additional options
     * @returns {Promise<ChatMessage>}
     */
    async toChat(options = {}): Promise<void> {
        // Prepare template data
        const templateData = {
            trait: this.parent,
            category: this.category,
            categoryLabel: this.categoryLabel,
            level: this.level,
            hasLevel: this.hasLevel,
            requirements: this.requirements,
            benefit: this.benefit,
            notes: this.notes,
            fullName: this.fullName,
            isVariable: this.isVariable,
            timestamp: new Date().toLocaleString(),
        };

        // Render chat template
        const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/trait-card.hbs', templateData);

        // Prepare chat message data
        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            content: content,
            flags: {
                'wh40k-rpg': {
                    itemId: this.parent.id,
                    itemType: 'trait',
                },
            },
        };

        // Apply roll mode
        ChatMessage.applyRollMode(chatData, options.rollMode || game.settings.get('core', 'rollMode'));

        // Create and return chat message
        return ChatMessage.create(chatData);
    }
}
