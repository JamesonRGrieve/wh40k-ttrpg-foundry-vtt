import CreatureTemplate from './templates/creature.ts';

const { NumberField, SchemaField, StringField, BooleanField, ArrayField, ObjectField, HTMLField, SetField } = (foundry.data as any).fields;

/**
 * List of characteristic keys used for character generation.
 * @type {string[]}
 */
const GENERATION_CHARACTERISTICS = [
    'weaponSkill',
    'ballisticSkill',
    'strength',
    'toughness',
    'agility',
    'intelligence',
    'perception',
    'willpower',
    'fellowship',
];

/**
 * Data model for Character (Acolyte) actors.
 * Extends CreatureTemplate with character-specific fields like bio, experience, origin path.
 * @extends {CreatureTemplate}
 */
export default class CharacterData extends CreatureTemplate {
    [key: string]: any;
    /* -------------------------------------------- */
    /*  Model Configuration                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static defineSchema() {
        return {
            ...super.defineSchema(),

            rank: new NumberField({ required: true, initial: 1, min: 1, integer: true }),
            mutations: new StringField({ required: false, blank: true }),

            // ===== GAME SYSTEM =====
            gameSystem: new StringField({
                required: true,
                initial: 'rt',
                choices: ['rt', 'dh1e', 'dh2e', 'bc', 'ow', 'dw'],
            }),

            // ===== CHARACTER BIOGRAPHY =====
            bio: new SchemaField({
                playerName: new StringField({ required: false, blank: true }),
                gender: new StringField({ required: false, blank: true }),
                age: new StringField({ required: false, blank: true }),
                build: new StringField({ required: false, blank: true }),
                complexion: new StringField({ required: false, blank: true }),
                hair: new StringField({ required: false, blank: true }),
                eyes: new StringField({ required: false, blank: true }),
                quirks: new StringField({ required: false, blank: true }),
                superstition: new StringField({ required: false, blank: true }),
                mementos: new StringField({ required: false, blank: true }),
                notes: new HTMLField({ required: false, blank: true }),
            }),

            // ===== ORIGIN PATH =====
            originPath: new SchemaField({
                homeWorld: new StringField({ required: false, blank: true }),
                birthright: new StringField({ required: false, blank: true }),
                lureOfTheVoid: new StringField({ required: false, blank: true }),
                trialsAndTravails: new StringField({ required: false, blank: true }),
                motivation: new StringField({ required: false, blank: true }),
                career: new StringField({ required: false, blank: true }),
                // DH2e-specific fields
                background: new StringField({ required: false, blank: true }),
                role: new StringField({ required: false, blank: true }),
                elite: new StringField({ required: false, blank: true }),
                divination: new StringField({ required: false, blank: true }),
                // Black Crusade fields
                race: new StringField({ required: false, blank: true }),
                archetype: new StringField({ required: false, blank: true }),
                pride: new StringField({ required: false, blank: true }),
                disgrace: new StringField({ required: false, blank: true }),
                // Only War / Deathwatch fields
                regiment: new StringField({ required: false, blank: true }),
                speciality: new StringField({ required: false, blank: true }),
                chapter: new StringField({ required: false, blank: true }),
            }),

            // ===== EXPERIENCE =====
            experience: new SchemaField({
                used: new NumberField({ required: true, initial: 4500, min: 0, integer: true }),
                total: new NumberField({ required: true, initial: 5000, min: 0, integer: true }),
                available: new NumberField({ required: true, initial: 0, integer: true }), // Derived
            }),

            // ===== ROGUE TRADER / WH40K FIELDS =====
            rogueTrader: new SchemaField({
                profitFactor: new SchemaField({
                    current: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    starting: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    modifier: new NumberField({ required: true, initial: 0, integer: true }),
                    misfortunes: new StringField({ required: false, blank: true }),
                }),
                endeavour: new SchemaField({
                    name: new StringField({ required: false, blank: true }),
                    achievementCurrent: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    achievementRequired: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    reward: new NumberField({ required: true, initial: 0, integer: true }),
                    notes: new StringField({ required: false, blank: true }),
                }),
                acquisitions: new ArrayField(
                    new SchemaField({
                        name: new StringField({ required: false, blank: true }),
                        availability: new StringField({ required: false, blank: true }),
                        modifier: new NumberField({ required: true, initial: 0, integer: true }),
                        notes: new StringField({ required: false, blank: true }),
                        acquired: new BooleanField({ required: true, initial: false }),
                    }),
                    { required: true, initial: [] },
                ),
            }),

            // ===== DH2e RESOURCES =====
            influence: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            requisition: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            throneGelt: new NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // ===== MENTAL STATE =====
            insanity: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            // insanityBonus: new NumberField({ required: true, initial: 0, min: 0, integer: true }), // Derived
            corruption: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            // corruptionBonus: new NumberField({ required: true, initial: 0, min: 0, integer: true }), // Derived

            // ===== APTITUDES (DH2e/BC/OW) =====
            // Collected at runtime from origin path items during prepareEmbeddedData.
            // Used by aptitude-based systems for XP cost calculation.
            aptitudes: new ArrayField(new StringField({ required: true }), { required: true, initial: [] }),

            // ===== BLACK CRUSADE =====
            chaosAlignment: new StringField({
                required: true,
                initial: 'unaligned',
                choices: ['unaligned', 'khorne', 'nurgle', 'slaanesh', 'tzeentch'],
            }),

            // Effects computed from origin path items - populated during prepareEmbeddedData
            backgroundEffects: new SchemaField({
                abilities: new ArrayField(
                    new SchemaField({
                        source: new StringField({ required: false }),
                        name: new StringField({ required: false }),
                        benefit: new StringField({ required: false }),
                    }),
                    { required: true, initial: [] },
                ),
                originPath: new ObjectField({ required: true, initial: {} }),
            }),

            // ===== CHARACTER GENERATION =====
            characterGeneration: new SchemaField({
                // Track raw dice rolls (2D20 summed for each characteristic)
                rolls: new ArrayField(new NumberField({ required: true, initial: 0, integer: true, min: 0, max: 40 }), { initial: [] }),
                // Maps characteristic key to roll index (0-8), or null if unassigned
                assignments: new SchemaField(
                    Object.fromEntries(
                        GENERATION_CHARACTERISTICS.map((key) => [
                            key,
                            new NumberField({ required: false, nullable: true, initial: null, integer: true, min: 0, max: 8 }),
                        ]),
                    ),
                ),
                // Custom base values (for non-human races)
                customBases: new SchemaField({
                    enabled: new BooleanField({ initial: false }),
                    ...Object.fromEntries(
                        GENERATION_CHARACTERISTICS.map((key) => [key, new NumberField({ required: true, initial: 25, integer: true, min: 0 })]),
                    ),
                }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static _migrateData(source) {
        super._migrateData?.(source);
        // Handle old characteristic field names or other character-specific migrations
    }

    /** @inheritDoc */
    static _cleanData(source, options = {}) {
        super._cleanData?.(source, options);
        CharacterData.#cleanExperience(source);
        CharacterData.#cleanMentalState(source);
        CharacterData.#cleanRogueTrader(source);
    }

    /**
     * Clean experience fields.
     * @param {object} source - The source data
     */
    static #cleanExperience(source) {
        if (source?.experience) {
            if (source.experience.used !== undefined) {
                source.experience.used = this._toInt(source.experience.used);
            }
            if (source.experience.total !== undefined) {
                source.experience.total = this._toInt(source.experience.total);
            }
            if (source.experience.available !== undefined) {
                source.experience.available = this._toInt(source.experience.available);
            }
            if (source.experience.spentCharacteristics !== undefined) {
                source.experience.spentCharacteristics = this._toInt(source.experience.spentCharacteristics);
            }
            if (source.experience.spentSkills !== undefined) {
                source.experience.spentSkills = this._toInt(source.experience.spentSkills);
            }
            if (source.experience.spentTalents !== undefined) {
                source.experience.spentTalents = this._toInt(source.experience.spentTalents);
            }
            if (source.experience.spentPsychicPowers !== undefined) {
                source.experience.spentPsychicPowers = this._toInt(source.experience.spentPsychicPowers);
            }
            if (source.experience.calculatedTotal !== undefined) {
                source.experience.calculatedTotal = this._toInt(source.experience.calculatedTotal);
            }
        }
    }

    /**
     * Clean mental state fields.
     * @param {object} source - The source data
     */
    static #cleanMentalState(source) {
        if (source?.insanity !== undefined) {
            source.insanity = this._toInt(source.insanity);
        }
        if (source?.corruption !== undefined) {
            source.corruption = this._toInt(source.corruption);
        }
        if (source?.insanityBonus !== undefined) {
            source.insanityBonus = this._toInt(source.insanityBonus);
        }
        if (source?.corruptionBonus !== undefined) {
            source.corruptionBonus = this._toInt(source.corruptionBonus);
        }
    }

    /**
     * Clean Rogue Trader / WH40K fields.
     * @param {object} source - The source data
     */
    static #cleanRogueTrader(source) {
        const rt = source?.rogueTrader;
        if (!rt) return;

        const pf = rt.profitFactor;
        if (pf) {
            if (pf.current !== undefined) pf.current = this._toInt(pf.current);
            if (pf.starting !== undefined) pf.starting = this._toInt(pf.starting);
            if (pf.modifier !== undefined) pf.modifier = this._toInt(pf.modifier);
        }

        const endeavour = rt.endeavour;
        if (endeavour) {
            if (endeavour.achievementCurrent !== undefined) endeavour.achievementCurrent = this._toInt(endeavour.achievementCurrent);
            if (endeavour.achievementRequired !== undefined) endeavour.achievementRequired = this._toInt(endeavour.achievementRequired);
            if (endeavour.reward !== undefined) endeavour.reward = this._toInt(endeavour.reward);
        }

        if (Array.isArray(rt.acquisitions)) {
            for (const acquisition of rt.acquisitions) {
                if (acquisition?.modifier !== undefined) acquisition.modifier = this._toInt(acquisition.modifier);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    prepareDerivedData() {
        super.prepareDerivedData();
        this._prepareExperience();
    }

    /** @inheritDoc */
    prepareEmbeddedData() {
        super.prepareEmbeddedData();
        this._computeOriginPathEffects();
        this._computeExperienceSpent();
        this._updateWoundsFateModifiers();
    }

    /**
     * Prepare experience calculations.
     * @protected
     */
    _prepareExperience() {
        this.experience.available = this.experience.total - this.experience.used;
    }

    // /**
    //  * Prepare insanity and corruption derived values.
    //  * @protected
    //  */
    // _prepareMentalState() {
    //   this.insanityBonus = Math.floor(this.insanity / 10);
    //   this.corruptionBonus = Math.floor(this.corruption / 10);
    // }

    /**
     * Compute origin path effects from items.
     * @protected
     */
    _computeOriginPathEffects() {
        const actor = this.parent;
        if (!actor?.items) return;

        const originItems = actor.items.filter((item) => item.isOriginPath);

        // Map step keys (camelCase from schema) to items — covers all game systems
        const stepMap = {
            // Rogue Trader
            homeWorld: null,
            birthright: null,
            lureOfTheVoid: null,
            trialsAndTravails: null,
            motivation: null,
            career: null,
            lineage: null,
            // Dark Heresy 2e
            background: null,
            role: null,
            elite: null,
            divination: null,
            // Black Crusade
            race: null,
            archetype: null,
            pride: null,
            disgrace: null,
            // Only War / Deathwatch
            regiment: null,
            speciality: null,
            chapter: null,
        };

        // Reset background abilities
        this.backgroundEffects.abilities = [];

        for (const item of originItems) {
            // Get step from system data (camelCase like "homeWorld", "career")
            const step = item.system?.step || item.flags?.rt?.step || '';
            if (Object.prototype.hasOwnProperty.call(stepMap, step)) {
                stepMap[step] = item;
            }

            // Get human-readable step name for display
            const stepLabel = this._getStepLabel(step);
            this.backgroundEffects.abilities.push({
                source: stepLabel || 'Origin Path',
                name: item.name,
                benefit: item.system?.effects || item.system?.descriptionText || item.system?.description?.value || '',
            });
        }

        // Store origin path selections
        this.backgroundEffects.originPath = stepMap;

        // Update the originPath system data with the names (only if origin builder items exist)
        if (this.originPath) {
            // RT steps
            if (stepMap.homeWorld?.name) this.originPath.homeWorld = stepMap.homeWorld.name;
            if (stepMap.birthright?.name) this.originPath.birthright = stepMap.birthright.name;
            if (stepMap.lureOfTheVoid?.name) this.originPath.lureOfTheVoid = stepMap.lureOfTheVoid.name;
            if (stepMap.trialsAndTravails?.name) this.originPath.trialsAndTravails = stepMap.trialsAndTravails.name;
            if (stepMap.motivation?.name) this.originPath.motivation = stepMap.motivation.name;
            if (stepMap.career?.name) this.originPath.career = stepMap.career.name;
            // DH2e steps
            if (stepMap.background?.name) this.originPath.background = stepMap.background.name;
            if (stepMap.role?.name) this.originPath.role = stepMap.role.name;
            if (stepMap.elite?.name) this.originPath.elite = stepMap.elite.name;
            if (stepMap.divination?.name) this.originPath.divination = stepMap.divination.name;
            // BC steps
            if (stepMap.race?.name) this.originPath.race = stepMap.race.name;
            if (stepMap.archetype?.name) this.originPath.archetype = stepMap.archetype.name;
            if (stepMap.pride?.name) this.originPath.pride = stepMap.pride.name;
            if (stepMap.disgrace?.name) this.originPath.disgrace = stepMap.disgrace.name;
            // OW / DW steps
            if (stepMap.regiment?.name) this.originPath.regiment = stepMap.regiment.name;
            if (stepMap.speciality?.name) this.originPath.speciality = stepMap.speciality.name;
            if (stepMap.chapter?.name) this.originPath.chapter = stepMap.chapter.name;
        }

        // Collect aptitudes from all origin path items (DH2e/BC/OW use aptitudes for XP costs)
        const allAptitudes = new Set<string>();
        for (const item of originItems) {
            const aptitudes = item.system?.grants?.aptitudes;
            if (Array.isArray(aptitudes)) {
                for (const apt of aptitudes) {
                    if (apt) allAptitudes.add(apt);
                }
            }
        }
        this.aptitudes = [...allAptitudes];

        // Derive gameSystem from origin path items if not already set
        if (originItems.length > 0 && (!this.gameSystem || this.gameSystem === 'rt')) {
            const firstSystem = originItems[0]?.system?.gameSystem;
            if (firstSystem && firstSystem !== this.gameSystem) {
                this.gameSystem = firstSystem;
            }
        }
    }

    /**
     * Get human-readable label for an origin path step.
     * @param {string} step - The step key (camelCase)
     * @returns {string} Human-readable label
     * @private
     */
    _getStepLabel(step) {
        const labels = {
            // RT
            homeWorld: 'Home World',
            birthright: 'Birthright',
            lureOfTheVoid: 'Lure of the Void',
            trialsAndTravails: 'Trials and Travails',
            motivation: 'Motivation',
            career: 'Career',
            lineage: 'Lineage',
            // DH2e
            background: 'Background',
            role: 'Role',
            elite: 'Elite Advance',
            divination: 'Divination',
            // Black Crusade
            race: 'Race',
            archetype: 'Archetype',
            pride: 'Pride',
            disgrace: 'Disgrace',
            // Only War / Deathwatch
            regiment: 'Regiment',
            speciality: 'Speciality',
            chapter: 'Chapter',
        };
        return labels[step] || step;
    }

    /**
     * Compute experience spent from items and stats.
     * @protected
     */
    _computeExperienceSpent() {
        const actor = this.parent;
        if (!actor?.items || !this.experience) return;

        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;
        this.experience.spentPsychicPowers = this.psy.cost;

        for (const characteristic of Object.values(this.characteristics) as any[]) {
            this.experience.spentCharacteristics += parseInt(characteristic.cost, 10);
        }

        for (const skill of Object.values(this.skills) as any[]) {
            if (Array.isArray(skill.entries)) {
                for (const speciality of skill.entries) {
                    this.experience.spentSkills += parseInt(speciality.cost ?? 0, 10);
                }
            } else {
                this.experience.spentSkills += parseInt(skill.cost ?? 0, 10);
            }
        }

        for (const item of actor.items) {
            if (item.isTalent) {
                this.experience.spentTalents += parseInt(item.cost, 10);
            } else if (item.isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt(item.cost, 10);
            }
        }

        this.experience.calculatedTotal =
            this.experience.spentCharacteristics + this.experience.spentSkills + this.experience.spentTalents + this.experience.spentPsychicPowers;
    }

    /**
     * Update wounds and fate modifier totals for display.
     * @protected
     */
    _updateWoundsFateModifiers() {
        const itemWounds = this.modifierSources?.wounds?.reduce((total, src) => total + (src.value || 0), 0) || 0;
        const itemFate = this.modifierSources?.fate?.reduce((total, src) => total + (src.value || 0), 0) || 0;

        this.totalWoundsModifier = itemWounds + this._getOriginPathWoundsModifier();
        this.totalFateModifier = itemFate + this._getOriginPathFateModifier();
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get corruption level.
     * @type {string}
     */
    get corruptionLevel() {
        const cp = this.corruption;
        if (cp < 30) return 'none';
        if (cp < 60) return 'tainted';
        if (cp < 90) return 'corrupted';
        return 'lost';
    }

    /**
     * Get insanity degrees.
     * @type {number}
     */
    get insanityDegrees() {
        return Math.floor(this.insanity / 10);
    }

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /** @override */
    getRollData() {
        return super.getRollData();
    }
}
