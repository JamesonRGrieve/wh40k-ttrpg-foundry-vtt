import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Skill items (compendium reference skills).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class SkillData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare characteristic: string;
    declare skillType: string;
    declare isBasic: boolean;
    declare aptitudes: string[];
    declare specializations: string[];
    declare descriptor: string;
    declare uses: string;
    declare type: string;
    declare requirements: string;
    declare source: { book: string; page: string; custom: string };
    declare specialRules: string;
    declare exampleDifficulties: Array<{ difficulty: string; modifier: number; example: string }>;
    declare useTime: string;
    declare rollConfig: { defaultModifier: number; canBeUsedUntrained: boolean; untrainedPenalty: number };

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but isn't statically typed as such; cast required for constructor call
            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

            // Linked characteristic
            characteristic: new fields.StringField({
                required: false,
                initial: 'intelligence',
                blank: true,
            }),

            // Skill type
            skillType: new fields.StringField({
                required: false,
                initial: 'basic',
                choices: ['basic', 'advanced', 'specialist'],
            }),

            // Is this a basic skill (can be used untrained)?
            isBasic: new fields.BooleanField({ required: true, initial: false }),

            // Associated aptitudes
            aptitudes: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Predefined specializations for specialist skills
            specializations: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Descriptor (short usage description)
            descriptor: new fields.StringField({ required: false, blank: true }),

            // Common uses
            uses: new fields.HTMLField({ required: false, blank: true }),

            // Special rules for this skill
            specialRules: new fields.HTMLField({ required: false, blank: true }),

            // Example difficulties
            exampleDifficulties: new fields.ArrayField(
                new fields.SchemaField({
                    difficulty: new fields.StringField({ required: true }),
                    modifier: new fields.NumberField({ required: true, integer: true }),
                    example: new fields.StringField({ required: true }),
                }),
                { required: true, initial: [] },
            ),

            // Time to use
            useTime: new fields.StringField({ required: false, blank: true }),

            // Default roll configuration
            rollConfig: new fields.SchemaField({
                defaultModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                canBeUsedUntrained: new fields.BooleanField({ required: true, initial: true }),
                untrainedPenalty: new fields.NumberField({ required: true, initial: -20, integer: true }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the characteristic label.
     * @type {string}
     */
    get characteristicLabel(): string {
        if (!this.characteristic) return '';
        const key = `WH40K.Characteristic.${this.characteristic.capitalize()}`;
        const localized = game.i18n.localize(key);
        return localized === key ? this.characteristic : localized;
    }

    /**
     * Get the characteristic abbreviation.
     * @type {string}
     */
    get characteristicAbbr(): string {
        const abbrs: Record<string, string> = {
            weaponSkill: 'WS',
            ballisticSkill: 'BS',
            strength: 'S',
            toughness: 'T',
            agility: 'Ag',
            intelligence: 'Int',
            perception: 'Per',
            willpower: 'WP',
            fellowship: 'Fel',
        };
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: abbrs[this.characteristic] may be undefined
        return abbrs[this.characteristic] ?? this.characteristic ?? '';
    }

    /**
     * Get the skill type label.
     * @type {string}
     */
    get skillTypeLabel(): string {
        return game.i18n.localize(`WH40K.SkillType.${this.skillType.capitalize()}`);
    }

    /**
     * Is this a specialist skill with predefined specializations?
     * @type {boolean}
     */
    get hasSpecializations(): boolean {
        return this.skillType === 'specialist' && this.specializations.length > 0;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [`${this.characteristicLabel} (${this.characteristicAbbr})`, this.skillTypeLabel];

        if (this.isBasic) {
            props.push(game.i18n.localize('WH40K.Skill.Basic'));
        }

        if (this.aptitudes.length) {
            props.push(`Aptitudes: ${this.aptitudes.join(', ')}`);
        }

        if (this.useTime) {
            props.push(`Time: ${this.useTime}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, string> | Array<Record<string, string>> {
        return {
            characteristic: this.characteristicAbbr,
            type: this.skillTypeLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Methods                                     */
    /* -------------------------------------------- */

    /**
     * Post this skill to chat.
     * @returns {Promise<ChatMessage|null>}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create return type is opaque; unknown is the honest type here
    async toChat(): Promise<unknown> {
        const parent = this.parent as { id: string; name: string };
        const messageData = {
            style: CONST.CHAT_MESSAGE_STYLES.OTHER,
            speaker: ChatMessage.getSpeaker(),
            content: await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/skill-card.hbs', { skill: this.parent }),
            flags: {
                'wh40k-rpg': {
                    skillId: parent.id,
                    skillName: parent.name,
                    type: 'skill-card',
                },
            },
        };

        return ChatMessage.create(messageData);
    }
}
