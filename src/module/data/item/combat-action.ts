import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Combat Action items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class CombatActionData extends ItemDataModel.mixin(DescriptionTemplate) {
    [key: string]: any;

    // Typed property declarations matching defineSchema()
    declare actionType: string;
    declare subtypes: Set<string>;
    declare attackModifier: number;
    declare isAttack: boolean;
    declare isMovement: boolean;
    declare isConcentration: boolean;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = (foundry.data as any).fields;
        return {
            ...super.defineSchema(),

            // Action timing
            actionType: new fields.StringField({
                required: true,
                initial: 'Half',
                choices: ['Half', 'Full', 'Reaction', 'Free', '2Full'],
            }),

            // Action categories (multiple allowed)
            subtypes: new fields.SetField(
                new fields.StringField({
                    required: true,
                    choices: ['Attack', 'Movement', 'Concentration', 'Miscellaneous', 'Melee', 'Ranged'],
                }),
                { required: true, initial: [] },
            ),

            // Combat modifiers
            attackModifier: new fields.NumberField({
                required: true,
                initial: 0,
                integer: true,
            }),

            // Quick flags for filtering
            isAttack: new fields.BooleanField({ required: true, initial: false }),
            isMovement: new fields.BooleanField({ required: true, initial: false }),
            isConcentration: new fields.BooleanField({ required: true, initial: false }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate combat action data.
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source: Record<string, any>): void {
        super._migrateData?.(source);
        // Ensure subtypes is an array for SetField compatibility
        if (!Array.isArray(source.subtypes)) {
            source.subtypes = source.subtypes ? Array.from(source.subtypes) : [];
        }
    }

    /** @inheritdoc */
    prepareDerivedData(): void {
        super.prepareDerivedData();

        // Auto-set flags based on subtypes
        this.isAttack = this.subtypes?.has('Attack') ?? false;
        this.isMovement = this.subtypes?.has('Movement') ?? false;
        this.isConcentration = this.subtypes?.has('Concentration') ?? false;
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get formatted action type display.
     * @type {string}
     */
    get actionTypeLabel() {
        const labels = {
            'Half': 'Half Action',
            'Full': 'Full Action',
            'Reaction': 'Reaction',
            'Free': 'Free Action',
            '2Full': '2 Full Actions',
        };
        return labels[this.actionType] ?? this.actionType;
    }

    /**
     * Get formatted attack modifier display.
     * @type {string}
     */
    get attackModifierLabel(): string {
        if (this.attackModifier === 0) return '';
        return this.attackModifier > 0 ? `+${this.attackModifier}` : this.attackModifier.toString();
    }

    /**
     * Get subtypes as array for display.
     * @type {string[]}
     */
    get subtypesList() {
        return Array.from((this.subtypes || []) as Iterable<string>);
    }

    /**
     * Properties for chat display.
     * @type {string[]}
     */
    get chatProperties(): string[] {
        const props = [];

        props.push(this.actionTypeLabel);

        if (this.subtypesList.length > 0) {
            props.push(this.subtypesList.join(', '));
        }

        if (this.attackModifier !== 0) {
            props.push(`Attack: ${this.attackModifierLabel}`);
        }

        return props;
    }
}
