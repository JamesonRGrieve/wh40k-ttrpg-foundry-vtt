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
type CharacterGenerationAssignments = Record<string, number | null>;

/** Shape of custom base values for non-human races. */
type CharacterGenerationCustomBases = Record<string, number | boolean>;

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
    static override defineSchema(): Record<string, foundry.data.fields.DataField> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            rank: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
            mutations: new fields.StringField({ required: false, blank: true }),

            // ===== GAME SYSTEM =====
            gameSystem: new fields.StringField({
                required: true,
                initial: 'rt',
                choices: ['rt', 'dh1e', 'dh2e', 'bc', 'ow', 'dw'],
            }),

            // ===== CHARACTER BIOGRAPHY =====
            bio: new fields.SchemaField({
                playerName: new fields.StringField({ required: false, blank: true }),
                gender: new fields.StringField({ required: false, blank: true }),
                age: new fields.StringField({ required: false, blank: true }),
                build: new fields.StringField({ required: false, blank: true }),
                complexion: new fields.StringField({ required: false, blank: true }),
                hair: new fields.StringField({ required: false, blank: true }),
                eyes: new fields.StringField({ required: false, blank: true }),
                quirks: new fields.StringField({ required: false, blank: true }),
                superstition: new fields.StringField({ required: false, blank: true }),
                mementos: new fields.StringField({ required: false, blank: true }),
                notes: new fields.HTMLField({ required: false, blank: true }),
            }),

            // ===== ORIGIN PATH =====
            originPath: new fields.SchemaField({
                homeWorld: new fields.StringField({ required: false, blank: true }),
                birthright: new fields.StringField({ required: false, blank: true }),
                lureOfTheVoid: new fields.StringField({ required: false, blank: true }),
                trialsAndTravails: new fields.StringField({ required: false, blank: true }),
                motivation: new fields.StringField({ required: false, blank: true }),
                career: new fields.StringField({ required: false, blank: true }),
                // DH2e-specific fields
                background: new fields.StringField({ required: false, blank: true }),
                role: new fields.StringField({ required: false, blank: true }),
                elite: new fields.StringField({ required: false, blank: true }),
                divination: new fields.StringField({ required: false, blank: true }),
                // Black Crusade fields
                race: new fields.StringField({ required: false, blank: true }),
                archetype: new fields.StringField({ required: false, blank: true }),
                pride: new fields.StringField({ required: false, blank: true }),
                disgrace: new fields.StringField({ required: false, blank: true }),
                // Only War / Deathwatch fields
                regiment: new fields.StringField({ required: false, blank: true }),
                speciality: new fields.StringField({ required: false, blank: true }),
                chapter: new fields.StringField({ required: false, blank: true }),
            }),

            // ===== EXPERIENCE =====
            // Defaults are 0/0: actual starting XP is applied by the origin path
            // builder's _resetExperienceAndAdvancements using the system's
            // startingXP config (1000 for DH2e, etc.).
            experience: new fields.SchemaField({
                used: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                total: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                available: new fields.NumberField({ required: true, initial: 0, integer: true }), // Derived
            }),

            // ===== ROGUE TRADER / WH40K FIELDS =====
            rogueTrader: new fields.SchemaField({
                profitFactor: new fields.SchemaField({
                    current: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    starting: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    misfortunes: new fields.StringField({ required: false, blank: true }),
                }),
                endeavour: new fields.SchemaField({
                    name: new fields.StringField({ required: false, blank: true }),
                    achievementCurrent: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    achievementRequired: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                    reward: new fields.NumberField({ required: true, initial: 0, integer: true }),
                    notes: new fields.StringField({ required: false, blank: true }),
                }),
                acquisitions: new fields.ArrayField(
                    new fields.SchemaField({
                        name: new fields.StringField({ required: false, blank: true }),
                        availability: new fields.StringField({ required: false, blank: true }),
                        modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                        notes: new fields.StringField({ required: false, blank: true }),
                        acquired: new fields.BooleanField({ required: true, initial: false }),
                    }),
                    { required: true, initial: [] },
                ),
            }),

            // ===== DH2e RESOURCES =====
            influence: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            requisition: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            throneGelt: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // ===== MENTAL STATE =====
            insanity: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            // insanityBonus: new NumberField({ required: true, initial: 0, min: 0, integer: true }), // Derived
            corruption: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            // corruptionBonus: new NumberField({ required: true, initial: 0, min: 0, integer: true }), // Derived

            // ===== APTITUDES (DH2e/BC/OW) =====
            // Collected at runtime from origin path items during prepareEmbeddedData.
            // Used by aptitude-based systems for XP cost calculation.
            aptitudes: new fields.ArrayField(new fields.StringField({ required: true }), { required: true, initial: [] }),

            // ===== BLACK CRUSADE =====
            chaosAlignment: new fields.StringField({
                required: true,
                initial: 'unaligned',
                choices: ['unaligned', 'khorne', 'nurgle', 'slaanesh', 'tzeentch'],
            }),

            // Effects computed from origin path items - populated during prepareEmbeddedData
            backgroundEffects: new fields.SchemaField({
                abilities: new fields.ArrayField(
                    new fields.SchemaField({
                        source: new fields.StringField({ required: false }),
                        name: new fields.StringField({ required: false }),
                        benefit: new fields.StringField({ required: false }),
                    }),
                    { required: true, initial: [] },
                ),
                originPath: new fields.ObjectField({ required: true, initial: {} }),
            }),

            // ===== CHARACTER GENERATION =====
            characterGeneration: new fields.SchemaField({
                // Track raw dice rolls (2D20 summed for each characteristic)
                rolls: new fields.ArrayField(new fields.NumberField({ required: true, initial: 0, integer: true, min: 0, max: 40 }), { initial: [] }),
                // Maps characteristic key to roll index (0-8), or null if unassigned
                assignments: new fields.SchemaField(
                    Object.fromEntries(
                        GENERATION_CHARACTERISTICS.map((key) => [
                            key,
                            new fields.NumberField({ required: false, nullable: true, initial: null, integer: true, min: 0, max: 8 }),
                        ]),
                    ),
                ),
                // Custom base values (for non-human races)
                customBases: new fields.SchemaField({
                    enabled: new fields.BooleanField({ initial: false }),
                    ...Object.fromEntries(
                        GENERATION_CHARACTERISTICS.map((key) => [key, new fields.NumberField({ required: true, initial: 25, integer: true, min: 0 })]),
                    ),
                }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        // Handle old characteristic field names or other character-specific migrations
    }

    /** @inheritDoc */
    static override _cleanData(source: Record<string, unknown> | undefined, options: DataModelV14.CleaningOptions = {}): void {
        super._cleanData?.(source, options);
        CharacterData.#cleanExperience(source);
        CharacterData.#cleanMentalState(source);
        CharacterData.#cleanRogueTrader(source);
    }

    /**
     * Clean experience fields.
     * @param {Record<string, unknown>} source - The source data
     */
    static #cleanExperience(source: Record<string, unknown> | undefined): void {
        if (!source || !source.experience || typeof source.experience !== 'object') return;
        const experience = source.experience as Record<string, unknown>;

        const fields = ['used', 'total', 'available', 'spentCharacteristics', 'spentSkills', 'spentTalents', 'spentPsychicPowers', 'calculatedTotal'];
        for (const field of fields) {
            if (typeof experience[field] === 'string') {
                experience[field] = Number(experience[field]);
            }
        }
    }

    /**
     * Clean mental state fields.
     * @param {Record<string, unknown>} source - The source data
     */
    static #cleanMentalState(source: Record<string, unknown> | undefined): void {
        if (!source) return;
        const fields = ['insanity', 'corruption', 'insanityBonus', 'corruptionBonus'];
        for (const field of fields) {
            if (typeof source[field] === 'string') {
                source[field] = Number(source[field]);
            }
        }
    }

    /**
     * Clean Rogue Trader / WH40K fields.
     * @param {Record<string, unknown>} source - The source data
     */
    static #cleanRogueTrader(source: Record<string, unknown> | undefined): void {
        const rt = source?.rogueTrader as Record<string, unknown> | undefined;
        if (!rt) return;

        const pf = rt.profitFactor as Record<string, unknown> | undefined;
        if (pf) {
            for (const field of ['current', 'starting', 'modifier']) {
                if (typeof pf[field] === 'string') pf[field] = Number(pf[field]);
            }
        }

        const endeavour = rt.endeavour as Record<string, unknown> | undefined;
        if (endeavour) {
            for (const field of ['achievementCurrent', 'achievementRequired', 'reward']) {
                if (typeof endeavour[field] === 'string') endeavour[field] = Number(endeavour[field]);
            }
        }

        if (Array.isArray(rt.acquisitions)) {
            for (const acquisition of rt.acquisitions as Array<Record<string, unknown>>) {
                if (typeof acquisition.modifier === 'string') acquisition.modifier = Number(acquisition.modifier);
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

        // Collect aptitudes from origin path (DH2e/BC/OW use aptitudes for XP costs).
        // Sources: fixed grants.aptitudes + resolved grants.choices[type=aptitude] +
        // the 9 inherent characteristic-based aptitudes every character has per DH2 Core p.79.
        const allAptitudes = new Set<string>();

        // Inherent characteristic aptitudes (DH2 RAW: every character has these)
        for (const apt of ['Weapon Skill', 'Ballistic Skill', 'Strength', 'Toughness', 'Agility', 'Intelligence', 'Perception', 'Willpower', 'Fellowship']) {
            allAptitudes.add(apt);
        }

        for (const item of originItems) {
            const grants = item.system?.grants;
            if (!grants) continue;

            // Fixed aptitudes
            if (Array.isArray(grants.aptitudes)) {
                for (const apt of grants.aptitudes) {
                    if (apt) allAptitudes.add(apt);
                }
            }

            // Resolved aptitude choices — mirrors the key logic in origin-path-builder._prepareChoices
            const choices = (grants.choices ?? []) as any[];
            const selectedChoices = (item.system?.selectedChoices ?? {}) as Record<string, string[]>;
            const labelCounts: Record<string, number> = {};
            for (const choice of choices) {
                const baseLabel = choice.label || choice.name || '';
                labelCounts[baseLabel] = (labelCounts[baseLabel] || 0) + 1;
                const suffix = labelCounts[baseLabel] > 1 ? ` (${labelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                if (choice.type !== 'aptitude') continue;
                const picks = selectedChoices[choiceKey];
                if (!Array.isArray(picks)) continue;
                for (const pick of picks) {
                    const option = choice.options?.find((o: any) => o.value === pick || o.name === pick);
                    const value = option?.value || option?.name || pick;
                    if (value) allAptitudes.add(value);
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
        const actor = this.parent as foundry.abstract.Document;
        if (!actor?.items || !this.experience) return;

        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;

        const psy = (this as any).psy as { cost: number } | undefined;
        this.experience.spentPsychicPowers = psy?.cost || 0;

        for (const characteristic of Object.values(this.characteristics) as Array<{ cost: number | string }>) {
            this.experience.spentCharacteristics += parseInt(String(characteristic.cost), 10);
        }

        for (const skill of Object.values(this.skills) as Array<{ cost: number | string; entries?: Array<{ cost?: number | string }> }>) {
            if (Array.isArray(skill.entries)) {
                for (const speciality of skill.entries) {
                    this.experience.spentSkills += parseInt(String(speciality.cost ?? 0), 10);
                }
            } else {
                this.experience.spentSkills += parseInt(String(skill.cost ?? 0), 10);
            }
        }

        for (const item of actor.items) {
            if ((item as any).isTalent) {
                this.experience.spentTalents += parseInt((item as any).system?.cost || '0', 10);
            } else if ((item as any).isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt((item as any).system?.cost || '0', 10);
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
        const modifierSources = (this as any).modifierSources as { wounds?: Array<{ value?: number }>; fate?: Array<{ value?: number }> } | undefined;
        const itemWounds = modifierSources?.wounds?.reduce((total: number, src: { value?: number }) => total + (src.value || 0), 0) || 0;
        const itemFate = modifierSources?.fate?.reduce((total: number, src: { value?: number }) => total + (src.value || 0), 0) || 0;

        (this as any).totalWoundsModifier = itemWounds + ((this as any)._getOriginPathWoundsModifier?.() || 0);
        (this as any).totalFateModifier = itemFate + ((this as any)._getOriginPathFateModifier?.() || 0);
    }

    /**
     * Compute wounds.max at runtime from origin path wound formulas.
     * For formulas containing TB (e.g. RT's "2xTB+1d5+1"), the TB component is
     * recalculated using current Toughness Bonus so wounds react to TB changes.
     * The die roll component uses the stored roll result from character creation.
     * @protected
     */
    _computeWoundsMax(): void {
        const actor = this.parent;
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
