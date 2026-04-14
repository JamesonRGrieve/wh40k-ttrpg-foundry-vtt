import CommonTemplate from './common.ts';
import { computeArmour } from '../../../utils/armour-calculator.ts';
import { computeEncumbrance } from '../../../utils/encumbrance-calculator.ts';
import { SkillKeyHelper } from '../../../helpers/skill-key-helper.ts';
import { BaseSystemConfig } from '../../../config/game-systems/base-system-config.ts';
import { SystemConfigRegistry } from '../../../config/game-systems/index.ts';

const { NumberField, SchemaField, StringField, BooleanField, ArrayField, ObjectField, HTMLField } = (foundry.data as any).fields;

/**
 * Creature template for actors that are living beings (Characters, NPCs).
 * Extends CommonTemplate with skills, fatigue, fate, psy, and item-based calculations.
 * @extends {CommonTemplate}
 */
export default class CreatureTemplate extends CommonTemplate {
    [key: string]: any;
    /* -------------------------------------------- */
    /*  Model Configuration                         */
    /* -------------------------------------------- */

    /**
     * Skill schema factory for standard and specialist skills.
     * @param {string} label - Display label
     * @param {string} charShort - Characteristic short name
     * @param {boolean} advanced - Whether skill is Advanced (true) or Basic (false)
     * @param {boolean} hasEntries - Whether skill has specialist entries (skill group)
     * @returns {SchemaField}
     */
    static SkillField(label, charShort, advanced = false, hasEntries = false) {
        const schema: Record<string, any> = {
            label: new StringField({ required: true, initial: label }),
            characteristic: new StringField({ required: true, initial: charShort }),
            advanced: new BooleanField({ required: true, initial: advanced }),
            basic: new BooleanField({ required: true, initial: !advanced }),
            // XP-purchased rank advances (0-4). Effective rank = origin path rank + advance.
            advance: new NumberField({ required: true, initial: 0, min: 0, max: 4, integer: true }),
            // Derived boolean flags — computed from effective rank in _prepareSkills() for template compat
            trained: new BooleanField({ required: true, initial: false }),
            plus10: new BooleanField({ required: true, initial: false }),
            plus20: new BooleanField({ required: true, initial: false }),
            plus30: new BooleanField({ required: true, initial: false }),
            bonus: new NumberField({ required: true, initial: 0, integer: true }),
            notes: new StringField({ required: false, blank: true }),
            hidden: new BooleanField({ required: true, initial: false }),
            cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            // Derived
            current: new NumberField({ required: true, initial: 0, integer: true }),
        };

        if (hasEntries) {
            schema.entries = new ArrayField(
                new SchemaField({
                    name: new StringField({ required: true }),
                    slug: new StringField({ required: false }),
                    characteristic: new StringField({ required: false }),
                    advanced: new BooleanField({ required: true, initial: advanced }),
                    basic: new BooleanField({ required: true, initial: !advanced }),
                    advance: new NumberField({ required: true, initial: 0, min: 0, max: 4, integer: true }),
                    trained: new BooleanField({ required: true, initial: false }),
                    plus10: new BooleanField({ required: true, initial: false }),
                    plus20: new BooleanField({ required: true, initial: false }),
                    plus30: new BooleanField({ required: true, initial: false }),
                    bonus: new NumberField({ required: true, initial: 0, integer: true }),
                    notes: new StringField({ required: false, blank: true }),
                    cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    current: new NumberField({ required: true, initial: 0, integer: true }),
                }),
                { required: true, initial: [] },
            );
        }

        return new SchemaField(schema);
    }

    static CharacteristicField = (label, short) =>
        new SchemaField({
            label: new StringField({ required: true, initial: label }),
            short: new StringField({ required: true, initial: short }),
            base: new NumberField({ required: true, initial: 0, integer: true }),
            advance: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            modifier: new NumberField({ required: true, initial: 0, integer: true }),
            unnatural: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            // Derived values
            total: new NumberField({ required: true, initial: 0, integer: true }),
            bonus: new NumberField({ required: true, initial: 0, integer: true }),
        });

    /** @inheritDoc */
    static defineSchema() {
        return {
            ...super.defineSchema(),

            characteristics: new SchemaField({
                weaponSkill: this.CharacteristicField('Weapon Skill', 'WS'),
                ballisticSkill: this.CharacteristicField('Ballistic Skill', 'BS'),
                strength: this.CharacteristicField('Strength', 'S'),
                toughness: this.CharacteristicField('Toughness', 'T'),
                agility: this.CharacteristicField('Agility', 'Ag'),
                intelligence: this.CharacteristicField('Intelligence', 'Int'),
                perception: this.CharacteristicField('Perception', 'Per'),
                willpower: this.CharacteristicField('Willpower', 'WP'),
                fellowship: this.CharacteristicField('Fellowship', 'Fel'),
            }),

            size: new NumberField({ required: true, initial: 4, min: 1, max: 10, integer: true, nullable: false }),

            wounds: new SchemaField({
                max: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
                value: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
                critical: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
            }),

            fatigue: new SchemaField({
                max: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                value: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            fate: new SchemaField({
                max: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                value: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            initiative: new SchemaField({
                characteristic: new StringField({ required: true, initial: 'agility' }),
                base: new StringField({ required: true, initial: '1d10' }),
                bonus: new NumberField({ required: true, initial: 0, integer: true, nullable: false }),
            }),

            movement: new SchemaField({
                half: new NumberField({ required: true, initial: 0, min: 0 }),
                full: new NumberField({ required: true, initial: 0, min: 0 }),
                charge: new NumberField({ required: true, initial: 0, min: 0 }),
                run: new NumberField({ required: true, initial: 0, min: 0 }),
                // Leap/Jump based on Strength Bonus
                leapVertical: new NumberField({ required: true, initial: 0, min: 0 }),
                leapHorizontal: new NumberField({ required: true, initial: 0, min: 0 }),
                jump: new NumberField({ required: true, initial: 0, min: 0 }),
            }),

            // Lifting/Carrying capacity based on Strength Bonus
            lifting: new SchemaField({
                lift: new NumberField({ required: true, initial: 0, min: 0 }),
                carry: new NumberField({ required: true, initial: 0, min: 0 }),
                push: new NumberField({ required: true, initial: 0, min: 0 }),
            }),

            psy: new SchemaField({
                rating: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                sustained: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                defaultPR: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                class: new StringField({ required: true, initial: 'bound', choices: ['unbound', 'bound', 'ascended'] }),
                cost: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                hasFocus: new BooleanField({ required: true, initial: false }),
                // Derived
                currentRating: new NumberField({ required: true, initial: 0, integer: true }),
            }),

            // Skills — union of all game lines. Per-system visibility controlled by
            // BaseSystemConfig.getVisibleSkills(); hidden skills don't render on sheet.
            skills: new SchemaField({
                // === RT/DH1e Standard Skills ===
                acrobatics: this.SkillField('Acrobatics', 'Ag', true),
                awareness: this.SkillField('Awareness', 'Per', false),
                barter: this.SkillField('Barter', 'Fel', false),           // RT/DH1e only
                blather: this.SkillField('Blather', 'Fel', true),          // RT/DH1e only
                carouse: this.SkillField('Carouse', 'T', false),           // RT/DH1e only
                charm: this.SkillField('Charm', 'Fel', false),
                chemUse: this.SkillField('Chem-Use', 'Int', true),         // RT/DH1e only
                climb: this.SkillField('Climb', 'S', false),              // RT/DH1e only
                command: this.SkillField('Command', 'Fel', false),
                commerce: this.SkillField('Commerce', 'Fel', true),
                concealment: this.SkillField('Concealment', 'Ag', false),  // RT/DH1e only
                contortionist: this.SkillField('Contortionist', 'Ag', false), // RT/DH1e only
                deceive: this.SkillField('Deceive', 'Fel', false),
                demolition: this.SkillField('Demolition', 'Int', true),    // RT/DH1e only
                disguise: this.SkillField('Disguise', 'Fel', false),       // RT/DH1e only
                dodge: this.SkillField('Dodge', 'Ag', false),
                evaluate: this.SkillField('Evaluate', 'Int', false),       // RT/DH1e only
                gamble: this.SkillField('Gamble', 'Int', false),           // RT/DH1e only
                inquiry: this.SkillField('Inquiry', 'Fel', false),
                interrogation: this.SkillField('Interrogation', 'WP', true),
                intimidate: this.SkillField('Intimidate', 'S', false),
                invocation: this.SkillField('Invocation', 'WP', true),     // RT/DH1e only
                literacy: this.SkillField('Literacy', 'Int', false),       // RT/DH1e only
                logic: this.SkillField('Logic', 'Int', false),
                medicae: this.SkillField('Medicae', 'Int', true),
                psyniscience: this.SkillField('Psyniscience', 'Per', true),
                scrutiny: this.SkillField('Scrutiny', 'Per', false),
                search: this.SkillField('Search', 'Per', false),           // RT/DH1e only
                security: this.SkillField('Security', 'Ag', true),
                shadowing: this.SkillField('Shadowing', 'Ag', true),       // RT/DH1e only
                silentMove: this.SkillField('Silent Move', 'Ag', false),   // RT/DH1e only
                sleightOfHand: this.SkillField('Sleight of Hand', 'Ag', true),
                survival: this.SkillField('Survival', 'Int', false),
                swim: this.SkillField('Swim', 'S', false),                // RT/DH1e only
                tracking: this.SkillField('Tracking', 'Int', true),        // RT/DH1e only
                wrangling: this.SkillField('Wrangling', 'Int', true),      // RT/DH1e only

                // === DH2e/BC/OW Standard Skills (not in RT) ===
                athletics: this.SkillField('Athletics', 'S', false),       // DH2e/BC/OW
                linguistics: this.SkillField('Linguistics', 'Int', true, true), // DH2e/BC/OW, Group
                navigate: this.SkillField('Navigate', 'Int', true, true),  // DH2e/BC/OW, Group
                operate: this.SkillField('Operate', 'Ag', true, true),     // DH2e/BC/OW, Group
                parry: this.SkillField('Parry', 'WS', true),              // DH2e/BC/OW
                stealth: this.SkillField('Stealth', 'Ag', false),         // DH2e/BC/OW

                // === Specialist Skill Groups (all systems) ===
                ciphers: this.SkillField('Ciphers', 'Int', true, true),         // RT/DH1e only
                commonLore: this.SkillField('Common Lore', 'Int', true, true),
                drive: this.SkillField('Drive', 'Ag', true, true),              // RT/DH1e only
                forbiddenLore: this.SkillField('Forbidden Lore', 'Int', true, true),
                navigation: this.SkillField('Navigation', 'Int', true, true),   // RT/DH1e only
                performer: this.SkillField('Performer', 'Fel', true, true),     // RT/DH1e only
                pilot: this.SkillField('Pilot', 'Ag', true, true),             // RT/DH1e only
                scholasticLore: this.SkillField('Scholastic Lore', 'Int', true, true),
                secretTongue: this.SkillField('Secret Tongue', 'Int', true, true), // RT/DH1e only
                speakLanguage: this.SkillField('Speak Language', 'Int', true, true), // RT/DH1e only
                techUse: this.SkillField('Tech-Use', 'Int', true),              // Standard in DH2e, Group in RT
                trade: this.SkillField('Trade', 'Int', true, true),
            }),

            // Computed armor by location
            armour: new SchemaField({
                head: new NumberField({ required: true, initial: 0, integer: true }),
                leftArm: new NumberField({ required: true, initial: 0, integer: true }),
                rightArm: new NumberField({ required: true, initial: 0, integer: true }),
                body: new NumberField({ required: true, initial: 0, integer: true }),
                leftLeg: new NumberField({ required: true, initial: 0, integer: true }),
                rightLeg: new NumberField({ required: true, initial: 0, integer: true }),
            }),

            // Encumbrance
            encumbrance: new SchemaField({
                max: new NumberField({ required: true, initial: 0, min: 0 }),
                value: new NumberField({ required: true, initial: 0, min: 0 }),
                encumbered: new BooleanField({ required: true, initial: false }),
            }),

            // Modifier tracking for transparency
            modifierSources: new SchemaField({
                characteristics: new ObjectField({ required: true, initial: {} }),
                skills: new ObjectField({ required: true, initial: {} }),
                combat: new SchemaField({
                    toHit: new ArrayField(new ObjectField(), { required: true, initial: [] }),
                    damage: new ArrayField(new ObjectField(), { required: true, initial: [] }),
                    initiative: new ArrayField(new ObjectField(), { required: true, initial: [] }),
                    defence: new ArrayField(new ObjectField(), { required: true, initial: [] }),
                }),
                wounds: new ArrayField(new ObjectField(), { required: true, initial: [] }),
                fate: new ArrayField(new ObjectField(), { required: true, initial: [] }),
                movement: new ArrayField(new ObjectField(), { required: true, initial: [] }),
            }),

            // UI preferences
            favoriteCombatActions: new ArrayField(new StringField({ required: true }), { required: true, initial: ['dodge', 'parry'] }),
            // favoriteTalents: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),
            // favoriteSkills: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static _migrateData(source) {
        super._migrateData?.(source);
        CreatureTemplate.#migrateSize(source);
        CreatureTemplate.#migrateWounds(source);
        CreatureTemplate.#migrateFatigue(source);
        CreatureTemplate.#migrateCharacteristics(source);
        CreatureTemplate.#migrateFate(source);
        CreatureTemplate.#migratePsy(source);
        CreatureTemplate.#migrateSkillsToAdvance(source);
    }

    /**
     * Migrate skills from boolean training flags to numeric advance field.
     * Resets all training booleans — effective rank is now computed at runtime
     * from origin path items + the advance field (XP purchases).
     * @param {object} source - The source data
     */
    static #migrateSkillsToAdvance(source) {
        if (!source.skills) return;
        for (const skill of Object.values(source.skills as Record<string, any>)) {
            // If advance field already exists, skip this skill
            if (skill.advance !== undefined) continue;

            // Initialize advance to 0 — training will be recomputed from origin path items
            skill.advance = 0;
            // Reset boolean flags — these are now derived in _prepareSkills()
            skill.trained = false;
            skill.plus10 = false;
            skill.plus20 = false;
            skill.plus30 = false;

            // Also migrate specialist entries
            if (Array.isArray(skill.entries)) {
                for (const entry of skill.entries) {
                    if (entry.advance !== undefined) continue;
                    entry.advance = 0;
                    entry.trained = false;
                    entry.plus10 = false;
                    entry.plus20 = false;
                    entry.plus30 = false;
                }
            }
        }
    }

    /**
     * Migrate size from string to integer.
     * @param {object} source - The source data
     */
    static #migrateSize(source) {
        if (source.size !== undefined && typeof source.size === 'string') {
            const sizeMap = {
                miniscule: 1,
                puny: 2,
                scrawny: 3,
                average: 4,
                hulking: 5,
                enormous: 6,
                massive: 7,
                immense: 8,
            };
            source.size = sizeMap[source.size.toLowerCase()] || 4;
        }
        if (source.size !== undefined) {
            source.size = this._toInt(source.size);
            if (source.size < 1) source.size = 1;
            if (source.size > 10) source.size = 10;
        }
    }

    /**
     * Migrate wounds values to integers.
     * @param {object} source - The source data
     */
    static #migrateWounds(source) {
        if (source.wounds) {
            if (source.wounds.max !== undefined) source.wounds.max = this._toInt(source.wounds.max);
            if (source.wounds.value !== undefined) source.wounds.value = this._toInt(source.wounds.value);
            if (source.wounds.critical !== undefined) source.wounds.critical = this._toInt(source.wounds.critical);
        }
    }

    /**
     * Migrate fatigue values to integers.
     * @param {object} source - The source data
     */
    static #migrateFatigue(source) {
        if (source.fatigue) {
            if (source.fatigue.max !== undefined) source.fatigue.max = this._toInt(source.fatigue.max);
            if (source.fatigue.value !== undefined) source.fatigue.value = this._toInt(source.fatigue.value);
        }
    }

    /**
     * Migrate characteristic values to integers.
     * @param {object} source - The source data
     */
    static #migrateCharacteristics(source) {
        if (source.characteristics) {
            for (const char of Object.values(source.characteristics as Record<string, any>)) {
                if (char.base !== undefined) char.base = this._toInt(char.base);
                if (char.advance !== undefined) char.advance = this._toInt(char.advance);
                if (char.modifier !== undefined) char.modifier = this._toInt(char.modifier);
                if (char.unnatural !== undefined) char.unnatural = this._toInt(char.unnatural);
                if (char.cost !== undefined) char.cost = this._toInt(char.cost);
            }
        }
    }

    /**
     * Migrate fate values to integers.
     * @param {object} source - The source data
     */
    static #migrateFate(source) {
        if (source.fate) {
            if (source.fate.max !== undefined) source.fate.max = this._toInt(source.fate.max);
            if (source.fate.value !== undefined) source.fate.value = this._toInt(source.fate.value);
        }
    }

    /**
     * Migrate psy values to integers.
     * @param {object} source - The source data
     */
    static #migratePsy(source) {
        if (source.psy) {
            if (source.psy.rating !== undefined) source.psy.rating = this._toInt(source.psy.rating);
            if (source.psy.sustained !== undefined) source.psy.sustained = this._toInt(source.psy.sustained);
            if (source.psy.defaultPR !== undefined) source.psy.defaultPR = this._toInt(source.psy.defaultPR);
        }
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static _cleanData(source, options = {}) {
        super._cleanData?.(source, options);
        CreatureTemplate.#cleanSize(source);
        CreatureTemplate.#cleanWounds(source);
        CreatureTemplate.#cleanFatigue(source);
        CreatureTemplate.#cleanFate(source);
        CreatureTemplate.#cleanPsy(source);
    }

    /**
     * Clean size field - ensure it's an integer.
     * @param {object} source - The source data
     */
    static #cleanSize(source) {
        if (source?.size !== undefined) {
            if (source.size === '' || source.size === null) {
                delete source.size; // Use schema default
            } else if (typeof source.size === 'string') {
                const sizeMap = {
                    miniscule: 1,
                    puny: 2,
                    scrawny: 3,
                    average: 4,
                    hulking: 5,
                    enormous: 6,
                    massive: 7,
                    immense: 8,
                };
                source.size = sizeMap[source.size.toLowerCase()] || 4;
            } else {
                source.size = this._toInt(source.size);
                if (source.size < 1) source.size = 1;
                if (source.size > 10) source.size = 10;
            }
        }
    }

    /**
     * Clean wounds fields - convert to proper integers.
     * @param {object} source - The source data
     */
    static #cleanWounds(source) {
        if (source?.wounds) {
            if (source.wounds.max !== undefined) {
                source.wounds.max = this._toInt(source.wounds.max, 0);
            }
            if (source.wounds.value !== undefined) {
                source.wounds.value = this._toInt(source.wounds.value, 0);
            }
            if (source.wounds.critical !== undefined) {
                source.wounds.critical = this._toInt(source.wounds.critical, 0);
            }
        }
    }

    /**
     * Clean fatigue fields.
     * @param {object} source - The source data
     */
    static #cleanFatigue(source) {
        if (source?.fatigue) {
            if (source.fatigue.max !== undefined) {
                source.fatigue.max = this._toInt(source.fatigue.max, 0);
            }
            if (source.fatigue.value !== undefined) {
                source.fatigue.value = this._toInt(source.fatigue.value, 0);
            }
        }
    }

    /**
     * Clean fate fields.
     * @param {object} source - The source data
     */
    static #cleanFate(source) {
        if (source?.fate) {
            if (source.fate.max !== undefined) {
                source.fate.max = this._toInt(source.fate.max, 0);
            }
            if (source.fate.value !== undefined) {
                source.fate.value = this._toInt(source.fate.value, 0);
            }
        }
    }

    /**
     * Clean psy fields.
     * @param {object} source - The source data
     */
    static #cleanPsy(source) {
        if (source?.psy) {
            if (source.psy.rating !== undefined) {
                source.psy.rating = this._toInt(source.psy.rating, 0);
            }
            if (source.psy.sustained !== undefined) {
                source.psy.sustained = this._toInt(source.psy.sustained, 0);
            }
            if (source.psy.defaultPR !== undefined) {
                source.psy.defaultPR = this._toInt(source.psy.defaultPR, 0);
            }
        }
    }

    /**
     * Map characteristic short names to full keys.
     * @type {Object<string, string>}
     */
    static CHARACTERISTIC_MAP = {
        WS: 'weaponSkill',
        BS: 'ballisticSkill',
        S: 'strength',
        T: 'toughness',
        Ag: 'agility',
        Int: 'intelligence',
        Per: 'perception',
        WP: 'willpower',
        Fel: 'fellowship',
    };

    /**
     * Get a characteristic by its short name or full key.
     * @param {string} key - Short name (e.g., "Ag") or full key (e.g., "agility")
     * @returns {object|null}
     */
    getCharacteristic(key) {
        if (this.characteristics[key]) {
            return this.characteristics[key];
        }
        const fullKey = CreatureTemplate.CHARACTERISTIC_MAP[key];
        if (fullKey && this.characteristics[fullKey]) {
            return this.characteristics[fullKey];
        }
        return null;
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    prepareBaseData() {
        super.prepareBaseData();
        this._initializeModifierTracking();
    }

    /** @inheritDoc */
    prepareDerivedData() {
        super.prepareDerivedData();
        // IMPORTANT: Characteristics must be prepared BEFORE skills
        // because skills need char.total for their calculations
        this._prepareCharacteristics();
        this._prepareSkills();
        this._preparePsy();
        // NOTE: _prepareFatigue and _prepareMovement are called in prepareEmbeddedData
        // AFTER characteristic modifiers are applied, so they use final totals.
    }

    /**
     * Second pass of derived data that requires items.
     * Called by the Document class after items are ready.
     */
    prepareEmbeddedData() {
        this._computeItemModifiers();
        this._applyModifiersToCharacteristics();
        this._registerOriginPathSkillSources();
        this._applyModifiersToSkills();
        // Fatigue/movement/lifting depend on final characteristic bonuses (after all modifiers)
        this._prepareFatigue();
        this._prepareMovement();
        this._computeArmour();
        this._computeEncumbrance();
    }

    /**
     * Initialize tracking objects for modifiers from various sources.
     * Must match schema in modifiers-template.mjs
     * @protected
     */
    _initializeModifierTracking() {
        this.modifierSources = {
            characteristics: {},
            skills: {},
            combat: {
                attack: [], // Matches schema: modifiers.combat.attack
                damage: [], // Matches schema: modifiers.combat.damage
                penetration: [], // Matches schema: modifiers.combat.penetration
                defense: [], // Matches schema: modifiers.combat.defense (US spelling)
                initiative: [], // Matches schema: modifiers.combat.initiative
                speed: [], // Matches schema: modifiers.combat.speed
            },
            wounds: [],
            fate: [],
            movement: [],
        };
    }

    /**
     * Convert a value to an integer, handling strings and edge cases.
     * @param {*} value - The value to convert
     * @param {number} fallback - Fallback value if conversion fails
     * @returns {number}
     */
    static _toInt(value, fallback = 0) {
        if (value === null || value === undefined || value === '') return fallback;
        const num = Number(value);
        if (Number.isNaN(num)) return fallback;
        return Math.floor(num);
    }

    /**
     * Prepare characteristic totals and bonuses.
     * Fatigue does NOT affect characteristics - it only applies -10 to all Tests.
     * Formula: total = base + (advance * 5) + modifier
     * Bonus = floor(total / 10), modified by unnatural multiplier
     * @protected
     */
    _prepareCharacteristics() {
        for (const [key, char] of Object.entries(this.characteristics as Record<string, any>)) {
            // Calculate total: base + (advance * 5) + modifier
            char.total = char.base + char.advance * 5 + char.modifier;

            // Base modifier is tens digit
            const baseModifier = Math.floor(char.total / 10);

            // Unnatural multiplies the modifier (0 = no unnatural, 2+ = multiplier)
            const unnaturalLevel = char.unnatural || 0;
            char.bonus = unnaturalLevel >= 2 ? baseModifier * unnaturalLevel : baseModifier;
        }

        // Update initiative bonus from characteristic
        const initChar = this.characteristics[this.initiative.characteristic];
        if (initChar) {
            this.initiative.bonus = initChar.bonus;
        }
    }

    /**
     * Prepare skill totals. Effective rank is computed at runtime:
     *   effectiveRank = min(originPathRank + advance, maxRank)
     * Boolean flags (trained/plus10/plus20/plus30) are derived for template compat.
     * @protected
     */
    _prepareSkills() {
        // Determine visible skills for this actor's game system
        const gameSystem = (this as any).gameSystem;
        const systemConfig = gameSystem ? SystemConfigRegistry.getOrNull(gameSystem) : null;
        const visibleSkills = systemConfig?.getVisibleSkills() ?? null;

        for (const [key, skill] of Object.entries(this.skills as Record<string, any>)) {
            // Set visibility based on game system
            if (visibleSkills) {
                skill.hidden = !visibleSkills.has(key);
            }

            const char = this.getCharacteristic(skill.characteristic);
            const charTotal = char?.total ?? 0;

            // Compute effective rank from origin path grants + XP advances
            const originRank = this._getOriginPathSkillRank(key);
            const effectiveRank = Math.min(originRank + (skill.advance || 0), 4);

            // Store rank data for display and advancement dialog
            skill.rank = effectiveRank;
            skill.originRank = originRank;

            // Derive boolean flags from effective rank (template backward compat)
            skill.trained = effectiveRank >= 1;
            skill.plus10 = effectiveRank >= 2;
            skill.plus20 = effectiveRank >= 3;
            skill.plus30 = effectiveRank >= 4;

            // Base value: full characteristic if rank >= 1, half if untrained
            const baseValue = effectiveRank > 0 ? charTotal : Math.floor(charTotal / 2);

            // Training bonus: rank 2 = +10, rank 3 = +20, rank 4 = +30
            const trainingBonus = effectiveRank >= 4 ? 30 : effectiveRank >= 3 ? 20 : effectiveRank >= 2 ? 10 : 0;

            skill.current = baseValue + trainingBonus + (skill.bonus || 0);

            // Process specialist entries
            if (Array.isArray(skill.entries)) {
                for (const entry of skill.entries) {
                    const entryCharKey = entry.characteristic || skill.characteristic;
                    const entryChar = this.getCharacteristic(entryCharKey);
                    const entryCharTotal = entryChar?.total ?? 0;

                    const entryOriginRank = this._getOriginPathSkillRank(key, entry.name || entry.specialization);
                    const entryEffectiveRank = Math.min(entryOriginRank + (entry.advance || 0), 4);

                    entry.rank = entryEffectiveRank;
                    entry.originRank = entryOriginRank;
                    entry.trained = entryEffectiveRank >= 1;
                    entry.plus10 = entryEffectiveRank >= 2;
                    entry.plus20 = entryEffectiveRank >= 3;
                    entry.plus30 = entryEffectiveRank >= 4;

                    const entryBaseValue = entryEffectiveRank > 0 ? entryCharTotal : Math.floor(entryCharTotal / 2);
                    const entryTrainingBonus = entryEffectiveRank >= 4 ? 30 : entryEffectiveRank >= 3 ? 20 : entryEffectiveRank >= 2 ? 10 : 0;
                    entry.current = entryBaseValue + entryTrainingBonus + (entry.bonus || 0);
                }
            }
        }
    }

    /**
     * Prepare psy rating.
     * @protected
     */
    _preparePsy() {
        this.psy.currentRating = this.psy.rating - this.psy.sustained;
    }

    /**
     * Prepare fatigue threshold.
     * Per core rules: threshold = Toughness Bonus.
     * Characters can take TB levels of fatigue before collapsing.
     * Any fatigue imposes -10 to all Tests.
     * @protected
     */
    _prepareFatigue() {
        const toughness = this.characteristics.toughness;
        if (toughness) {
            this.fatigue.max = toughness.bonus;
        }
    }

    /**
     * Compute modifiers from ALL item types - talents, traits, conditions, equipment.
     * NOTE: Origin paths are excluded - they use _getOriginPathCharacteristicModifier() instead.
     * @protected
     */
    _computeItemModifiers() {
        const actor = this.parent;
        if (!actor?.items) return;

        const modifierItems = actor.items.filter(
            (item) =>
                // Exclude origin paths - they're handled separately via _getOriginPathCharacteristicModifier
                !item.isOriginPath &&
                (item.isTalent ||
                    item.isTrait ||
                    item.isCondition ||
                    (item.type === 'armour' && item.system.equipped) ||
                    (item.type === 'cybernetic' && item.system.equipped) ||
                    (item.type === 'gear' && item.system.equipped)),
        );

        for (const item of modifierItems) {
            this._applyItemModifiers(item);
        }
    }

    /**
     * Apply modifiers from a single item.
     * @param {Item} item - The item to process modifiers from
     * @protected
     */
    _applyItemModifiers(item) {
        const mods = item.system?.modifiers;
        if (!mods) return;

        const source = {
            name: item.name,
            type: item.type,
            id: item.id,
        };

        // Characteristic modifiers
        if (mods.characteristics) {
            for (const [charKey, value] of Object.entries(mods.characteristics)) {
                if (value && typeof value === 'number') {
                    if (!this.modifierSources.characteristics[charKey]) {
                        this.modifierSources.characteristics[charKey] = [];
                    }
                    this.modifierSources.characteristics[charKey].push({ ...source, value });
                }
            }
        }

        // Skill modifiers
        if (mods.skills) {
            for (const [skillKey, value] of Object.entries(mods.skills)) {
                if (value && typeof value === 'number') {
                    if (!this.modifierSources.skills[skillKey]) {
                        this.modifierSources.skills[skillKey] = [];
                    }
                    this.modifierSources.skills[skillKey].push({ ...source, value });
                }
            }
        }

        // Combat modifiers
        if (mods.combat) {
            for (const [combatKey, value] of Object.entries(mods.combat)) {
                if (value && typeof value === 'number' && this.modifierSources.combat[combatKey]) {
                    this.modifierSources.combat[combatKey].push({ ...source, value });
                }
            }
        }

        // Resources modifiers (wounds, fate, insanity, corruption)
        if (mods.resources) {
            if (mods.resources.wounds && typeof mods.resources.wounds === 'number') {
                this.modifierSources.wounds.push({ ...source, value: mods.resources.wounds });
            }
            if (mods.resources.fate && typeof mods.resources.fate === 'number') {
                this.modifierSources.fate.push({ ...source, value: mods.resources.fate });
            }
            // Note: insanity and corruption modifiers are defined in schema but not yet implemented
        }

        // Movement modifier (from other modifiers array)
        if (mods.other && Array.isArray(mods.other)) {
            for (const mod of mods.other) {
                if (mod.key === 'movement' && typeof mod.value === 'number') {
                    this.modifierSources.movement.push({ ...source, value: mod.value, label: mod.label });
                }
            }
        }
    }

    /**
     * Apply item modifiers to characteristics.
     * @protected
     */
    _applyModifiersToCharacteristics() {
        // Collect origin path modifier sources for tooltip transparency
        this._registerOriginPathModifierSources();

        for (const [name, char] of Object.entries(this.characteristics as Record<string, any>)) {
            const originPathMod = this._getOriginPathCharacteristicModifier(name);
            const itemMod = this._getTotalCharacteristicModifier(name);
            const totalMod = originPathMod + itemMod;

            // Always store modifier values (even if 0)
            char.originPathModifier = originPathMod;
            char.itemModifier = itemMod;
            char.totalModifier = totalMod;

            // Recalculate total from BASE values to avoid accumulation
            // Base total is: base + (advance * 5) + modifier (from schema)
            const baseTotal = char.base + char.advance * 5 + char.modifier;
            char.total = baseTotal + totalMod;

            // Recalculate bonus with new total
            const baseModifier = Math.floor(char.total / 10);
            const unnaturalLevel = char.unnatural || 0;
            char.bonus = unnaturalLevel >= 2 ? baseModifier * unnaturalLevel : baseModifier;
        }

        // Update initiative bonus from characteristic (recalculate from base)
        const initChar = this.characteristics[this.initiative.characteristic];
        const baseInitBonus = initChar?.bonus ?? 0;

        // Apply combat modifiers from items
        const initMod = this._getTotalCombatModifier('initiative');
        this.initiative.bonus = baseInitBonus + initMod;
        this.initiative.itemModifier = initMod;

        // Store combat modifiers for display
        this.combatModifiers = {
            attack: this._getTotalCombatModifier('attack'), // Schema key: attack
            damage: this._getTotalCombatModifier('damage'),
            penetration: this._getTotalCombatModifier('penetration'),
            defense: this._getTotalCombatModifier('defense'), // Schema key: defense (US spelling)
            initiative: initMod,
            speed: this._getTotalCombatModifier('speed'),
        };
    }

    /**
     * Apply item modifiers to skills.
     * @protected
     */
    _applyModifiersToSkills() {
        // Recalculate skills from updated characteristic totals (which now include item modifiers)
        this._prepareSkills();

        for (const [skillKey, skill] of Object.entries(this.skills as Record<string, any>)) {
            const itemMod = this._getTotalSkillModifier(skillKey);
            if (itemMod !== 0) {
                skill.itemModifier = itemMod;
                skill.current += itemMod;

                if (Array.isArray(skill.entries)) {
                    for (const entry of skill.entries) {
                        entry.current += itemMod;
                    }
                }
            }
        }
    }

    /**
     * Compute armour values for all body locations.
     * @protected
     */
    _computeArmour() {
        const actor = this.parent;
        if (!actor) return;
        Object.assign(this.armour, computeArmour(actor));
    }

    /**
     * Compute encumbrance from carried items.
     * @protected
     */
    _computeEncumbrance() {
        const actor = this.parent;
        if (!actor) return;
        Object.assign(this.encumbrance, computeEncumbrance(actor));
    }

    /* -------------------------------------------- */
    /*  Modifier Getters                            */
    /* -------------------------------------------- */

    /**
     * Get total characteristic modifier from all item sources.
     * @param {string} charKey - The characteristic key
     * @returns {number}
     */
    _getTotalCharacteristicModifier(charKey) {
        const sources = this.modifierSources?.characteristics?.[charKey] || [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get total skill modifier from all item sources.
     * @param {string} skillKey - The skill key
     * @returns {number}
     */
    _getTotalSkillModifier(skillKey) {
        const sources = this.modifierSources?.skills?.[skillKey] || [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get total combat modifier from all item sources.
     * @param {string} combatKey - The combat stat key
     * @returns {number}
     */
    _getTotalCombatModifier(combatKey) {
        const sources = this.modifierSources?.combat?.[combatKey] || [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get total wounds modifier from origin path items.
     * @returns {number}
     */
    _getOriginPathWoundsModifier() {
        const actor = this.parent;
        if (!actor?.items) return 0;
        let total = 0;
        const originItems = actor.items.filter((item) => item.isOriginPath);
        for (const item of originItems) {
            if (item.system?.modifiers?.wounds) {
                total += item.system.modifiers.wounds;
            }
        }
        return total;
    }

    /**
     * Get total fate modifier from origin path items.
     * @returns {number}
     */
    _getOriginPathFateModifier() {
        const actor = this.parent;
        if (!actor?.items) return 0;
        let total = 0;
        const originItems = actor.items.filter((item) => item.isOriginPath);
        for (const item of originItems) {
            if (item.system?.modifiers?.fate) {
                total += item.system.modifiers.fate;
            }
        }
        return total;
    }

    /**
     * Get total characteristic modifier from origin path items.
     * Includes both base modifiers (from ModifiersTemplate) and choice-based
     * modifiers (from activeModifiers computed by selected choices).
     * @param {string} charKey - The characteristic key
     * @returns {number}
     */
    _getOriginPathCharacteristicModifier(charKey) {
        const actor = this.parent;
        if (!actor?.items) return 0;
        let total = 0;
        const originItems = actor.items.filter((item) => item.isOriginPath);
        for (const item of originItems) {
            // Base characteristic modifiers from ModifiersTemplate
            const mods = item.system?.modifiers?.characteristics;
            if (mods && mods[charKey]) {
                total += mods[charKey];
            }

            // Choice-based characteristic modifiers from activeModifiers
            const activeMods = item.system?.activeModifiers;
            if (Array.isArray(activeMods)) {
                for (const mod of activeMods) {
                    if (mod.type === 'characteristic' && mod.key === charKey && mod.value) {
                        total += mod.value;
                    }
                }
            }
        }
        return total;
    }

    /**
     * Register origin path modifier sources into modifierSources.characteristics
     * so that tooltips and stat breakdowns can display where bonuses come from.
     * @protected
     */
    _registerOriginPathModifierSources() {
        const actor = this.parent;
        if (!actor?.items) return;

        const originItems = actor.items.filter((item) => item.isOriginPath);
        for (const item of originItems) {
            const source = { name: item.name, type: 'originPath', id: item.id };

            // Base modifiers from ModifiersTemplate
            const mods = item.system?.modifiers?.characteristics;
            if (mods) {
                for (const [charKey, value] of Object.entries(mods)) {
                    if (value && typeof value === 'number') {
                        if (!this.modifierSources.characteristics[charKey]) {
                            this.modifierSources.characteristics[charKey] = [];
                        }
                        this.modifierSources.characteristics[charKey].push({ ...source, value });
                    }
                }
            }

            // Choice-based modifiers from activeModifiers
            const activeMods = item.system?.activeModifiers;
            if (Array.isArray(activeMods)) {
                for (const mod of activeMods) {
                    if (mod.type === 'characteristic' && mod.key && mod.value) {
                        if (!this.modifierSources.characteristics[mod.key]) {
                            this.modifierSources.characteristics[mod.key] = [];
                        }
                        this.modifierSources.characteristics[mod.key].push({
                            name: `${item.name} (${mod.source})`,
                            type: 'originPath',
                            id: item.id,
                            value: mod.value,
                        });
                    }
                }
            }
        }
    }

    /* -------------------------------------------- */
    /*  Origin Path Skill Methods                   */
    /* -------------------------------------------- */

    /**
     * Get the highest skill rank granted by origin path items for a given skill.
     * Scans embedded origin path items for matching skill grants.
     * @param {string} skillKey - Schema skill key (e.g. 'dodge', 'commonLore')
     * @param {string} [specialization] - For specialist skills (e.g. 'Imperial Guard')
     * @returns {number} Highest rank granted (0 = not granted, 1-4 = rank)
     */
    _getOriginPathSkillRank(skillKey: string, specialization?: string): number {
        const actor = this.parent;
        if (!actor?.items) return 0;

        let maxRank = 0;
        const originItems = actor.items.filter((item) => item.isOriginPath);
        const isSpecialist = SkillKeyHelper.SPECIALIST_KEYS.has(skillKey);

        if (originItems.length === 0) {
            // Only log once per preparation cycle, not per skill
            if (skillKey === 'awareness') {
                console.log(`_getOriginPathSkillRank: No origin path items found on actor ${actor.name}`);
            }
            return 0;
        }

        for (const item of originItems) {
            // Check base skill grants
            const skills = item.system?.grants?.skills || [];
            for (const grant of skills) {
                const grantKey = SkillKeyHelper.nameToKey(grant.name);

                if (grantKey !== skillKey) continue;

                // For specialist skills, also match specialization
                if (isSpecialist && specialization) {
                    const grantSpec = (grant.specialization || '').toLowerCase();
                    if (grantSpec && grantSpec !== specialization.toLowerCase()) continue;
                }

                const rank = BaseSystemConfig.skillLevelToRank(grant.level || 'trained');
                console.log(`  Skill grant: ${grant.name} (key: ${grantKey}) level: ${grant.level || 'trained'} → rank ${rank} from ${item.name}`);
                maxRank = Math.max(maxRank, rank);
            }

            // Check choice-based skill grants from activeModifiers
            const activeMods = item.system?.activeModifiers;
            if (Array.isArray(activeMods)) {
                for (const mod of activeMods) {
                    if (mod.type !== 'skill') continue;
                    const modKey = SkillKeyHelper.nameToKey(mod.key);
                    if (modKey !== skillKey) continue;
                    console.log(`  Choice skill grant: ${mod.key} (key: ${modKey}) → rank 1 from ${item.name} (choice: ${mod.source})`);
                    maxRank = Math.max(maxRank, 1);
                }
            }
        }

        if (maxRank > 0) {
            console.log(`_getOriginPathSkillRank('${skillKey}'${specialization ? `, '${specialization}'` : ''}): ${maxRank}`);
        }
        return maxRank;
    }

    /**
     * Register origin path skill sources into modifierSources.skills
     * for tooltip transparency.
     * @protected
     */
    _registerOriginPathSkillSources() {
        const actor = this.parent;
        if (!actor?.items) return;

        const originItems = actor.items.filter((item) => item.isOriginPath);
        for (const item of originItems) {
            const skills = item.system?.grants?.skills || [];
            for (const grant of skills) {
                const grantKey = SkillKeyHelper.nameToKey(grant.name);
                if (!grantKey) continue;

                const rank = BaseSystemConfig.skillLevelToRank(grant.level || 'trained');
                if (rank > 0) {
                    if (!this.modifierSources.skills[grantKey]) {
                        this.modifierSources.skills[grantKey] = [];
                    }
                    this.modifierSources.skills[grantKey].push({
                        name: item.name,
                        type: 'originPath',
                        id: item.id,
                        value: rank,
                        specialization: grant.specialization || undefined,
                    });
                }
            }
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Is this creature a psyker?
     * @type {boolean}
     */
    get isPsyker() {
        return this.psy.rating > 0;
    }

    /**
     * Is creature encumbered?
     * @type {boolean}
     */
    get isEncumbered() {
        return this.encumbrance.value > this.encumbrance.max;
    }

    /**
     * Prepare movement values based on agility and strength.
     * Movement: Half/Full/Charge/Run based on AB (Agility Bonus)
     * Leap/Jump: Based on SB (Strength Bonus)
     * Lifting: Based on SB with multipliers
     * @protected
     */
    _prepareMovement() {
        const agility = this.characteristics?.agility;
        const strength = this.characteristics?.strength;
        if (!agility) return;

        const ab = agility.bonus;
        const sb = strength?.bonus ?? 0;

        // Movement based on AB + Size adjustment
        const baseMove = ab + this.size - 4;
        this.movement.half = baseMove;
        this.movement.full = baseMove * 2;
        this.movement.charge = baseMove * 3;
        this.movement.run = baseMove * 6;

        // Leap/Jump based on Strength Bonus
        // Standing vertical leap: SB / 4 meters (round up to nearest 0.5m)
        // Running horizontal leap: SB meters
        // Jump (vertical jump height in cm): SB × 20
        this.movement.leapVertical = Math.ceil((sb / 4) * 2) / 2; // Round to nearest 0.5m
        this.movement.leapHorizontal = sb;
        this.movement.jump = sb * 20; // in centimeters

        // Lifting/Carrying capacity based on Strength Bonus
        // Carry: SB × 4.5 kg (sustained carrying)
        // Lift: SB × 9 kg (brief lifting over head)
        // Push: SB × 18 kg (pushing/dragging)
        this.lifting.carry = Math.round(sb * 4.5 * 10) / 10;
        this.lifting.lift = sb * 9;
        this.lifting.push = sb * 18;
    }

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /** @override */
    getRollData() {
        const data = super.getRollData();

        // Add characteristic values and bonuses for formulas
        for (const [key, char] of Object.entries(this.characteristics as Record<string, any>)) {
            data[char.short] = char.total;
            data[`${char.short}B`] = char.bonus;
            data[key] = char.total;
        }

        // Add skill values

        data.pr = this.psy.rating;

        return data;
    }
}
