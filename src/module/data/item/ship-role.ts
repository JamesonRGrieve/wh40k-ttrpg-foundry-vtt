import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Ship Role items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class ShipRoleData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare rank: number;
    declare purpose: string;
    declare careerPreferences: string[];
    declare careerNote: string;
    declare subordinates: string[];
    declare importantSkills: Array<{ name: string; specialization: string }>;
    declare abilities: Array<{ name: string; description: string; bonus: number; action: string; actionType: string; skill: string }>;
    declare effect: string;
    declare shipBonuses: { manoeuvrability: number; detection: number; ballisticSkill: number; crewRating: number };
    declare skillBonuses: Record<string, unknown>;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Role rank/priority
            rank: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),

            // Role purpose/function
            purpose: new fields.HTMLField({ required: true, blank: true }),

            // Career preferences
            careerPreferences: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Career note (for "Usually X" text)
            careerNote: new fields.StringField({ required: false, blank: true }),

            // Subordinate roles
            subordinates: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Important skills
            importantSkills: new fields.ArrayField(
                new fields.SchemaField({
                    name: new fields.StringField({ required: true }),
                    specialization: new fields.StringField({ required: false, blank: true }),
                }),
                { required: true, initial: [] },
            ),

            // Special abilities/actions (modern structured data)
            abilities: new fields.ArrayField(
                new fields.SchemaField({
                    name: new fields.StringField({ required: true }),
                    description: new fields.HTMLField({ required: true }),
                    bonus: new fields.NumberField({ required: false, integer: true }),
                    action: new fields.StringField({ required: false, blank: true }),
                    actionType: new fields.StringField({
                        required: false,
                        blank: true,
                        choices: ['standard', 'extended', 'free', 'reaction', 'passive', 'special'],
                    }),
                    skill: new fields.StringField({ required: false, blank: true }),
                }),
                { required: true, initial: [] },
            ),

            // Effect description (HTML)
            effect: new fields.HTMLField({ required: false, blank: true }),

            // Ship bonuses (structured)
            shipBonuses: new fields.SchemaField(
                {
                    manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    detection: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    ballisticSkill: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    crewRating: new fields.NumberField({ required: true, initial: 0, integer: true }),
                },
                { required: false },
            ),

            // Skill bonuses (structured)
            skillBonuses: new fields.SchemaField({}, { required: false }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get formatted career preferences.
     * @type {string}
     */
    get careerPreferencesLabel(): string {
        if (!this.careerPreferences.length) return '-';
        let label = this.careerPreferences.join(', ');
        if (this.careerNote) label = `${this.careerNote}; ${label}`;
        return label;
    }

    /**
     * Get formatted subordinates.
     * @type {string}
     */
    get subordinatesLabel(): string {
        if (!this.subordinates.length) return '-';
        return this.subordinates.join(', ');
    }

    /**
     * Get formatted important skills.
     * @type {string}
     */
    get importantSkillsLabel(): string {
        if (!this.importantSkills.length) return '-';
        return this.importantSkills
            .map((skill) => {
                if (skill.specialization) return `${skill.name} (${skill.specialization})`;
                return skill.name;
            })
            .join(', ');
    }

    /**
     * Get primary ability description.
     * @type {string}
     */
    get primaryAbility() {
        if (this.abilities && this.abilities.length > 0) {
            const ability = this.abilities[0];
            return ability.description || ability.name;
        }
        return this.effect || '';
    }

    /**
     * Get all ship bonuses as array for display.
     * @type {Array<{label: string, value: number, display: string}>}
     */
    get shipBonusesArray() {
        const bonuses = [];
        const labels = {
            manoeuvrability: 'Manoeuvrability',
            detection: 'Detection',
            ballisticSkill: 'Ballistic Skill',
            crewRating: 'Crew Rating',
        };

        if (!this.shipBonuses) return bonuses;

        for (const [key, label] of Object.entries(labels)) {
            const value = this.shipBonuses[key] || 0;
            if (value !== 0) {
                bonuses.push({
                    label,
                    value,
                    display: value > 0 ? `+${value}` : `${value}`,
                });
            }
        }

        return bonuses;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [`Rank: ${this.rank}`, `Careers: ${this.careerPreferencesLabel}`, `Skills: ${this.importantSkillsLabel}`];

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            rank: this.rank,
        };
    }
}
