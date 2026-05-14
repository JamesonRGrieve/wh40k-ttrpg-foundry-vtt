import type { WH40KItem } from '../../documents/item.ts';
import CreatureTemplate from './templates/creature.ts';

/** Minimal shape of an actor parent that character data methods depend on. */
interface ActorParent {
    items: {
        filter: (fn: (item: WH40KItem) => boolean) => WH40KItem[];
        get: (id: string) => WH40KItem | undefined;
        [Symbol.iterator](): Iterator<WH40KItem>;
    };
}

/** Option in a grant choice. */
interface GrantChoiceOption {
    value?: string;
    name?: string;
}

/** A single choice entry in a grant. */
interface GrantChoice {
    label?: string;
    name?: string;
    type?: string;
    options?: GrantChoiceOption[];
}

/** Shape of origin-path grants data object. */
interface OriginPathGrants {
    aptitudes?: string[];
    choices?: GrantChoice[];
    woundsFormula?: string;
}

/** Shape of a stored roll result. */
interface RollResult {
    rolled?: number;
    breakdown?: string;
}

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
    declare gameSystem: 'rt' | 'dh1e' | 'dh2e' | 'bc' | 'ow' | 'dw' | 'im';
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: originPath is a dynamic map keyed by step names (homeWorld, career, etc.) storing WH40KItem references; no fixed schema
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
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            rank: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
            mutations: new fields.StringField({ required: false, blank: true }),

            // ===== GAME SYSTEM =====
            gameSystem: new fields.StringField({
                required: true,
                initial: 'rt',
                choices: ['rt', 'dh1e', 'dh2e', 'bc', 'ow', 'dw', 'im'],
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
            // Influence is a 0-100 characteristic per DH2 RAW (DH2e core p. 28). In Homebrew
            // mode it presents as an economy resource, but the cap still applies — Influence
            // never exceeds a percentile characteristic ceiling.
            influence: new fields.NumberField({ required: true, initial: 0, min: 0, max: 100, integer: true }),
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: _migrateData is a Foundry framework override; parameter type is dictated by SystemDataModel base class
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        // Handle old characteristic field names or other character-specific migrations
    }

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _cleanData is a Foundry framework override; parameter types are dictated by SystemDataModel base class
    static override _cleanData(source: Record<string, unknown> | undefined, options: Record<string, unknown> = {}): void {
        super._cleanData(source, options);
        CharacterData.#cleanExperience(source);
        CharacterData.#cleanMentalState(source);
        CharacterData.#cleanRogueTrader(source);
    }

    /**
     * Clean experience fields.
     * @param {Record<string, unknown>} source - The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: source is raw Foundry DataModel source object; Record<string,unknown> is the only safe type at this migration boundary
    static #cleanExperience(source: Record<string, unknown> | undefined): void {
        if (typeof source?.['experience'] !== 'object' || source['experience'] === null) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: experience sub-object is untyped source data; cast required to mutate numeric fields
        const experience = source['experience'] as Record<string, unknown>;

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: source is raw Foundry DataModel source object; Record<string,unknown> is the only safe type at this migration boundary
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: source is raw Foundry DataModel source object; Record<string,unknown> is the only safe type at this migration boundary
    static #cleanRogueTrader(source: Record<string, unknown> | undefined): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: rogueTrader sub-object is untyped source data; cast required to mutate numeric fields
        const rt = source?.['rogueTrader'] as Record<string, unknown> | undefined;
        if (rt === undefined) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: profitFactor sub-object is untyped source data
        const pf = rt['profitFactor'] as Record<string, unknown> | undefined;
        if (pf !== undefined) {
            for (const field of ['current', 'starting', 'modifier']) {
                if (typeof pf[field] === 'string') pf[field] = Number(pf[field]);
            }
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: endeavour sub-object is untyped source data
        const endeavour = rt['endeavour'] as Record<string, unknown> | undefined;
        if (endeavour !== undefined) {
            for (const field of ['achievementCurrent', 'achievementRequired', 'reward']) {
                if (typeof endeavour[field] === 'string') endeavour[field] = Number(endeavour[field]);
            }
        }

        if (Array.isArray(rt['acquisitions'])) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: acquisitions array entries are untyped source data
            for (const acquisition of rt['acquisitions'] as Array<Record<string, unknown>>) {
                if (typeof acquisition['modifier'] === 'string') acquisition['modifier'] = Number(acquisition['modifier']);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
        this._prepareExperience();
    }

    /** @inheritDoc */
    override prepareEmbeddedData(): void {
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
    // eslint-disable-next-line complexity -- processes all 7 game systems' origin path steps in one pass; extraction requires API redesign tracked separately
    _computeOriginPathEffects(): void {
        const actor = this.parent as ActorParent | null | undefined;
        if (actor?.items === undefined) return;

        const originItems = actor.items.filter((item: WH40KItem) => item.isOriginPath);

        // Map step keys (camelCase from schema) to items — covers all game systems
        const stepMap: Record<string, WH40KItem | null> = {
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.flags is a Foundry opaque Record; 'rt' key is a legacy namespace
            const rtFlags = item.flags['rt'] as Record<string, unknown>;
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.step may be undefined on legacy items without a step field
            const step: string = item.system.step ?? (rtFlags['step'] as string | undefined) ?? '';
            if (Object.hasOwn(stepMap, step)) {
                stepMap[step] = item;
            }

            // Get human-readable step name for display
            const stepLabel = this._getStepLabel(step);
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is a dynamic Foundry ItemData; accessing legacy fields not in the typed schema
            const sysData = item.system as Record<string, unknown>;
            const sysEffects = typeof sysData['effects'] === 'string' ? sysData['effects'] : '';
            const sysDescText = typeof sysData['descriptionText'] === 'string' ? sysData['descriptionText'] : '';
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.description may be an object with .value (ProseMirror) or a string on legacy items
            const descValue = typeof item.system.description === 'object' ? (item.system.description as { value?: string }).value ?? '' : '';
            const benefit = sysEffects !== '' ? sysEffects : sysDescText !== '' ? sysDescText : descValue;
            this.backgroundEffects.abilities.push({
                source: stepLabel !== '' ? stepLabel : 'Origin Path',
                name: item.name,
                benefit,
            });
        }

        // Store origin path selections
        this.backgroundEffects.originPath = stepMap;

        // Update the originPath system data with the names (only if origin builder items exist)
        // RT steps
        if (stepMap['homeWorld'] != null) this.originPath.homeWorld = stepMap['homeWorld'].name;
        if (stepMap['birthright'] != null) this.originPath.birthright = stepMap['birthright'].name;
        if (stepMap['lureOfTheVoid'] != null) this.originPath.lureOfTheVoid = stepMap['lureOfTheVoid'].name;
        if (stepMap['trialsAndTravails'] != null) this.originPath.trialsAndTravails = stepMap['trialsAndTravails'].name;
        if (stepMap['motivation'] != null) this.originPath.motivation = stepMap['motivation'].name;
        if (stepMap['career'] != null) this.originPath.career = stepMap['career'].name;
        // DH2e steps
        if (stepMap['background'] != null) this.originPath.background = stepMap['background'].name;
        if (stepMap['role'] != null) this.originPath.role = stepMap['role'].name;
        if (stepMap['elite'] != null) this.originPath.elite = stepMap['elite'].name;
        if (stepMap['divination'] != null) this.originPath.divination = stepMap['divination'].name;
        // BC steps
        if (stepMap['race'] != null) this.originPath.race = stepMap['race'].name;
        if (stepMap['archetype'] != null) this.originPath.archetype = stepMap['archetype'].name;
        if (stepMap['pride'] != null) this.originPath.pride = stepMap['pride'].name;
        if (stepMap['disgrace'] != null) this.originPath.disgrace = stepMap['disgrace'].name;
        // OW / DW steps
        if (stepMap['regiment'] != null) this.originPath.regiment = stepMap['regiment'].name;
        if (stepMap['speciality'] != null) this.originPath.speciality = stepMap['speciality'].name;
        if (stepMap['chapter'] != null) this.originPath.chapter = stepMap['chapter'].name;

        // Collect aptitudes from origin path (DH2e/BC/OW use aptitudes for XP costs).
        // Sources: fixed grants.aptitudes + resolved grants.choices[type=aptitude].
        // Per DH2 Core p.79, characteristic-named aptitudes (Weapon Skill, etc.) are
        // NOT auto-granted — a character only has aptitudes granted by home world,
        // background, role, and elite advances.
        const allAptitudes = new Set<string>();

        for (const item of originItems) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.grants is not in the typed schema; accessing as OriginPathGrants via unknown
            const grants = item.system.grants as OriginPathGrants | undefined;
            if (grants === undefined) continue;

            // Fixed aptitudes
            if (Array.isArray(grants.aptitudes)) {
                for (const apt of grants.aptitudes) {
                    if (apt !== '') allAptitudes.add(apt);
                }
            }

            // Resolved aptitude choices — mirrors the key logic in origin-path-builder._prepareChoices
            const choices: GrantChoice[] = Array.isArray(grants.choices) ? grants.choices : [];
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.selectedChoices is a dynamic field not in the typed schema; keyed by choice label
            const selectedChoices = (item.system['selectedChoices'] ?? {}) as Record<string, string[]>;
            const labelCounts: Partial<Record<string, number>> = {};
            for (const choice of choices) {
                const baseLabel = choice.label ?? choice.name ?? '';
                labelCounts[baseLabel] = (labelCounts[baseLabel] ?? 0) + 1;
                const suffix = (labelCounts[baseLabel] ?? 0) > 1 ? ` (${labelCounts[baseLabel]})` : '';
                const choiceKey = `${baseLabel}${suffix}`;
                if (choice.type !== 'aptitude') continue;
                const picks = selectedChoices[choiceKey];
                if (!Array.isArray(picks)) continue;
                for (const pick of picks) {
                    const option = choice.options?.find((o: GrantChoiceOption) => o.value === pick || o.name === pick);
                    const value = option?.value ?? option?.name ?? pick;
                    if (value !== '') allAptitudes.add(value);
                }
            }
        }
        this.aptitudes = [...allAptitudes];

        // Derive gameSystem from origin path items if not already set
        if (originItems.length > 0 && this.gameSystem === 'rt') {
            const firstSystem = originItems[0]?.system?.['gameSystem'];
            if (typeof firstSystem === 'string' && firstSystem !== this.gameSystem) {
                this.gameSystem = firstSystem as CharacterData['gameSystem'];
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
        const labels: Record<string, string> = {
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
        const actor = this.parent as ActorParent | null | undefined;
        if (actor?.items === undefined) return;

        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;

        // eslint-disable-next-line no-restricted-syntax -- boundary: psy field is added by CreatureTemplate mixin at runtime; not in CharacterData's own declare list
        const psySelf = this as unknown as { psy?: { cost?: number } };
        this.experience.spentPsychicPowers = psySelf.psy?.cost ?? 0;

        for (const characteristic of Object.values(this.characteristics) as Array<{ cost: number | string }>) {
            this.experience.spentCharacteristics += parseInt(String(characteristic.cost), 10);
        }

        for (const skill of Object.values(this.skills) as Array<{ cost: number | string; entries?: Array<{ cost?: number | string }> }>) {
            if (Array.isArray(skill.entries)) {
                for (const speciality of skill.entries) {
                    this.experience.spentSkills += parseInt(String(speciality.cost ?? 0), 10);
                }
            } else {
                this.experience.spentSkills += parseInt(String(skill.cost), 10);
            }
        }

        for (const item of actor.items) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.cost may be undefined on items without an explicit cost field; default 0
            const itemCost = String(item.system.cost ?? '0');
            if (item.isTalent) {
                this.experience.spentTalents += parseInt(itemCost, 10);
            } else if (item.isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt(itemCost, 10);
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
        type ModifierSrc = { value?: number };
        interface ModifierSources {
            wounds?: ModifierSrc[];
            fate?: ModifierSrc[];
        }
        interface ExtendedData {
            modifierSources?: ModifierSources;
            _getOriginPathWoundsModifier?: () => number;
            _getOriginPathFateModifier?: () => number;
            totalWoundsModifier: number;
            totalFateModifier: number;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: modifierSources/_getOriginPath* are added by CreatureTemplate mixin at runtime; not in CharacterData's own declare list
        const extSelf = this as unknown as ExtendedData;
        const itemWounds = extSelf.modifierSources?.wounds?.reduce((total, src) => total + (src.value ?? 0), 0) ?? 0;
        const itemFate = extSelf.modifierSources?.fate?.reduce((total, src) => total + (src.value ?? 0), 0) ?? 0;

        extSelf.totalWoundsModifier = itemWounds + (extSelf._getOriginPathWoundsModifier?.() ?? 0);
        extSelf.totalFateModifier = itemFate + (extSelf._getOriginPathFateModifier?.() ?? 0);
    }

    /**
     * Compute wounds.max at runtime from origin path wound formulas.
     * For formulas containing TB (e.g. RT's "2xTB+1d5+1"), the TB component is
     * recalculated using current Toughness Bonus so wounds react to TB changes.
     * The die roll component uses the stored roll result from character creation.
     * @protected
     */
    _computeWoundsMax(): void {
        const actor = this.parent as ActorParent | null | undefined;
        if (actor?.items === undefined) return;

        const originItems = actor.items.filter((item: WH40KItem) => item.isOriginPath);
        const tb = this.characteristics.toughness.bonus;

        let computedMax = 0;
        let hasWoundFormula = false;

        for (const item of originItems) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is a dynamic Foundry ItemData; accessing rollResults/grants not in the typed schema
            const itemSys = item.system as Record<string, unknown>;
            const grants = itemSys['grants'] as OriginPathGrants | undefined;
            const formula: string | undefined = grants?.woundsFormula;
            const rollResults = itemSys['rollResults'] as Record<string, RollResult> | undefined;
            const rollResult: RollResult | undefined = rollResults?.['wounds'];
            if (formula === undefined || formula === '' || rollResult?.rolled === undefined) continue;

            hasWoundFormula = true;

            // Check if formula references TB (Toughness Bonus) — RT pattern
            const tbPattern = /(\d*)x?TB/i;
            const tbMatch = formula.match(tbPattern);

            if (tbMatch) {
                // Formula contains TB — recompute with current TB
                // Parse: "2xTB+1d5+1" → TB multiplier=2, remainder needs die result
                const tbMultiplier = parseInt(tbMatch.at(1) ?? '', 10) || 1;
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
                const breakdown = rollResult.breakdown ?? '';
                const dieMatch = breakdown.match(/\b(\d+)\s*\[.*?d/i);
                let dieValue = 0;
                const rolledValue = rollResult.rolled;
                if (dieMatch !== null) {
                    dieValue = parseInt(dieMatch.at(1) ?? '', 10) || 0;
                } else {
                    // Fallback: assume die portion = rolled - (flat bonus)
                    // This works for "N+1d5" style (no TB in formula, but we're in TB branch...)
                    // For TB formulas without breakdown, store the full value and accept
                    // it won't be perfectly separated. Use: rolled - flat as approximation.
                    dieValue = rolledValue - flatBonus;
                }

                computedMax += tbComponent + dieValue + flatBonus;
            } else {
                // No TB reference — flat formula (DH2e/BC/OW style: "9+1d5")
                // Use stored rolled value as-is
                computedMax += rollResult.rolled;
            }
        }

        // Only override wounds.max when origin path formulas yielded a usable total. If
        // computedMax is 0 (every contributing item had a missing rollResult or a degenerate
        // formula), fall back to the source value the user/sheet stored — otherwise a partial
        // origin-path migration would silently zero out a manually-entered max. See issue #8.
        if (hasWoundFormula && computedMax > 0) {
            // Add item/modifier bonuses
            const modifierBonus = this.totalWoundsModifier;
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: getRollData() return type is dictated by the Foundry DataModel base class; cannot be narrowed without breaking the override contract
    override getRollData(): Record<string, unknown> {
        return super.getRollData();
    }
}
