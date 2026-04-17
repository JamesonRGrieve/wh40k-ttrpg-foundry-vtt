import CreatureTemplate from './templates/creature.ts';

const { NumberField, SchemaField, StringField, BooleanField, ArrayField, ObjectField, HTMLField } = foundry.data.fields;

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
/** Shape of a single acquisition entry in rogueTrader.acquisitions. */
interface AcquisitionEntry {
    name: string;
    availability: string;
    modifier: number;
    notes: string;
    acquired: boolean;
}

/** Shape of a background ability entry. */
interface BackgroundAbility {
    source: string;
    name: string;
    benefit: string;
}

/** Shape of a character generation assignments object. */
interface CharacterGenerationAssignments {
    weaponSkill: number | null;
    ballisticSkill: number | null;
    strength: number | null;
    toughness: number | null;
    agility: number | null;
    intelligence: number | null;
    perception: number | null;
    willpower: number | null;
    fellowship: number | null;
    [key: string]: number | null;
}

/** Shape of custom base values for non-human races. */
interface CharacterGenerationCustomBases {
    enabled: boolean;
    weaponSkill: number;
    ballisticSkill: number;
    strength: number;
    toughness: number;
    agility: number;
    intelligence: number;
    perception: number;
    willpower: number;
    fellowship: number;
    [key: string]: number | boolean;
}

export default class CharacterData extends CreatureTemplate {
    // Typed property declarations matching defineSchema()
    declare rank: number;
    declare mutations: string;
    declare gameSystem: 'rt' | 'dh1e' | 'dh2e' | 'bc' | 'ow' | 'dw';
    declare bio: {
        playerName: string;
        gender: string;
        age: string;
        build: string;
        complexion: string;
        hair: string;
        eyes: string;
        quirks: string;
        superstition: string;
        mementos: string;
        notes: string;
    };
    declare originPath: {
        homeWorld: string;
        birthright: string;
        lureOfTheVoid: string;
        trialsAndTravails: string;
        motivation: string;
        career: string;
        background: string;
        role: string;
        elite: string;
        divination: string;
        race: string;
        archetype: string;
        pride: string;
        disgrace: string;
        regiment: string;
        speciality: string;
        chapter: string;
    };
    declare experience: {
        used: number;
        total: number;
        available: number;
        /** Set during _computeExperienceSpent */
        spentCharacteristics?: number;
        spentSkills?: number;
        spentTalents?: number;
        spentPsychicPowers?: number;
        calculatedTotal?: number;
    };
    declare rogueTrader: {
        profitFactor: {
            current: number;
            starting: number;
            modifier: number;
            misfortunes: string;
        };
        endeavour: {
            name: string;
            achievementCurrent: number;
            achievementRequired: number;
            reward: number;
            notes: string;
        };
        acquisitions: AcquisitionEntry[];
    };
    declare influence: number;
    declare requisition: number;
    declare throneGelt: number;
    declare insanity: number;
    declare corruption: number;
    declare aptitudes: string[];
    declare chaosAlignment: 'unaligned' | 'khorne' | 'nurgle' | 'slaanesh' | 'tzeentch';
    declare backgroundEffects: {
        abilities: BackgroundAbility[];
        originPath: Record<string, unknown>;
    };
    declare characterGeneration: {
        rolls: number[];
        assignments: CharacterGenerationAssignments;
        customBases: CharacterGenerationCustomBases;
    };

    /** Computed during _updateWoundsFateModifiers */
    declare totalWoundsModifier: number;
    declare totalFateModifier: number;

    /* -------------------------------------------- */
    /*  Model Configuration                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
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
    static _migrateData(source: Record<string, any>): void {
        super._migrateData?.(source);
        // Handle old characteristic field names or other character-specific migrations
    }

    /** @inheritDoc */
    static _cleanData(source: Record<string, any> | undefined, options: Record<string, unknown> = {}): void {
        super._cleanData?.(source, options);
        CharacterData.#cleanExperience(source);
        CharacterData.#cleanMentalState(source);
        CharacterData.#cleanRogueTrader(source);
    }

    /**
     * Clean experience fields.
     * @param {object} source - The source data
     */
    static #cleanExperience(source: Record<string, any> | undefined): void {
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
    static #cleanMentalState(source: Record<string, any> | undefined): void {
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
    static #cleanRogueTrader(source: Record<string, any> | undefined): void {
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
    prepareDerivedData(): void {
        super.prepareDerivedData();
        this._prepareExperience();
    }

    /** @inheritDoc */
    prepareEmbeddedData(): void {
        this._computeOriginPathEffects(); // Must run before super to set gameSystem before _prepareSkills
        super.prepareEmbeddedData();
        this._computeExperienceSpent();
        this._updateWoundsFateModifiers();
        this._computeWoundsMax();
    }

    /**
     * Prepare experience calculations.
     * @protected
     */
    _prepareExperience(): void {
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
    _computeOriginPathEffects(): void {
        const actor = (this as any).parent;
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
            this._syncOriginPathNames(stepMap);
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
     * Sync origin path step names from step map to the originPath data.
     * @param {object} stepMap - Map of step keys to item data
     * @private
     */
    _syncOriginPathNames(stepMap: Record<string, any>): void {
        const allStepKeys = [
            'homeWorld',
            'birthright',
            'lureOfTheVoid',
            'trialsAndTravails',
            'motivation',
            'career',
            'background',
            'role',
            'elite',
            'divination',
            'race',
            'archetype',
            'pride',
            'disgrace',
            'regiment',
            'speciality',
            'chapter',
        ];
        for (const key of allStepKeys) {
            if (stepMap[key]?.name) {
                this.originPath[key] = stepMap[key].name;
            }
        }
    }

    /**
     * Get human-readable label for an origin path step.
     * @param {string} step - The step key (camelCase)
     * @returns {string} Human-readable label
     * @private
     */
    _getStepLabel(step: string): string {
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
    _computeExperienceSpent(): void {
        const actor = (this as any).parent;
        if (!actor?.items || !this.experience) return;

        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;
        this.experience.spentPsychicPowers = this.psy.cost;

        for (const characteristic of Object.values(this.characteristics)) {
            this.experience.spentCharacteristics += parseInt(String(characteristic.cost), 10);
        }

        for (const skill of Object.values(this.skills)) {
            if (Array.isArray(skill.entries)) {
                for (const speciality of skill.entries) {
                    this.experience.spentSkills += parseInt(String(speciality.cost ?? 0), 10);
                }
            } else {
                this.experience.spentSkills += parseInt(String(skill.cost ?? 0), 10);
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
    _updateWoundsFateModifiers(): void {
        const itemWounds = this.modifierSources?.wounds?.reduce((total, src) => total + (src.value || 0), 0) || 0;
        const itemFate = this.modifierSources?.fate?.reduce((total, src) => total + (src.value || 0), 0) || 0;

        this.totalWoundsModifier = itemWounds + this._getOriginPathWoundsModifier();
        this.totalFateModifier = itemFate + this._getOriginPathFateModifier();
    }

    /**
     * Compute wounds.max at runtime from origin path wound formulas.
     * For formulas containing TB (e.g. RT's "2xTB+1d5+1"), the TB component is
     * recalculated using current Toughness Bonus so wounds react to TB changes.
     * The die roll component uses the stored roll result from character creation.
     * @protected
     */
    _computeWoundsMax(): void {
        const actor = (this as any).parent;
        if (!actor?.items) return;

        const originItems = actor.items.filter((item) => item.isOriginPath);
        const tb = this.characteristics?.toughness?.bonus ?? 0;

        let computedMax = 0;
        let hasWoundFormula = false;

        for (const item of originItems) {
            const formula = item.system?.grants?.woundsFormula;
            const rollResult = item.system?.rollResults?.wounds;
            if (!formula || rollResult?.rolled == null) continue;

            hasWoundFormula = true;

            // Check if formula references TB (Toughness Bonus) — RT pattern
            const tbPattern = /(\d*)x?TB/i;
            const tbMatch = formula.match(tbPattern);

            if (tbMatch) {
                // Formula contains TB — recompute with current TB
                // Parse: "2xTB+1d5+1" → TB multiplier=2, remainder needs die result
                const tbMultiplier = parseInt(tbMatch[1]) || 1;
                const tbComponent = tbMultiplier * tb;

                // Strip the TB term and any dice terms to get the flat bonus
                const withoutTB = formula.replace(tbPattern, '0');
                const withoutDice = withoutTB.replace(/\d*d\d+/gi, '0');
                let flatBonus = 0;
                try {
                    // Evaluate the remaining flat terms (e.g., "0+0+1" → 1)
                    // Parse simple arithmetic (+/-) without eval
                    flatBonus = withoutDice
                        .split(/(?=[+-])/)
                        .map((t: string) => t.trim())
                        .filter((t: string) => t.length > 0)
                        .reduce((sum: number, t: string) => sum + (parseInt(t, 10) || 0), 0);
                } catch {
                    flatBonus = 0;
                }

                // Die result = stored total - (old TB component + flat bonus)
                // We don't know old TB, so extract die from breakdown or re-derive
                // Simpler: stored rolled = oldTB*mult + dieRoll + flat
                // dieRoll = stored - flat (since we don't have old TB, use the
                // breakdown if available, or assume the non-TB non-flat remainder)
                //
                // Actually: re-evaluate from components.
                // The stored `rolled` value was evaluated at commit time with old TB.
                // We can parse the breakdown string if available, or:
                // Just subtract what we can compute to isolate the die result.
                //
                // Best approach: the rolled value minus (old evaluated non-die, non-TB) gives the die.
                // But we don't have old TB. Use the breakdown.
                const breakdown = rollResult.breakdown || '';
                const dieMatch = breakdown.match(/\b(\d+)\s*\[.*?d/i);
                let dieValue = 0;
                if (dieMatch) {
                    dieValue = parseInt(dieMatch[1]) || 0;
                } else {
                    // Fallback: assume die portion = rolled - (flat bonus)
                    // This works for "N+1d5" style (no TB in formula, but we're in TB branch...)
                    // For TB formulas without breakdown, store the full value and accept
                    // it won't be perfectly separated. Use: rolled - flat as approximation.
                    dieValue = rollResult.rolled - flatBonus;
                }

                computedMax += tbComponent + dieValue + flatBonus;
            } else {
                // No TB reference — flat formula (DH2e/BC/OW style: "9+1d5")
                // Use stored rolled value as-is
                computedMax += rollResult.rolled;
            }
        }

        // Only override wounds.max if we found origin path wound formulas
        if (hasWoundFormula) {
            // Add item/modifier bonuses
            const modifierBonus = this.totalWoundsModifier || 0;
            this.wounds.max = computedMax + modifierBonus;
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get corruption level.
     * @type {string}
     */
    get corruptionLevel(): string {
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
    get insanityDegrees(): number {
        return Math.floor(this.insanity / 10);
    }

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /** @override */
    getRollData(): Record<string, unknown> {
        return super.getRollData();
    }
}
