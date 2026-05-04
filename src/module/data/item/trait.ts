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

            // This field might need adjustment if IdentifierField is not directly compatible
            // with foundry.data.fields.DataField.Any, but adhering to prompt rules for now.
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
     * @scripts/gen-i18n-types.mjs {boolean}
     */
    get hasLevel(): boolean {
        return this.level > 0;
    }

    /**
     * Get the full name including level.
     * @scripts/gen-i18n-types.mjs {string}
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

    /** @foundry-v14-overrides.d.ts */
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

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            level: this.hasLevel ? this.level : '-',
        };
    }

    /**
     * Get category label.
     * @scripts/gen-i18n-types.mjs {string}
     */
    get categoryLabel(): string {
        if (!this.category) return game.i18n.localize('WH40K.TraitCategory.General');
        const key = `WH40K.TraitCategory.${this.category.capitalize()}`;
        const localized = game.i18n.localize(key);
        return localized === key ? this.category : localized;
    }

    /**
     * Is this a variable trait (name contains (X))?
     * @scripts/gen-i18n-types.mjs {boolean}
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
     * @param [options]  Additional options
     * @returns {Promise<ChatMessage>}
     */
    async toChat(options = {}): Promise<ChatMessage> {
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
            // Use a specific chat message type if applicable, otherwise OTHER is fine.
            // If the type error persists, it might indicate a need to use a more specific type from CONST.CHAT_MESSAGE_TYPES.
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            content: content,
            flags: {
                'wh40k-rpg': {
                    // Fixed 'any' type for itemId and ensured it's a string.
                    itemId: this.parent?.id ?? '',
                    itemType: 'trait',
                },
            },
        };

        // Apply roll mode. Casting to Record<string, unknown> to satisfy type checker
        // for object modification by applyRollMode.
        ChatMessage.applyRollMode(chatData as Record<string, unknown>, options.rollMode || game.settings.get('core', 'rollMode'));

        // Create and return chat message.
        // The return type of toChat has been updated to Promise<ChatMessage> to match ChatMessage.create.
        return ChatMessage.create(chatData);
    }
}
