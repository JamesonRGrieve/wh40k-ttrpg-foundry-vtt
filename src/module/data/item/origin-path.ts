/* eslint-disable no-restricted-syntax -- boundary: schema-derived dynamic shapes (choice options, modifier maps, restore payloads); per-field interfaces would not capture the per-system variability */
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * Data model for Origin Path items (homeworld, birthright, career, etc).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class OriginPathData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare step: string;
    declare stepIndex: number;
    declare positions: number[];
    declare gameSystem: string;
    declare xpCost: number;
    declare source: { book: string; page: string; custom: string };
    declare isAdvancedOrigin: boolean;
    declare replacesOrigins: string[];
    declare requirements: { text: string; previousSteps: string[]; excludedSteps: string[] };
    declare grants: {
        woundsFormula: string;
        wounds: number;
        fateFormula: string;
        fateThreshold: number;
        blessedByEmperor: boolean;
        skills: Array<{ name: string; specialization: string; level: string }>;
        talents: Array<{ name: string; specialization: string; uuid: string }>;
        traits: Array<{ name: string; level: number; uuid: string }>;
        aptitudes: string[];
        equipment: Array<{ name: string; quantity: number; uuid: string }>;
        specialAbilities: Array<{ name: string; description: string }>;
        choices: Array<{ type: string; label: string; name?: string; options: Record<string, unknown>[]; count: number; xpCost: number }>;
    };
    declare effectText: string;
    declare notes: string;
    declare selectedChoices: Record<string, unknown[]>;
    declare activeModifiers: Array<{ source: string; type: string; key: string; value: number | null; itemUuid: string | null }>;
    declare homebrew: { throneGelt: string; thrones: string };
    declare rollResults: {
        wounds: { formula: string; rolled: number; breakdown: string; timestamp: number };
        fate: { formula: string; rolled: number; breakdown: string; timestamp: number };
        thrones: { formula: string; rolled: number; breakdown: string; timestamp: number };
    };

    // Properties from ModifiersTemplate
    declare modifiers: {
        characteristics: Record<string, unknown>;
        skills: Record<string, unknown>;
        combat: { attack: number; damage: number; penetration: number; defense: number; initiative: number; speed: number };
        resources: { wounds: number; fate: number; insanity: number; corruption: number };
        other: Array<{ key: string; label: string; value: number; mode: string }>;
        situational: {
            characteristics: Array<{ key: string; value: number; condition: string; icon: string }>;
            skills: Array<{ key: string; value: number; condition: string; icon: string }>;
            combat: Array<{ key: string; value: number; condition: string; icon: string }>;
        };
    };

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new (IdentifierField as unknown as typeof foundry.data.fields.StringField)({ required: true, blank: true }),

            // Origin path step
            step: new fields.StringField({
                required: true,
                initial: 'homeWorld',
                choices: [
                    // Rogue Trader steps
                    'homeWorld',
                    'birthright',
                    'lureOfTheVoid',
                    'trialsAndTravails',
                    'motivation',
                    'career',
                    'lineage', // Optional step for dynasty lineage
                    'eliteAdvance',
                    // Dark Heresy 2e steps
                    'background',
                    'role',
                    'elite',
                    'divination',
                    // Black Crusade steps
                    'race',
                    'archetype',
                    'pride',
                    'disgrace',
                    // Only War / Deathwatch steps
                    'regiment',
                    'speciality',
                    'chapter',
                ],
            }),

            // Step order (for display)
            stepIndex: new fields.NumberField({ required: true, initial: 0, min: 0, max: 8, integer: true }),

            // Position(s) in the step's row (0-8)
            // Array of positions this origin occupies in the flowchart
            // Most origins have a single position [4], multi-position origins have multiple [1, 5]
            // Connectivity is automatically calculated as ±1 from each position
            positions: new fields.ArrayField(new fields.NumberField({ required: true, min: 0, max: 8 }), { required: true, initial: [] }),

            // Which game system this origin path belongs to
            gameSystem: new fields.StringField({
                required: true,
                initial: 'rt',
                choices: ['rt', 'dh2e', 'dh1e', 'bc', 'ow', 'dw'],
            }),

            // XP cost (for Into The Storm advanced origins)
            xpCost: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // Source book information
            source: new fields.SchemaField({
                book: new fields.StringField({ required: false, blank: true }),
                page: new fields.StringField({ required: false, blank: true }),
                custom: new fields.StringField({ required: false, blank: true }),
            }),

            // Flags for alternate origins
            isAdvancedOrigin: new fields.BooleanField({ required: true, initial: false }),
            replacesOrigins: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // Requirements to select this origin
            requirements: new fields.SchemaField({
                text: new fields.StringField({ required: false, blank: true }),
                previousSteps: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),
                excludedSteps: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),
            }),

            // What this origin grants
            grants: new fields.SchemaField({
                // Characteristic modifiers (already in ModifiersTemplate)

                // Wound formula - supports dice notation like "2xTB+1d5+2"
                woundsFormula: new fields.StringField({ required: false, blank: true, initial: '' }),

                // Fate formula - supports conditional notation like "(1-5|=2),(6-10|=3)"
                fateFormula: new fields.StringField({ required: false, blank: true, initial: '' }),

                // Blessed by Emperor (fate points on critical success)
                blessedByEmperor: new fields.BooleanField({ required: true, initial: false }),

                // Skills granted (with training level)
                skills: new fields.ArrayField(
                    new fields.SchemaField({
                        name: new fields.StringField({ required: true }),
                        specialization: new fields.StringField({ required: false, blank: true }),
                        level: new fields.StringField({
                            required: true,
                            initial: 'trained',
                            // RT/DH1e/DW: trained, plus10, plus20
                            // DH2e/BC/OW: known, trained, experienced, veteran
                            choices: ['known', 'trained', 'plus10', 'experienced', 'plus20', 'veteran', 'plus30'],
                        }),
                    }),
                    { required: true, initial: [] },
                ),

                // Talents granted
                talents: new fields.ArrayField(
                    new fields.SchemaField({
                        name: new fields.StringField({ required: true }),
                        specialization: new fields.StringField({ required: false, blank: true }),
                        uuid: new fields.StringField({ required: false, blank: true }),
                    }),
                    { required: true, initial: [] },
                ),

                // Traits granted
                traits: new fields.ArrayField(
                    new fields.SchemaField({
                        name: new fields.StringField({ required: true }),
                        level: new fields.NumberField({ required: false, initial: null }),
                        uuid: new fields.StringField({ required: false, blank: true }),
                    }),
                    { required: true, initial: [] },
                ),

                // Aptitudes granted
                aptitudes: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),

                // Starting equipment
                equipment: new fields.ArrayField(
                    new fields.SchemaField({
                        name: new fields.StringField({ required: true }),
                        quantity: new fields.NumberField({ required: true, initial: 1 }),
                        uuid: new fields.StringField({ required: false, blank: true }),
                    }),
                    { required: true, initial: [] },
                ),

                // Special abilities (text descriptions)
                specialAbilities: new fields.ArrayField(
                    new fields.SchemaField({
                        name: new fields.StringField({ required: true }),
                        description: new fields.HTMLField({ required: true }),
                    }),
                    { required: true, initial: [] },
                ),

                // Choices the player must make
                choices: new fields.ArrayField(
                    new fields.SchemaField({
                        type: new fields.StringField({ required: true }),
                        label: new fields.StringField({ required: true }),
                        options: new fields.ArrayField(new fields.ObjectField({ required: true }), { required: true }),
                        count: new fields.NumberField({ required: true, initial: 1, min: 1 }),
                        xpCost: new fields.NumberField({ required: false, initial: 0, min: 0 }),
                    }),
                    { required: true, initial: [] },
                ),
            }),

            // Effect/flavor text
            effectText: new fields.HTMLField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),

            // Choice tracking - records player's selections for grants.choices
            selectedChoices: new fields.ObjectField({
                required: true,
                initial: {},
                // Structure: { "choiceLabel": ["selected option 1", "selected option 2"] }
            }),

            // Active modifiers from choices (calculated in prepareDerivedData)
            activeModifiers: new fields.ArrayField(
                new fields.SchemaField({
                    source: new fields.StringField({ required: true }), // Which choice this came from
                    type: new fields.StringField({ required: true }), // characteristic/skill/talent/equipment
                    key: new fields.StringField({ required: true }),
                    value: new fields.NumberField({ required: false }),
                    itemUuid: new fields.StringField({ required: false, blank: true }), // For fetching item details
                }),
                { required: true, initial: [] },
            ),

            // Homebrew extensions (campaign-specific fields not in RAW)
            homebrew: new fields.SchemaField({
                throneGelt: new fields.StringField({ required: false, blank: true, initial: '' }),
                thrones: new fields.StringField({ required: false, blank: true, initial: '' }),
            }),

            // Roll results storage for interactive rolling
            rollResults: new fields.SchemaField({
                wounds: new fields.SchemaField({
                    formula: new fields.StringField({ required: false, blank: true }),
                    rolled: new fields.NumberField({ required: false, initial: null }),
                    breakdown: new fields.StringField({ required: false, blank: true }),
                    timestamp: new fields.NumberField({ required: false, initial: null }),
                }),
                fate: new fields.SchemaField({
                    formula: new fields.StringField({ required: false, blank: true }),
                    rolled: new fields.NumberField({ required: false, initial: null }),
                    breakdown: new fields.StringField({ required: false, blank: true }),
                    timestamp: new fields.NumberField({ required: false, initial: null }),
                }),
                thrones: new fields.SchemaField({
                    formula: new fields.StringField({ required: false, blank: true }),
                    rolled: new fields.NumberField({ required: false, initial: null }),
                    breakdown: new fields.StringField({ required: false, blank: true }),
                    timestamp: new fields.NumberField({ required: false, initial: null }),
                }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get all positions this origin occupies (for multi-parent support).
     * Returns array of positions where this origin appears in the chart.
     * @type {number[]}
     */
    get allPositions(): number[] {
        return this.positions.length > 0 ? [...this.positions].sort((a, b) => a - b) : [4]; // Default to center position if not set
    }

    /**
     * Get the primary (first) position for this origin.
     * Used for card placement in the chart.
     * @type {number}
     */
    get primaryPosition(): number {
        return this.allPositions[0] || 4;
    }

    /**
     * Get the step label.
     * @type {string}
     */
    get stepLabel(): string {
        const fallbackLabels: Record<string, string> = {
            homeWorld: 'Home World',
            birthright: 'Birthright',
            lureOfTheVoid: 'Lure of the Void',
            trialsAndTravails: 'Trials and Travails',
            motivation: 'Motivation',
            career: 'Career',
            lineage: 'Lineage',
            eliteAdvance: 'Elite Advance',
        };

        const step = this.step;
        const key = step ? step.charAt(0).toUpperCase() + step.slice(1) : '';
        const localizationKey = key !== '' ? `WH40K.OriginPath.${key}` : '';

        if (localizationKey !== '' && game.i18n.has(localizationKey)) {
            return game.i18n.localize(localizationKey);
        }

        return fallbackLabels[step] || step || '';
    }

    /**
     * Is this an advanced origin from Into The Storm?
     * @type {boolean}
     */
    get isAdvanced(): boolean {
        return this.isAdvancedOrigin || this.xpCost > 0;
    }

    /**
     * Get display string for XP cost.
     * @type {string}
     */
    get xpCostLabel(): string {
        return this.xpCost > 0 ? `${this.xpCost} XP` : '—';
    }

    /**
     * Does this origin have requirements?
     * @type {boolean}
     */
    get hasRequirements(): boolean {
        const reqs = this.requirements;
        return Boolean(reqs.text) || reqs.previousSteps.length > 0 || reqs.excludedSteps.length > 0;
    }

    /**
     * Does this origin have choices?
     * @type {boolean}
     */
    get hasChoices(): boolean {
        return this.grants.choices.length > 0;
    }

    /**
     * Get choices that still need selection.
     * @type {object[]}
     */
    get pendingChoices(): typeof this.grants.choices {
        return this.grants.choices.filter((choice) => {
            const selected = this.selectedChoices[choice.label] as unknown[] | undefined;
            return (selected?.length ?? 0) < choice.count;
        });
    }

    /**
     * Check if all choices have been made.
     * @type {boolean}
     */
    get choicesComplete(): boolean {
        return this.pendingChoices.length === 0;
    }

    /**
     * Get the active modifiers derived from selected choices.
     * @type {object[]}
     */
    get derivedModifiers(): typeof this.activeModifiers {
        return this.activeModifiers;
    }

    /**
     * Get a summary of grants.
     * @type {object}
     */
    get grantsSummary(): string[] {
        const grants = this.grants;
        const summary: string[] = [];

        // Characteristics from modifiers
        const charMods = this.modifiers.characteristics;
        for (const [char, value] of Object.entries(charMods)) {
            if (value !== 0) {
                const numVal = value as number;
                summary.push(`${char}: ${numVal >= 0 ? '+' : ''}${numVal}`);
            }
        }

        if (grants.skills.length > 0) {
            summary.push(`Skills: ${grants.skills.map((s) => s.name).join(', ')}`);
        }

        if (grants.talents.length > 0) {
            summary.push(`Talents: ${grants.talents.map((t) => t.name).join(', ')}`);
        }

        if (grants.traits.length > 0) {
            summary.push(`Traits: ${grants.traits.map((t) => t.name).join(', ')}`);
        }

        if (grants.aptitudes.length > 0) {
            summary.push(`Aptitudes: ${grants.aptitudes.join(', ')}`);
        }

        return summary;
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @override */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
        this._calculateActiveModifiers();
    }

    /**
     * Calculate active modifiers from selected choices.
     * This populates the activeModifiers array based on what the player has chosen.
     * @private
     */
    _calculateActiveModifiers(): void {
        interface OptionGrants {
            characteristics?: Record<string, unknown>;
            skills?: Array<{ name: string }>;
            talents?: Array<{ name: string; uuid?: string }>;
            traits?: Array<{ name: string; level?: number; uuid?: string }>;
            equipment?: Array<{ name: string; quantity?: number; uuid?: string }>;
        }
        interface ChoiceOption {
            value?: string;
            name?: string;
            grants?: OptionGrants;
        }

        const activeModifiers: Array<{ source: string; type: string; key: string; value: number | null; itemUuid: string | null }> = [];

        for (const choice of this.grants.choices) {
            // DH2e/BC/OW packs use 'name' while RT uses 'label' — handle both
            const choiceKey: string = choice.label !== '' ? choice.label : choice.name ?? '';
            const selected = (this.selectedChoices[choiceKey] as unknown[] | undefined) ?? [];

            for (const selectedValue of selected) {
                const option = (choice.options as ChoiceOption[]).find(
                    (opt) => ((opt.value as string | undefined) ?? (opt.name as string | undefined)) === selectedValue,
                );
                if (option?.grants === undefined) continue;
                const grants = option.grants;

                // Extract characteristic modifiers
                if (grants.characteristics !== undefined) {
                    for (const [char, value] of Object.entries(grants.characteristics)) {
                        if (value !== 0) {
                            activeModifiers.push({
                                source: choiceKey,
                                type: 'characteristic',
                                key: char,
                                value: value as number,
                                itemUuid: null,
                            });
                        }
                    }
                }

                // Extract skill grants
                if (grants.skills !== undefined) {
                    for (const skill of grants.skills) {
                        activeModifiers.push({
                            source: choiceKey,
                            type: 'skill',
                            key: skill.name,
                            value: null,
                            itemUuid: null,
                        });
                    }
                }

                // Extract talent grants
                if (grants.talents !== undefined) {
                    for (const talent of grants.talents) {
                        activeModifiers.push({
                            source: choiceKey,
                            type: 'talent',
                            key: talent.name,
                            value: null,
                            itemUuid: talent.uuid ?? null,
                        });
                    }
                }

                // Extract trait grants
                if (grants.traits !== undefined) {
                    for (const trait of grants.traits) {
                        activeModifiers.push({
                            source: choiceKey,
                            type: 'trait',
                            key: trait.name,
                            value: trait.level ?? null,
                            itemUuid: trait.uuid ?? null,
                        });
                    }
                }

                // Extract equipment grants
                if (grants.equipment !== undefined) {
                    for (const equip of grants.equipment) {
                        activeModifiers.push({
                            source: choiceKey,
                            type: 'equipment',
                            key: equip.name,
                            value: equip.quantity ?? null,
                            itemUuid: equip.uuid ?? null,
                        });
                    }
                }
            }
        }

        // Store the calculated modifiers
        // Note: This is safe because prepareDerivedData is called after the item is initialized
        // and we're just updating a derived field, not modifying source data
        if (JSON.stringify(this.activeModifiers) !== JSON.stringify(activeModifiers)) {
            this.activeModifiers = activeModifiers;
        }
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Normalize origin path data shape.
     * @param {object} source  The source data
     * @protected
     */
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean origin path data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static override _cleanData(source: Record<string, unknown> | undefined, options: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        return [this.stepLabel, ...this.grantsSummary];
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            step: this.stepLabel,
            stepIndex: this.stepIndex + 1,
        };
    }
}
