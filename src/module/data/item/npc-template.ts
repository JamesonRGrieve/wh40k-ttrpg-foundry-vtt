/**
 * @file NPCTemplateData - Data model for NPC templates
 * Phase 7: Template System
 *
 * NPC Templates are reusable configurations that can be instantiated
 * to create NPCs with pre-configured stats, equipment, and abilities.
 */

import ItemDataModel from '../abstract/item-data-model.ts';

const { NumberField, SchemaField, StringField, BooleanField, ArrayField, ObjectField, HTMLField } = foundry.data.fields;

/**
 * Data model for NPC template items.
 * Templates store base NPC configurations that can be instantiated at various threat levels.
 *
 * @extends {ItemDataModel}
 */
export default class NPCTemplateData extends ItemDataModel {
    /* -------------------------------------------- */
    /*  Property Declarations (matching defineSchema) */
    /* -------------------------------------------- */

    // Template metadata
    declare category: string;
    declare faction: string;
    declare subfaction: string;
    declare baseThreatLevel: number;

    // Base configuration
    declare role: string;
    declare type: string;

    // Base characteristics
    declare baseCharacteristics: {
        weaponSkill: number;
        ballisticSkill: number;
        strength: number;
        toughness: number;
        agility: number;
        intelligence: number;
        perception: number;
        willpower: number;
        fellowship: number;
        influence: number;
    };

    // Wounds and armour
    declare baseWounds: number;
    declare baseArmour: number;

    // Unnaturals
    declare unnaturals: Record<string, number | undefined>;

    // Skills
    declare trainedSkills: Array<{
        key: string;
        name: string;
        characteristic: string;
        level: string;
    }>;

    // Equipment
    declare equipmentPreset: string;
    declare customWeapons: Array<{
        name: string;
        damage: string;
        pen: number;
        range: string;
        rof: string;
        clip: number;
        reload: string;
        special: string;
        class: string;
    }>;

    // Scaling
    declare scaling: {
        characteristicScale: number;
        woundsScale: number;
        armourScale: number;
        weaponScale: number;
        minMultiplier: number;
        maxMultiplier: number;
    };

    // Traits, talents, abilities
    declare traits: Array<{ uuid?: string; name: string; description?: string }>;
    declare talents: Array<{ uuid?: string; name: string; description?: string }>;
    declare specialAbilities: string;

    // Notes
    declare description: string;
    declare tactics: string;
    declare source: string;

    // Template options
    declare allowHorde: boolean;
    declare defaultMagnitude: number;

    // Variants
    declare variants: Array<{
        name: string;
        description?: string;
        threatModifier: number;
        characteristicModifiers: Record<string, number>;
        additionalEquipment: string[];
        additionalTraits: string[];
        additionalTalents: string[];
    }>;

    // Derived (set in prepareDerivedData)
    declare _skillCount: number;
    declare _traitCount: number;
    declare _talentCount: number;
    declare _variantCount: number;

    /* -------------------------------------------- */
    /*  Model Configuration                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        return {
            ...super.defineSchema(),

            // === TEMPLATE METADATA ===
            category: new StringField({
                required: true,
                initial: 'humanoid',
                choices: ['humanoid', 'xenos', 'daemon', 'creature', 'vehicle', 'custom'],
            }),

            faction: new StringField({ required: false, initial: '', blank: true }),
            subfaction: new StringField({ required: false, initial: '', blank: true }),

            // Base threat level (used as reference point for scaling)
            baseThreatLevel: new NumberField({
                required: true,
                initial: 5,
                min: 1,
                max: 30,
                integer: true,
            }),

            // === BASE CONFIGURATION ===
            role: new StringField({
                required: true,
                initial: 'specialist',
                choices: ['bruiser', 'sniper', 'caster', 'support', 'commander', 'specialist'],
            }),

            type: new StringField({
                required: true,
                initial: 'troop',
                choices: ['troop', 'elite', 'master', 'horde', 'swarm', 'creature', 'daemon', 'xenos'],
            }),

            // === BASE CHARACTERISTICS ===
            // These are the values at baseThreatLevel
            baseCharacteristics: new SchemaField({
                weaponSkill: new NumberField({ required: true, initial: 30, integer: true }),
                ballisticSkill: new NumberField({ required: true, initial: 30, integer: true }),
                strength: new NumberField({ required: true, initial: 30, integer: true }),
                toughness: new NumberField({ required: true, initial: 30, integer: true }),
                agility: new NumberField({ required: true, initial: 30, integer: true }),
                intelligence: new NumberField({ required: true, initial: 30, integer: true }),
                perception: new NumberField({ required: true, initial: 30, integer: true }),
                willpower: new NumberField({ required: true, initial: 30, integer: true }),
                fellowship: new NumberField({ required: true, initial: 30, integer: true }),
                influence: new NumberField({ required: true, initial: 20, integer: true }),
            }),

            // === BASE WOUNDS ===
            baseWounds: new NumberField({ required: true, initial: 10, min: 1, integer: true }),

            // === UNNATURAL CHARACTERISTICS ===
            unnaturals: new ObjectField({
                required: true,
                initial: {},
                // Format: { "strength": 2, "toughness": 1 }
            }),

            // === TRAINED SKILLS ===
            trainedSkills: new ArrayField(
                new SchemaField({
                    key: new StringField({ required: true }),
                    name: new StringField({ required: true }),
                    characteristic: new StringField({ required: true }),
                    level: new StringField({
                        required: true,
                        initial: 'trained',
                        choices: ['trained', 'plus10', 'plus20'],
                    }),
                }),
            ),

            // === EQUIPMENT PRESET ===
            equipmentPreset: new StringField({
                required: true,
                initial: 'mixed',
                choices: ['melee', 'ranged', 'mixed', 'caster', 'support', 'heavy', 'unarmed', 'custom'],
            }),

            // === CUSTOM WEAPONS (when preset is "custom") ===
            customWeapons: new ArrayField(
                new SchemaField({
                    name: new StringField({ required: true, initial: '' }),
                    damage: new StringField({ required: true, initial: '1d10' }),
                    pen: new NumberField({ required: true, initial: 0, integer: true }),
                    range: new StringField({ required: true, initial: 'Melee' }),
                    rof: new StringField({ required: true, initial: 'S/-/-' }),
                    clip: new NumberField({ required: true, initial: 0, integer: true }),
                    reload: new StringField({ required: true, initial: '-' }),
                    special: new StringField({ required: false, initial: '', blank: true }),
                    class: new StringField({
                        required: true,
                        initial: 'melee',
                        choices: ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'launcher'],
                    }),
                }),
            ),

            // === BASE ARMOUR ===
            baseArmour: new NumberField({ required: true, initial: 3, min: 0, integer: true }),

            // === SCALING RULES ===
            scaling: new SchemaField({
                // How much characteristics change per threat level difference
                characteristicScale: new NumberField({ required: true, initial: 2.0, min: 0 }),
                // How much wounds change per threat level difference
                woundsScale: new NumberField({ required: true, initial: 1.5, min: 0 }),
                // How much armour changes per threat level difference
                armourScale: new NumberField({ required: true, initial: 0.3, min: 0 }),
                // How much weapon damage scales
                weaponScale: new NumberField({ required: true, initial: 0.2, min: 0 }),
                // Minimum and maximum multipliers
                minMultiplier: new NumberField({ required: true, initial: 0.5, min: 0.1 }),
                maxMultiplier: new NumberField({ required: true, initial: 3.0, min: 1.0 }),
            }),

            // === TRAITS (by UUID or name) ===
            traits: new ArrayField(
                new SchemaField({
                    uuid: new StringField({ required: false, blank: true }),
                    name: new StringField({ required: true }),
                    description: new StringField({ required: false, blank: true }),
                }),
            ),

            // === TALENTS (by UUID or name) ===
            talents: new ArrayField(
                new SchemaField({
                    uuid: new StringField({ required: false, blank: true }),
                    name: new StringField({ required: true }),
                    description: new StringField({ required: false, blank: true }),
                }),
            ),

            // === SPECIAL ABILITIES (text) ===
            specialAbilities: new HTMLField({ initial: '' }),

            // === NOTES ===
            description: new HTMLField({ initial: '' }),
            tactics: new HTMLField({ initial: '' }),
            source: new StringField({ required: false, initial: '', blank: true }),

            // === TEMPLATE OPTIONS ===
            allowHorde: new BooleanField({ initial: true }),
            defaultMagnitude: new NumberField({ required: true, initial: 100, min: 10, integer: true }),

            // === VARIANTS ===
            variants: new ArrayField(
                new SchemaField({
                    name: new StringField({ required: true }),
                    description: new StringField({ required: false, blank: true }),
                    threatModifier: new NumberField({ required: true, initial: 0, integer: true }),
                    characteristicModifiers: new ObjectField({ initial: {} }),
                    additionalEquipment: new ArrayField(new StringField()),
                    additionalTraits: new ArrayField(new StringField()),
                    additionalTalents: new ArrayField(new StringField()),
                }),
            ),
        };
    }

    /* -------------------------------------------- */
    /*  Derived Data                                */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override prepareDerivedData(): void {
        super.prepareDerivedData();

        // Calculate skill count
        this._skillCount = this.trainedSkills.length;

        // Calculate trait count
        this._traitCount = this.traits.length;

        // Calculate talent count
        this._talentCount = this.talents.length;

        // Calculate variant count
        this._variantCount = this.variants.length;
    }

    /* -------------------------------------------- */
    /*  Getters                                     */
    /* -------------------------------------------- */

    /**
     * Get the category label.
     * @type {string}
     */
    get categoryLabel(): string {
        return game.i18n.localize(`WH40K.NPC.Template.Category.${this.category.titleCase()}`);
    }

    /**
     * Get the role label.
     * @type {string}
     */
    get roleLabel(): string {
        return game.i18n.localize(`WH40K.NPCRole.${this.role.titleCase()}`);
    }

    /**
     * Get the type label.
     * @type {string}
     */
    override get typeLabel(): string {
        return game.i18n.localize(`WH40K.NPCType.${this.type.titleCase()}`);
    }

    /**
     * Get a summary string for the template.
     * @type {string}
     */
    get summary(): string {
        return `${this.typeLabel} ${this.roleLabel} (Threat ${this.baseThreatLevel})`;
    }

    /* -------------------------------------------- */
    /*  Instance Methods                            */
    /* -------------------------------------------- */

    /**
     * Generate NPC system data at a specific threat level.
     * @param {number} targetThreat - The target threat level.
     * @param {Object} [options] - Generation options.
     * @param {boolean} [options.isHorde=false] - Create as horde.
     * @param {string} [options.variant] - Variant name to apply.
     * @returns {Object} NPC system data ready for Actor.create().
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.create() payload
    generateAtThreat(targetThreat: number, options: { isHorde?: boolean; variant?: string | null } = {}): Record<string, unknown> {
        const { isHorde = false, variant = null } = options;

        // Calculate scaling factor
        const threatDiff = targetThreat - this.baseThreatLevel;
        const scaleFactor = 1 + (threatDiff * this.scaling.characteristicScale) / 100;
        const clampedScale = Math.max(this.scaling.minMultiplier, Math.min(this.scaling.maxMultiplier, scaleFactor));

        // Apply variant if specified
        let variantData: { characteristicModifiers?: Record<string, number | undefined> } | undefined;
        if (variant !== null && variant !== '') {
            variantData = this.variants.find((v) => v.name === variant);
        }

        // Generate characteristics
        // eslint-disable-next-line no-restricted-syntax -- boundary: per-key dynamic stat block
        const characteristics: Record<string, unknown> = {};
        const charLabels: Record<string, { label: string; short: string }> = {
            weaponSkill: { label: 'Weapon Skill', short: 'WS' },
            ballisticSkill: { label: 'Ballistic Skill', short: 'BS' },
            strength: { label: 'Strength', short: 'S' },
            toughness: { label: 'Toughness', short: 'T' },
            agility: { label: 'Agility', short: 'Ag' },
            intelligence: { label: 'Intelligence', short: 'Int' },
            perception: { label: 'Perception', short: 'Per' },
            willpower: { label: 'Willpower', short: 'WP' },
            fellowship: { label: 'Fellowship', short: 'Fel' },
            influence: { label: 'Influence', short: 'Inf' },
        };

        for (const [key, base] of Object.entries(this.baseCharacteristics)) {
            let value = Math.round(base * clampedScale);

            // Apply variant modifier if present
            const variantMod = variantData?.characteristicModifiers?.[key];
            if (variantMod !== undefined && variantMod !== 0) {
                value += variantMod;
            }

            // Clamp to valid range
            value = Math.max(10, Math.min(99, value));

            const unnatural = this.unnaturals[key] ?? 0;

            const labels = charLabels[key];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: charLabels[key] may be undefined at runtime
            if (labels === undefined) continue;
            characteristics[key] = {
                label: labels.label,
                short: labels.short,
                base: value,
                modifier: 0,
                unnatural,
                total: value,
                bonus: Math.floor(value / 10) + unnatural,
            };
        }

        // Generate wounds
        const woundsScale = 1 + (threatDiff * this.scaling.woundsScale) / 100;
        const clampedWoundsScale = Math.max(this.scaling.minMultiplier, Math.min(this.scaling.maxMultiplier, woundsScale));
        const wounds = Math.max(1, Math.round(this.baseWounds * clampedWoundsScale));

        // Generate armour
        const armourScale = 1 + (threatDiff * this.scaling.armourScale) / 100;
        const clampedArmourScale = Math.max(this.scaling.minMultiplier, Math.min(this.scaling.maxMultiplier, armourScale));
        const armour = Math.max(0, Math.min(15, Math.round(this.baseArmour * clampedArmourScale)));

        // Generate skills
        // eslint-disable-next-line no-restricted-syntax -- boundary: per-skill dynamic block
        const trainedSkills: Record<string, unknown> = {};
        for (const skill of this.trainedSkills) {
            trainedSkills[skill.key] = {
                name: skill.name,
                characteristic: skill.characteristic,
                trained: true,
                plus10: skill.level === 'plus10' || skill.level === 'plus20',
                plus20: skill.level === 'plus20',
                bonus: 0,
            };
        }

        // Generate weapons
        type WeaponsPayload = { mode: string; simple: object[] };
        let weapons: WeaponsPayload;
        if (this.equipmentPreset === 'custom' && this.customWeapons.length > 0) {
            weapons = {
                mode: 'simple',
                simple: this.customWeapons.map((w) => ({ ...w })),
            };
        } else {
            // Use ThreatCalculator for preset weapons
            // eslint-disable-next-line no-restricted-syntax -- boundary: game.wh40k namespace populated at runtime
            const wh40kNs = game.wh40k as { ThreatCalculator?: { generateWeapons: (preset: string, threat: number) => WeaponsPayload } } | undefined;
            const ThreatCalculator = wh40kNs?.ThreatCalculator;
            if (ThreatCalculator !== undefined) {
                weapons = ThreatCalculator.generateWeapons(this.equipmentPreset, targetThreat);
            } else {
                weapons = { mode: 'simple', simple: [] };
            }
        }

        // Generate horde data
        const horde = {
            enabled: isHorde || this.type === 'horde' || this.type === 'swarm',
            magnitude: {
                max: this.defaultMagnitude + threatDiff * 5,
                current: this.defaultMagnitude + threatDiff * 5,
            },
            magnitudeDamage: [],
            traits: [],
            damageMultiplier: 1,
            sizeModifier: 0,
        };

        // Build system data
        return {
            faction: this.faction,
            subfaction: this.subfaction,
            allegiance: '',
            role: this.role,
            type: isHorde ? 'horde' : this.type,
            threatLevel: targetThreat,
            characteristics,
            wounds: {
                max: wounds,
                value: wounds,
                critical: 0,
            },
            movement: {
                half: 3 + Math.floor(targetThreat / 10),
                full: 6 + Math.floor(targetThreat / 5),
                charge: 9 + Math.floor(targetThreat / 3),
                run: 18 + Math.floor(targetThreat / 2),
            },
            size: 4,
            initiative: {
                characteristic: 'agility',
                base: '1d10',
                bonus: 0,
            },
            trainedSkills,
            weapons,
            armour: {
                mode: 'simple',
                total: armour,
                locations: {
                    head: armour,
                    body: armour,
                    leftArm: armour,
                    rightArm: armour,
                    leftLeg: armour,
                    rightLeg: armour,
                },
            },
            specialAbilities: this.specialAbilities,
            customStats: {
                enabled: false,
                characteristics: {},
                skills: {},
                combat: { initiative: null, dodge: null, parry: null },
                wounds: null,
                movement: null,
            },
            pinnedAbilities: [],
            template: (this.parent as { uuid?: string } | undefined)?.uuid ?? '',
            quickNotes: '',
            tags: [],
            description: this.description,
            tactics: this.tactics,
            source: this.source,
            horde,
        };
    }

    /**
     * Get a preview of stats at a given threat level.
     * @param {number} targetThreat - The target threat level.
     * @returns {Object} Preview data.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: preview payload mirrors generateAtThreat
    previewAtThreat(targetThreat: number): Record<string, unknown> {
        const data = this.generateAtThreat(targetThreat);
        /* eslint-disable no-restricted-syntax -- boundary: generateAtThreat returns dynamic shape, narrowed per-field here */
        const chars = data['characteristics'] as Record<string, { short: string; base: number }>;
        const wounds = data['wounds'] as { max: number };
        const armour = data['armour'] as { total: number };
        const weapons = data['weapons'] as { simple?: unknown[] };
        const skills = data['trainedSkills'] as Record<string, unknown>;
        /* eslint-enable no-restricted-syntax */

        return {
            threatLevel: targetThreat,
            characteristics: Object.entries(chars).map(([key, char]) => ({
                key,
                label: char.short,
                value: char.base,
            })),
            wounds: wounds.max,
            armour: armour.total,
            weaponCount: weapons.simple?.length ?? 0,
            skillCount: Object.keys(skills).length,
        };
    }
}
