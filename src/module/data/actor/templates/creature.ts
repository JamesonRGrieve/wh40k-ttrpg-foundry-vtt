import { BaseSystemConfig } from '../../../config/game-systems/base-system-config.ts';
import { SystemConfigRegistry } from '../../../config/game-systems/index.ts';
import type { FatigueModelDef } from '../../../config/game-systems/types.ts';
import type { WH40KItem } from '../../../documents/item.ts';
import { SkillKeyHelper } from '../../../helpers/skill-key-helper.ts';
import { FATIGUE_MODES, getFatigueHalvedCharacteristic, getFatigueTestModifier, getFatigueThreshold, resolveFatigueModel } from '../../../rules/fatigue.ts';
import { computeArmour } from '../../../utils/armour-calculator.ts';
import { computeEncumbrance } from '../../../utils/encumbrance-calculator.ts';
import { WH40KSettings } from '../../../wh40k-rpg-settings.ts';
import { coerceInt } from '../../fields/coerce.ts';
import { applyCharacteristicRollData, applyEffectiveCharacteristicFields, computeCharacteristicTotals } from '../../shared/characteristic-math.ts';
import { CHARACTERISTIC_SHORT_TO_FULL } from '../../shared/characteristics.ts';
import { clampSize, coerceIntFields, sizeNameToInt } from '../../shared/field-coercion.ts';
import { computeMovement, sumMovementModifiers } from '../../shared/movement-math.ts';
import { asRawSource, type RawSource } from '../../shared/raw-source.ts';
import { SKILL_DEFINITIONS } from '../../shared/skill-definitions.ts';
import { computeSkillTarget } from '../../shared/skill-math.ts';
import { characteristicField, initiativeField, movementField, sizeField, woundsField } from '../../shared/stat-fields.ts';
import CommonTemplate from './common.ts';

const { NumberField, SchemaField, StringField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;

/**
 * Creature template for actors that are living beings (Characters, NPCs).
 * Extends CommonTemplate with skills, fatigue, fate, psy, and item-based calculations.
 * @extends {CommonTemplate}
 */
/** Shape of a single characteristic (e.g. weaponSkill, agility). */
interface CharacteristicData {
    label: string;
    short: string;
    base: number;
    advance: number;
    modifier: number;
    unnatural: number;
    cost: number;
    /** Recoverable characteristic damage (subtracted from effective value/bonus during data prep). */
    damage: number;
    /** Effective (post-modifier) characteristic value = base + advances + all value modifiers. */
    total: number;
    /** Base bonus — the unnatural-adjusted tens digit of the effective value. */
    bonus: number;
    /**
     * Alias of {@link total}: the effective (post-modifier) characteristic value.
     * Outcome math reads this so fatigue / trait / drug modifiers apply implicitly (#415).
     */
    effectiveValue: number;
    /** Sum of bonus-only modifiers ("+X Bonus" effects), 0 unless an item adds one (#415). */
    bonusModifier: number;
    /** Effective bonus = base {@link bonus} + {@link bonusModifier}; consumed by damage / carry / movement (#415). */
    effectiveBonus: number;
    /** Set during _applyModifiersToCharacteristics */
    originPathModifier?: number;
    itemModifier?: number;
    totalModifier?: number;
}

/** Shape of a specialist skill entry within a skill group. */
interface SkillEntry {
    name: string;
    slug: string;
    characteristic: string;
    advanced: boolean;
    basic: boolean;
    advance: number;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    plus30: boolean;
    bonus: number;
    notes: string;
    cost: number;
    current: number;
    specialization?: string;
    /** Set during _prepareSkills */
    rank?: number;
    originRank?: number;
    itemModifier?: number;
}

/** Shape of a single skill field. */
interface SkillData {
    label: string;
    characteristic: string;
    advanced: boolean;
    basic: boolean;
    advance: number;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    plus30: boolean;
    bonus: number;
    notes: string;
    hidden: boolean;
    cost: number;
    current: number;
    entries?: SkillEntry[];
    /** Set during _prepareSkills */
    rank?: number;
    originRank?: number;
    itemModifier?: number;
}

/** Shape of a modifier source entry used in modifierSources tracking. */
interface ModifierSource {
    name: string;
    type: string;
    id: string | null;
    /** Live embedded UUID (Actor.<id>.Item.<id>) — points at the owned copy. */
    uuid?: string | null;
    /**
     * Compendium origin UUID (Compendium.<system>.<pack>.Item.<id>) when the
     * item was dragged from a pack. Standard practice per CLAUDE.md Direction
     * #11 — every actor-applied modifier must be source-traceable back to its
     * canonical compendium document so tooltips, audits, and migrations can
     * resolve the originating entry.
     */
    sourceUuid?: string | null;
    value: number;
    label?: string | undefined;
    specialization?: string | undefined;
}

/** Extract the compendium-source UUID from a Foundry document, or null. */
function compendiumSourceUuidOf(item: WH40KItem): string | null {
    // eslint-disable-next-line no-restricted-syntax -- boundary: _stats is Foundry-managed document metadata not in our schema
    const stats = (item as { _stats?: { compendiumSource?: string | null } })._stats;
    const src = stats?.compendiumSource;
    return typeof src === 'string' && src.length > 0 ? src : null;
}

/** Shape of an item's modifiers block (accessed via item.system.modifiers). */
interface ItemModifiersBlock {
    characteristics?: Record<string, number>;
    /**
     * Bonus-only characteristic modifiers ("+X Strength Bonus" effects, #415):
     * added to the effective BONUS, not the underlying characteristic value.
     */
    characteristicBonuses?: Record<string, number>;
    skills?: Record<string, number>;
    combat?: Record<string, number>;
    resources?: { wounds?: number; fate?: number };
    other?: Array<{ key?: string; value?: number; label?: string }>;
}

/** Shape of an active-modifier entry from origin path items. */
interface ActiveModEntry {
    type?: string;
    key?: string;
    value?: number;
    source?: string;
}

/** Shape of a skill grant entry from origin path items. */
interface SkillGrantEntry {
    name?: string;
    specialization?: string;
    level?: string;
}

/** Read-surface of an existing specialist row, used for case-insensitive dedup. */
interface ExistingSpecialistRow {
    name: string;
    specialization?: string;
}

/** An origin-path item's skill-grant block, reduced to what the synthesis reads. */
interface OriginGrantSource {
    grants: { skills?: SkillGrantEntry[] } | null;
}

/**
 * Synthesize derived specialist-skill entry rows from origin-path grants — the
 * pure core of {@link CreatureTemplate._ensureOriginSpecialistEntries}, exported
 * so it can be unit-tested without a live DataModel. Mutates `skill.entries` in
 * place: for every origin-granted specialization on `skillKey` not already
 * present (matched by name, case-insensitive), appends a row that the prepare
 * loop then ranks as trained from the grant. Existing rows win, so a player's
 * purchased advance is preserved and never duplicated. Derived only — nothing
 * persists; the origin grant remains the single source of truth (Direction #7).
 */
export function synthesizeOriginSpecialistEntries(
    grantSources: readonly OriginGrantSource[],
    skillKey: string,
    skill: { characteristic: string; advanced: boolean; basic: boolean; entries: ExistingSpecialistRow[] },
): void {
    if (!SkillKeyHelper.SPECIALIST_KEYS.has(skillKey)) return;

    const present = new Set<string>();
    for (const entry of skill.entries) {
        const label = (entry.name.length > 0 ? entry.name : entry.specialization ?? '').toLowerCase();
        if (label.length > 0) present.add(label);
    }

    for (const source of grantSources) {
        const grants = source.grants?.skills ?? [];
        for (const grant of grants) {
            if (SkillKeyHelper.nameToKey(grant.name ?? '') !== skillKey) continue;
            const specialization = (grant.specialization ?? '').trim();
            if (specialization.length === 0) continue;
            if (BaseSystemConfig.skillLevelToRank(grant.level ?? 'trained') <= 0) continue;
            if (present.has(specialization.toLowerCase())) continue;
            present.add(specialization.toLowerCase());

            const row: SkillEntry = {
                name: specialization,
                slug: '',
                characteristic: skill.characteristic,
                advanced: skill.advanced,
                basic: skill.basic,
                advance: 0,
                trained: false,
                plus10: false,
                plus20: false,
                plus30: false,
                bonus: 0,
                notes: '',
                cost: 0,
                current: 0,
                specialization,
            };
            skill.entries.push(row);
        }
    }
}

/** Minimal actor interface used when accessing parent.items. */
interface ActorWithItems {
    items?: { filter: (fn: (item: WH40KItem) => boolean) => WH40KItem[] };
}

export default class CreatureTemplate extends CommonTemplate {
    // Typed property declarations matching defineSchema()
    declare characteristics: {
        weaponSkill: CharacteristicData;
        ballisticSkill: CharacteristicData;
        strength: CharacteristicData;
        toughness: CharacteristicData;
        agility: CharacteristicData;
        intelligence: CharacteristicData;
        perception: CharacteristicData;
        willpower: CharacteristicData;
        fellowship: CharacteristicData;
        [key: string]: CharacteristicData;
    };
    declare size: number;
    /**
     * Hands available to wield weapons. Standard bipedal actors have two;
     * creatures with a non-standard anatomy (extra arms, tentacles, none)
     * set their own count. Drives the equipped-weapon hand budget (#418).
     */
    declare hands: number;
    declare wounds: {
        max: number;
        value: number;
        critical: number;
    };
    declare fatigue: {
        max: number;
        value: number;
        /** Derived (#114): the flat/condition-model test modifier for the current
         *  fatigue level, computed each prep so the roll dialog reads it without
         *  resolving the game-system config itself. 0 for the halving model (its
         *  effect is in the effective characteristic values) and when unfatigued. */
        testModifier: number;
    };
    declare fate: {
        max: number;
        value: number;
        /**
         * Burn-fate threshold (core.md §"Fate Threshold"). When a character is
         * reduced to 0 wounds, burning a Fate Point keeps them alive at the
         * `threshold` value; below 0 wounds it is consulted to determine the
         * cheat-death cost. Origin-path grants populate this via the
         * `fateThreshold` field on the `origin-path` item.
         */
        threshold: number;
    };
    /**
     * Shock counter (core.md §"Shock And Snapping Out Of It", p. 287).
     * Accumulates from Fear failures / mental trauma; drives the Snap-Out
     * recovery test. Capped at WP-bonus + Toughness-bonus per RAW.
     */
    declare shock: { value: number; max: number };

    /**
     * Possession track (beyond.md p. 69). Latent / Possessed states
     * gate session-limited Unleash Daemon uses.
     */
    declare possession: {
        state: 'none' | 'latent' | 'possessed';
        /** Unleash-Daemon uses spent this session. */
        unleashUsed: number;
        /** Cap per session — typically 1 plus Push-tier bonuses. */
        unleashMax: number;
    };
    declare initiative: {
        characteristic: string;
        base: string;
        bonus: number;
        /** Set during _applyModifiersToCharacteristics */
        itemModifier?: number;
    };
    declare movement: {
        half: number;
        full: number;
        charge: number;
        run: number;
        leapVertical: number;
        leapHorizontal: number;
        jump: number;
    };
    declare lifting: {
        lift: number;
        carry: number;
        push: number;
    };
    declare psy: {
        rating: number;
        sustained: number;
        defaultPR: number;
        class: 'unbound' | 'bound' | 'ascended';
        cost: number;
        hasFocus: boolean;
        currentRating: number;
    };
    declare skills: {
        acrobatics: SkillData;
        awareness: SkillData;
        barter: SkillData;
        blather: SkillData;
        carouse: SkillData;
        charm: SkillData;
        chemUse: SkillData;
        climb: SkillData;
        command: SkillData;
        commerce: SkillData;
        concealment: SkillData;
        contortionist: SkillData;
        deceive: SkillData;
        demolition: SkillData;
        disguise: SkillData;
        dodge: SkillData;
        evaluate: SkillData;
        gamble: SkillData;
        inquiry: SkillData;
        interrogation: SkillData;
        intimidate: SkillData;
        invocation: SkillData;
        literacy: SkillData;
        logic: SkillData;
        medicae: SkillData;
        psyniscience: SkillData;
        scrutiny: SkillData;
        search: SkillData;
        security: SkillData;
        shadowing: SkillData;
        silentMove: SkillData;
        sleightOfHand: SkillData;
        survival: SkillData;
        swim: SkillData;
        tracking: SkillData;
        wrangling: SkillData;
        athletics: SkillData;
        linguistics: SkillData;
        navigate: SkillData;
        operate: SkillData;
        parry: SkillData;
        stealth: SkillData;
        ciphers: SkillData;
        commonLore: SkillData;
        drive: SkillData;
        forbiddenLore: SkillData;
        navigation: SkillData;
        performer: SkillData;
        pilot: SkillData;
        scholasticLore: SkillData;
        secretTongue: SkillData;
        speakLanguage: SkillData;
        techUse: SkillData;
        trade: SkillData;
        [key: string]: SkillData;
    };
    declare armour: {
        head: number;
        leftArm: number;
        rightArm: number;
        body: number;
        leftLeg: number;
        rightLeg: number;
    };
    declare encumbrance: {
        max: number;
        value: number;
        encumbered: boolean;
    };
    declare modifierSources: {
        characteristics: Partial<Record<string, ModifierSource[]>>;
        /** Bonus-only characteristic modifiers ("+X Bonus" effects, #415). */
        characteristicBonuses: Partial<Record<string, ModifierSource[]>>;
        skills: Partial<Record<string, ModifierSource[]>>;
        combat: {
            toHit: ModifierSource[];
            damage: ModifierSource[];
            initiative: ModifierSource[];
            defence: ModifierSource[];
            [key: string]: ModifierSource[];
        };
        wounds: ModifierSource[];
        fate: ModifierSource[];
        movement: ModifierSource[];
    };
    declare favoriteCombatActions: string[];

    /** Computed during _applyModifiersToCharacteristics */
    declare combatModifiers: {
        attack: number;
        damage: number;
        penetration: number;
        defense: number;
        initiative: number;
        speed: number;
    };

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
    static SkillField(label: string, charShort: string, advanced = false, hasEntries = false): foundry.data.fields.DataField.Any {
        const schema: Record<string, foundry.data.fields.DataField.Any> = {
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
            schema['entries'] = new ArrayField(
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

    static CharacteristicField = (label: string, short: string): foundry.data.fields.DataField.Any =>
        characteristicField(label, short, { base: 0, total: 0, bonus: 0, advancement: true });

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
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

            size: sizeField({ nullable: false }),

            // Hands available to wield weapons (#418). Two for a standard biped;
            // non-standard anatomies override. Drives the equipped-weapon budget.
            hands: new NumberField({ required: true, initial: 2, min: 0, integer: true }),

            wounds: woundsField({ max: 0, value: 0, critical: 0, nullable: false }),

            fatigue: new SchemaField({
                max: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                value: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                // Derived each prep (#114); non-negative min omitted as it is a penalty.
                testModifier: new NumberField({ required: true, initial: 0, integer: true }),
            }),

            fate: new SchemaField({
                max: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                value: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                threshold: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            shock: new SchemaField({
                value: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                max: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            possession: new SchemaField({
                state: new StringField({ required: true, initial: 'none', choices: ['none', 'latent', 'possessed'] }),
                unleashUsed: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
                unleashMax: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            initiative: initiativeField({ nullable: false }),

            movement: movementField({ half: 0, full: 0, charge: 0, run: 0, withLeap: true }),

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
            // Built from the single-sourced SKILL_DEFINITIONS catalog (#273) — the
            // skill→characteristic association is authored once in data/shared and
            // shared with NPCData's fallback map. Insertion order in the catalog
            // matches this schema, so the generated SchemaField is byte-identical.
            skills: new SchemaField(
                Object.fromEntries(Object.entries(SKILL_DEFINITIONS).map(([key, d]) => [key, this.SkillField(d.label, d.char, d.advanced, d.hasEntries)])),
            ),

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
                characteristicBonuses: new ObjectField({ required: true, initial: {} }),
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
    static override _migrateData(source: RawSource): void {
        super._migrateData(source);
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
    static #migrateSkillsToAdvance(source: RawSource): void {
        const skills = asRawSource(source['skills']);
        if (!skills) return;
        for (const value of Object.values(skills)) {
            const skill = asRawSource(value);
            if (!skill) continue;
            // If advance field already exists, skip this skill
            if (skill['advance'] !== undefined) continue;

            // Initialize advance to 0 — training will be recomputed from origin path items
            skill['advance'] = 0;
            // Reset boolean flags — these are now derived in _prepareSkills()
            skill['trained'] = false;
            skill['plus10'] = false;
            skill['plus20'] = false;
            skill['plus30'] = false;

            // Also migrate specialist entries
            if (Array.isArray(skill['entries'])) {
                for (const entryValue of skill['entries']) {
                    const entry = asRawSource(entryValue);
                    if (!entry) continue;
                    if (entry['advance'] !== undefined) continue;
                    entry['advance'] = 0;
                    entry['trained'] = false;
                    entry['plus10'] = false;
                    entry['plus20'] = false;
                    entry['plus30'] = false;
                }
            }
        }
    }

    /**
     * Migrate size from string to integer.
     * @param {object} source - The source data
     */
    static #migrateSize(source: RawSource): void {
        if (typeof source['size'] === 'string') {
            source['size'] = sizeNameToInt(source['size']);
        }
        if (source['size'] !== undefined) {
            source['size'] = clampSize(this._toInt(source['size']));
        }
    }

    /**
     * Migrate wounds values to integers.
     * @param {object} source - The source data
     */
    static #migrateWounds(source: RawSource): void {
        const wounds = asRawSource(source['wounds']);
        if (!wounds) return;
        coerceIntFields(wounds, ['max', 'value', 'critical']);
    }

    /**
     * Migrate fatigue values to integers.
     * @param {object} source - The source data
     */
    static #migrateFatigue(source: RawSource): void {
        const fatigue = asRawSource(source['fatigue']);
        if (!fatigue) return;
        coerceIntFields(fatigue, ['max', 'value']);
    }

    /**
     * Migrate characteristic values to integers.
     * @param {object} source - The source data
     */
    static #migrateCharacteristics(source: RawSource): void {
        const characteristics = asRawSource(source['characteristics']);
        if (!characteristics) return;

        for (const value of Object.values(characteristics)) {
            const char = asRawSource(value);
            if (!char) continue;
            if (char['base'] !== undefined) char['base'] = this._toInt(char['base']);
            if (char['advance'] !== undefined) char['advance'] = this._toInt(char['advance']);
            if (char['modifier'] !== undefined) char['modifier'] = this._toInt(char['modifier']);
            if (char['unnatural'] !== undefined) char['unnatural'] = this._toInt(char['unnatural']);
            if (char['cost'] !== undefined) char['cost'] = this._toInt(char['cost']);
        }
    }

    /**
     * Migrate fate values to integers.
     * @param {object} source - The source data
     */
    static #migrateFate(source: RawSource): void {
        const fate = asRawSource(source['fate']);
        if (!fate) return;
        coerceIntFields(fate, ['max', 'value']);
    }

    /**
     * Migrate psy values to integers.
     * @param {object} source - The source data
     */
    static #migratePsy(source: RawSource): void {
        const psy = asRawSource(source['psy']);
        if (!psy) return;
        coerceIntFields(psy, ['rating', 'sustained', 'defaultPR']);
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override _cleanData(source: RawSource | undefined, options: RawSource = {}): void {
        super._cleanData(source, options);
        if (!source) return;
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
    static #cleanSize(source: RawSource | undefined): void {
        if (source?.['size'] !== undefined) {
            if (source['size'] === '' || source['size'] === null) {
                delete source['size']; // Use schema default
            } else if (typeof source['size'] === 'string') {
                source['size'] = sizeNameToInt(source['size']);
            } else {
                source['size'] = clampSize(this._toInt(source['size']));
            }
        }
    }

    /**
     * Clean wounds fields - convert to proper integers.
     * @param {object} source - The source data
     */
    static #cleanWounds(source: RawSource): void {
        const wounds = asRawSource(source['wounds']);
        if (!wounds) return;
        coerceIntFields(wounds, ['max', 'value', 'critical']);
    }

    /**
     * Clean fatigue fields.
     * @param {object} source - The source data
     */
    static #cleanFatigue(source: RawSource): void {
        const fatigue = asRawSource(source['fatigue']);
        if (!fatigue) return;
        coerceIntFields(fatigue, ['max', 'value']);
    }

    /**
     * Clean fate fields.
     * @param {object} source - The source data
     */
    static #cleanFate(source: RawSource): void {
        const fate = asRawSource(source['fate']);
        if (!fate) return;
        coerceIntFields(fate, ['max', 'value']);
    }

    /**
     * Clean psy fields.
     * @param {object} source - The source data
     */
    static #cleanPsy(source: RawSource): void {
        const psy = asRawSource(source['psy']);
        if (!psy) return;
        coerceIntFields(psy, ['rating', 'sustained', 'defaultPR']);
    }

    /** Map characteristic short names to full keys (shared superset, includes Influence). */
    static CHARACTERISTIC_MAP: Record<string, string> = CHARACTERISTIC_SHORT_TO_FULL;

    /**
     * Get a characteristic by its short name or full key.
     * @param {string} key - Short name (e.g., "Ag") or full key (e.g., "agility")
     * @returns {object|null}
     */
    getCharacteristic(key: string): CharacteristicData | null {
        const direct = this.characteristics[key];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: index signature access may be undefined at runtime
        if (direct !== undefined) {
            return direct;
        }
        const fullKey = CreatureTemplate.CHARACTERISTIC_MAP[key];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: Record index access may be undefined at runtime
        if (fullKey === undefined) {
            return null;
        }
        return this.characteristics[fullKey] ?? null;
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override prepareBaseData(): void {
        super.prepareBaseData();
        this._initializeModifierTracking();
    }

    /** @inheritDoc */
    override prepareDerivedData(): void {
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
    override prepareEmbeddedData(): void {
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
    _initializeModifierTracking(): void {
        this.modifierSources = {
            characteristics: {},
            characteristicBonuses: {},
            skills: {},
            combat: {
                toHit: [], // Matches schema: modifiers.combat.attack / toHit
                damage: [], // Matches schema: modifiers.combat.damage
                penetration: [], // Matches schema: modifiers.combat.penetration
                defence: [], // Matches schema: modifiers.combat.defense / defence
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: accepts raw untyped migration source values; delegates to the coerceInt coercion entry point
    static _toInt(value: unknown, fallback = 0): number {
        return coerceInt(value, fallback);
    }

    /**
     * All embedded items, as an array of documents. ALWAYS read owned items
     * through this (or a helper built on it) — never `for…of this.parent.items`
     * directly. A Foundry `Collection`'s default iterator yields `[id, doc]`
     * entries, so a bare `for…of` hands back tuples whose `.isTalent` / `.system`
     * are `undefined`; that footgun silently dropped owned talents/powers from
     * XP math for a long time. `.filter` reliably yields the documents.
     * Returns `[]` when the parent or its items are unavailable (compendium /
     * pre-embed contexts).
     */
    protected _ownedItems(): WH40KItem[] {
        const actor = this.parent as { items?: { filter: (fn: (item: WH40KItem) => boolean) => WH40KItem[] } } | null | undefined;
        return actor?.items?.filter(() => true) ?? [];
    }

    /**
     * The actor's origin-path items (homeworld / background / role / …).
     * Centralizes the `this.parent.items.filter(i => i.isOriginPath)` idiom
     * repeated across the PC preparation methods. Returns `[]` when the parent
     * or its items are unavailable (compendium / pre-embed contexts).
     */
    protected _originPathItems(): WH40KItem[] {
        return this._ownedItems().filter((item) => item.isOriginPath);
    }

    /**
     * Prepare characteristic totals and bonuses.
     * Formula: total = base + (advance * 5) + modifier - damage (the effective value).
     * Bonus = floor(total / 10), modified by unnatural multiplier (the base bonus).
     * The base-vs-effective split (#415) is finalised in _applyModifiersToCharacteristics
     * once item modifiers are known; this pre-item pass seeds the effective fields so
     * they are always populated. Fatigue is a flat per-Test penalty (applied in the roll
     * path), not a characteristic modifier, so it does NOT reduce these values.
     * @protected
     */
    _prepareCharacteristics(): void {
        for (const [, char] of Object.entries(this.characteristics)) {
            // total = base + (advance * 5) + modifier - damage; bonus = unnatural-adjusted tens digit.
            const { total, bonus } = computeCharacteristicTotals(char.base, char.modifier, char.unnatural || 0, char.advance * 5 - char.damage);
            char.total = total;
            char.bonus = bonus;
            // Seed the effective fields (no item bonus-only modifiers known yet).
            applyEffectiveCharacteristicFields(char);
        }

        // Update initiative bonus from characteristic
        const initChar = this.characteristics[this.initiative.characteristic];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: dynamic key access on characteristics may return undefined at runtime
        if (initChar !== undefined) {
            this.initiative.bonus = initChar.bonus;
        }
    }

    /**
     * Prepare skill totals. Effective rank is computed at runtime:
     *   effectiveRank = min(originPathRank + advance, maxRank)
     * Boolean flags (trained/plus10/plus20/plus30) are derived for template compat.
     * @protected
     */
    _prepareSkills(): void {
        // Determine visible skills for this actor's game system
        const gameSystem = (this as { gameSystem?: string }).gameSystem;
        const systemConfig = gameSystem !== undefined ? SystemConfigRegistry.getOrNull(gameSystem) : null;
        const visibleSkills = systemConfig?.getVisibleSkills() ?? null;

        for (const [key, skill] of Object.entries(this.skills)) {
            // Set visibility based on game system
            if (visibleSkills) {
                skill.hidden = !visibleSkills.has(key);
            }

            const char = this.getCharacteristic(skill.characteristic);
            const charTotal = char?.total ?? 0;

            // Compute effective rank from origin path grants + XP advances
            const originRank = this._getOriginPathSkillRank(key);
            const effectiveRank = Math.min(originRank + (skill.advance || 0), 4);

            // Rank flags + target: full characteristic once trained, flat -20 in
            // DH2e / half characteristic for career systems when untrained, plus the
            // rank>=4?30:rank>=3?20:rank>=2?10:0 training ladder and skill.bonus (#423).
            const skillTarget = computeSkillTarget(charTotal, effectiveRank, skill.bonus || 0, systemConfig?.usesAptitudes === true);

            // Store rank data for display and advancement dialog
            skill.rank = skillTarget.rank;
            skill.originRank = originRank;

            // Derive boolean flags from effective rank (template backward compat)
            skill.trained = skillTarget.trained;
            skill.plus10 = skillTarget.plus10;
            skill.plus20 = skillTarget.plus20;
            skill.plus30 = skillTarget.plus30;

            skill.current = skillTarget.current;

            // Process specialist entries
            if (Array.isArray(skill.entries)) {
                // Synthesize derived rows for origin-path-granted specializations not
                // already present, so a granted Common Lore (X) / Forbidden Lore (X) /
                // Navigate (X) renders as trained from the grant alone — the loop below
                // only ranks rows that exist, so without this the grant is invisible.
                this._ensureOriginSpecialistEntries(key, skill);

                for (const entry of skill.entries) {
                    const entryCharKey = entry.characteristic || skill.characteristic;
                    const entryChar = this.getCharacteristic(entryCharKey);
                    const entryCharTotal = entryChar?.total ?? 0;

                    const entryOriginRank = this._getOriginPathSkillRank(key, entry.name || entry.specialization);
                    const entryEffectiveRank = Math.min(entryOriginRank + (entry.advance || 0), 4);

                    const entryTarget = computeSkillTarget(entryCharTotal, entryEffectiveRank, entry.bonus || 0, systemConfig?.usesAptitudes === true);

                    entry.rank = entryTarget.rank;
                    entry.originRank = entryOriginRank;
                    entry.trained = entryTarget.trained;
                    entry.plus10 = entryTarget.plus10;
                    entry.plus20 = entryTarget.plus20;
                    entry.plus30 = entryTarget.plus30;
                    entry.current = entryTarget.current;
                }
            }
        }
    }

    /**
     * Prepare psy rating.
     * @protected
     */
    _preparePsy(): void {
        this.psy.currentRating = this.psy.rating - this.psy.sustained;
    }

    /**
     * Resolve the active fatigue rule set for this actor (#114): the game line's
     * RAW model (halving / flat / condition) unless the world "fatigue mode"
     * setting forces one. Falls back to the flat model when the system is unknown.
     * @protected
     */
    _resolveFatigueModel(): FatigueModelDef {
        const gameSystem = (this as { gameSystem?: string }).gameSystem;
        const config = gameSystem !== undefined ? SystemConfigRegistry.getOrNull(gameSystem) : null;
        return resolveFatigueModel(config?.getFatigueModel() ?? FATIGUE_MODES.flat, WH40KSettings.getFatigueMode());
    }

    /**
     * Prepare the fatigue threshold (#114). Per the active model this is the
     * Toughness bonus (flat model), Toughness + Willpower bonus (halving model),
     * or 0 (IM condition model, which has no numeric threshold). Only derived when
     * `fatigue.max` is unset (0); a non-zero stored value is a deliberate override
     * (talents, homebrew) and is preserved so the field stays editable on the sheet.
     * @protected
     */
    _prepareFatigue(): void {
        const def = this._resolveFatigueModel();
        if (this.fatigue.max <= 0) {
            this.fatigue.max = getFatigueThreshold(
                {
                    toughnessBonus: this.characteristics.toughness.effectiveBonus,
                    willpowerBonus: this.characteristics.willpower.effectiveBonus,
                },
                def,
            );
        }
        // Derived flat/condition test modifier the roll dialog reads (#114); 0 for
        // the halving model (its effect lives in the effective characteristic values).
        this.fatigue.testModifier = getFatigueTestModifier(this.fatigue.value, def);
    }

    /**
     * Compute modifiers from ALL item types - talents, traits, conditions, equipment.
     * NOTE: Origin paths are excluded - they use _getOriginPathCharacteristicModifier() instead.
     * @protected
     */
    _computeItemModifiers(): void {
        const actor = this.parent as { items?: { filter: (fn: (item: WH40KItem) => boolean) => WH40KItem[] } } | null | undefined;
        if (actor?.items === undefined) return;

        const modifierItems = actor.items.filter(
            (item: WH40KItem) =>
                // Exclude origin paths - they're handled separately via _getOriginPathCharacteristicModifier
                !item.isOriginPath &&
                (item.isTalent ||
                    item.isTrait ||
                    item.isCondition ||
                    (item.type === 'armour' && item.system.state.equipped === true) ||
                    (item.type === 'cybernetic' && item.system.state.equipped === true) ||
                    (item.type === 'gear' && item.system.state.equipped === true)),
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
    _applyItemModifiers(item: WH40KItem): void {
        const mods = item.system.modifiers as ItemModifiersBlock | null | undefined;
        if (mods === undefined || mods === null) return;

        const source = {
            name: item.name,
            type: item.type,
            id: item.id,
            uuid: item.uuid,
            sourceUuid: compendiumSourceUuidOf(item),
        };

        // Characteristic modifiers
        if (mods.characteristics !== undefined) {
            for (const [charKey, value] of Object.entries(mods.characteristics)) {
                if (typeof value === 'number') {
                    const list = this.modifierSources.characteristics[charKey] ?? [];
                    list.push({ ...source, value });
                    this.modifierSources.characteristics[charKey] = list;
                }
            }
        }

        // Bonus-only characteristic modifiers ("+X Strength Bonus", #415): raise
        // the effective BONUS without changing the underlying characteristic value.
        if (mods.characteristicBonuses !== undefined) {
            for (const [charKey, value] of Object.entries(mods.characteristicBonuses)) {
                if (typeof value === 'number') {
                    const list = this.modifierSources.characteristicBonuses[charKey] ?? [];
                    list.push({ ...source, value });
                    this.modifierSources.characteristicBonuses[charKey] = list;
                }
            }
        }

        // Skill modifiers
        if (mods.skills !== undefined) {
            for (const [skillKey, value] of Object.entries(mods.skills)) {
                if (typeof value === 'number') {
                    const list = this.modifierSources.skills[skillKey] ?? [];
                    list.push({ ...source, value });
                    this.modifierSources.skills[skillKey] = list;
                }
            }
        }

        // Combat modifiers
        if (mods.combat !== undefined) {
            const combatSources = this.modifierSources.combat;
            for (const [combatKey, value] of Object.entries(mods.combat)) {
                if (typeof value !== 'number') continue;
                const list = combatSources[combatKey];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: index signature access on combatSources may return undefined at runtime
                if (list === undefined) continue;
                list.push({ ...source, value });
            }
        }

        // Resources modifiers (wounds, fate, insanity, corruption)
        if (mods.resources !== undefined) {
            if (typeof mods.resources.wounds === 'number') {
                this.modifierSources.wounds.push({ ...source, value: mods.resources.wounds });
            }
            if (typeof mods.resources.fate === 'number') {
                this.modifierSources.fate.push({ ...source, value: mods.resources.fate });
            }
            // Note: insanity and corruption modifiers are defined in schema but not yet implemented
        }

        // Movement modifier (from other modifiers array)
        if (Array.isArray(mods.other)) {
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
    _applyModifiersToCharacteristics(): void {
        // Collect origin path modifier sources for tooltip transparency
        this._registerOriginPathModifierSources();

        // Fatigue halving (#114): under the halving model (DH1/DH2) a fatigued
        // characteristic (natural bonus < fatigue level) counts as half its value.
        // Resolve the active model + level once; 0 disables halving for the flat /
        // condition models (their effect is a roll-time modifier, not a stat change).
        const fatigueDef = this._resolveFatigueModel();
        const fatigueLevel = fatigueDef.model === 'halving' ? Math.max(0, Math.trunc(this.fatigue.value)) : 0;

        for (const [name, char] of Object.entries(this.characteristics)) {
            const originPathMod = this._getOriginPathCharacteristicModifier(name);
            const itemMod = this._getTotalCharacteristicModifier(name);
            const totalMod = originPathMod + itemMod;

            // Always store modifier values (even if 0)
            char.originPathModifier = originPathMod;
            char.itemModifier = itemMod;
            char.totalModifier = totalMod;

            // Recalculate total from BASE values to avoid accumulation, routing
            // through the shared SSOT so the unnatural/bonus rule stays identical to
            // the pre-item `_prepareCharacteristics` pass. The `extra` term folds in
            // `advance*5 - damage` (core.md §"Characteristic Damage") plus the item /
            // origin-path modifier; `clampTotalToZero` floors the total at 0.
            const { total, bonus } = computeCharacteristicTotals(
                char.base,
                char.modifier,
                char.unnatural || 0,
                char.advance * 5 - char.damage + totalMod,
                true,
            );
            char.total = total;
            char.bonus = bonus;

            // Finalise the base-vs-effective split (#415): effectiveValue mirrors the
            // post-modifier total; effectiveBonus adds the bonus-only modifier channel
            // ("+X Bonus" effects) on top of the base bonus.
            const bonusModifier = this._getTotalCharacteristicBonusModifier(name);
            applyEffectiveCharacteristicFields(char, bonusModifier);

            // Halve the effective value/bonus of a fatigued characteristic (#114),
            // after the base-vs-effective split so damage / carry / movement — which
            // read the effective fields — degrade with it. Non-halving models skip
            // this (fatigueLevel is 0) and apply their penalty at roll time instead.
            if (fatigueLevel > 0) {
                const halved = getFatigueHalvedCharacteristic(char.effectiveValue, char.bonus, char.unnatural || 0, bonusModifier, fatigueLevel);
                if (halved) {
                    char.effectiveValue = halved.effectiveValue;
                    char.effectiveBonus = halved.effectiveBonus;
                }
            }
        }

        // Update initiative bonus from characteristic (recalculate from base). Read the
        // effective bonus so a bonus-only modifier on the initiative characteristic flows in.
        const initChar = this.characteristics[this.initiative.characteristic];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: dynamic key access on characteristics may return undefined at runtime
        const baseInitBonus = initChar?.effectiveBonus ?? 0;

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
    _applyModifiersToSkills(): void {
        // Recalculate skills from updated characteristic totals (which now include item modifiers)
        this._prepareSkills();

        for (const [skillKey, skill] of Object.entries(this.skills)) {
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
    _computeArmour(): void {
        const actor = this.parent as Parameters<typeof computeArmour>[0] | null | undefined;
        if (actor === null || actor === undefined) return;
        Object.assign(this.armour, computeArmour(actor));
    }

    /**
     * Compute encumbrance from carried items.
     * @protected
     */
    _computeEncumbrance(): void {
        const actor = this.parent as Parameters<typeof computeEncumbrance>[0] | null | undefined;
        if (actor === null || actor === undefined) return;
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
    _getTotalCharacteristicModifier(charKey: string): number {
        const sources = this.modifierSources.characteristics[charKey] ?? [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Total bonus-only characteristic modifier from all item sources (#415) — the
     * sum of "+X Bonus" effects that raise the effective BONUS without changing the
     * characteristic value.
     * @param {string} charKey - The characteristic key
     * @returns {number}
     */
    _getTotalCharacteristicBonusModifier(charKey: string): number {
        const sources = this.modifierSources.characteristicBonuses[charKey] ?? [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get total skill modifier from all item sources.
     * @param {string} skillKey - The skill key
     * @returns {number}
     */
    _getTotalSkillModifier(skillKey: string): number {
        const sources = this.modifierSources.skills[skillKey] ?? [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get total combat modifier from all item sources.
     * @param {string} combatKey - The combat stat key
     * @returns {number}
     */
    _getTotalCombatModifier(combatKey: string): number {
        const sources = this.modifierSources.combat[combatKey] ?? [];
        return sources.reduce((total, src) => total + (src.value || 0), 0);
    }

    /**
     * Get total wounds modifier from origin path items.
     * @returns {number}
     */
    _getOriginPathWoundsModifier(): number {
        const actor = this.parent as { items?: { filter: (fn: (item: WH40KItem) => boolean) => WH40KItem[] } } | null | undefined;
        if (actor?.items === undefined) return 0;
        let total = 0;
        const originItems = this._originPathItems();
        for (const item of originItems) {
            const wounds = (item.system.modifiers as { wounds?: number } | null | undefined)?.wounds;
            if (typeof wounds === 'number') {
                total += wounds;
            }
        }
        return total;
    }

    /**
     * Get total fate modifier from origin path items.
     * @returns {number}
     */
    _getOriginPathFateModifier(): number {
        const actor = this.parent as { items?: { filter: (fn: (item: WH40KItem) => boolean) => WH40KItem[] } } | null | undefined;
        if (actor?.items === undefined) return 0;
        let total = 0;
        const originItems = this._originPathItems();
        for (const item of originItems) {
            const fate = (item.system.modifiers as { fate?: number } | null | undefined)?.fate;
            if (typeof fate === 'number') {
                total += fate;
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
    _getOriginPathCharacteristicModifier(_charKey: string): number {
        // Origin-path characteristic bonuses are baked directly into
        // `system.characteristics.*.base` by the Origin Path Builder on commit
        // (see _collectOriginCharacteristicBonuses). Adding them again at runtime
        // would double-count, so this always returns 0. Kept as a hook so
        // tooltip/source-registration code paths stay valid.
        return 0;
    }

    /**
     * Register origin path modifier sources into modifierSources.characteristics
     * so that tooltips and stat breakdowns can display where bonuses come from.
     * @protected
     */
    _registerOriginPathModifierSources(): void {
        const actor = this.parent as ActorWithItems | null | undefined;
        if (actor?.items === undefined) return;

        const originItems = this._originPathItems();
        for (const item of originItems) {
            const source = { name: item.name, type: 'originPath', id: item.id, uuid: item.uuid, sourceUuid: compendiumSourceUuidOf(item) };

            // Base modifiers from ModifiersTemplate
            const modBlock = item.system.modifiers as ItemModifiersBlock | null | undefined;
            const mods = modBlock?.characteristics;
            if (mods !== undefined) {
                for (const [charKey, value] of Object.entries(mods)) {
                    if (typeof value === 'number') {
                        const list = this.modifierSources.characteristics[charKey] ?? [];
                        list.push({ ...source, value });
                        this.modifierSources.characteristics[charKey] = list;
                    }
                }
            }

            // Choice-based modifiers from activeModifiers
            const activeMods = item.system['activeModifiers'] as ActiveModEntry[] | null | undefined;
            if (Array.isArray(activeMods)) {
                for (const mod of activeMods) {
                    if (mod.type === 'characteristic' && typeof mod.key === 'string' && typeof mod.value === 'number') {
                        const list = this.modifierSources.characteristics[mod.key] ?? [];
                        this.modifierSources.characteristics[mod.key] = list;
                        list.push({
                            name: `${item.name} (${mod.source ?? ''})`,
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
        const actor = this.parent as ActorWithItems | null | undefined;
        if (actor?.items === undefined) return 0;

        let maxRank = 0;
        const originItems = this._originPathItems();
        const isSpecialist = SkillKeyHelper.SPECIALIST_KEYS.has(skillKey);

        if (originItems.length === 0) return 0;

        for (const item of originItems) {
            // Check base skill grants
            const grants = (item.system.grants as { skills?: SkillGrantEntry[] } | null | undefined)?.skills ?? [];
            for (const grant of grants) {
                const grantKey = SkillKeyHelper.nameToKey(grant.name ?? '');

                if (grantKey !== skillKey) continue;

                // For specialist skills, also match specialization
                if (isSpecialist && specialization !== undefined && specialization.length > 0) {
                    const grantSpec = (grant.specialization ?? '').toLowerCase();
                    if (grantSpec.length > 0 && grantSpec !== specialization.toLowerCase()) continue;
                }

                const rank = BaseSystemConfig.skillLevelToRank(grant.level ?? 'trained');
                maxRank = Math.max(maxRank, rank);
            }

            // Check choice-based skill grants from activeModifiers
            const activeMods = item.system['activeModifiers'] as ActiveModEntry[] | null | undefined;
            if (Array.isArray(activeMods)) {
                for (const mod of activeMods) {
                    if (mod.type !== 'skill') continue;
                    const modKey = SkillKeyHelper.nameToKey(mod.key ?? '');
                    if (modKey !== skillKey) continue;
                    maxRank = Math.max(maxRank, 1);
                }
            }
        }

        return maxRank;
    }

    /**
     * Register origin path skill sources into modifierSources.skills
     * for tooltip transparency.
     * @protected
     */
    _registerOriginPathSkillSources(): void {
        const actor = this.parent as ActorWithItems | null | undefined;
        if (actor?.items === undefined) return;

        const originItems = this._originPathItems();
        for (const item of originItems) {
            const grants = (item.system.grants as { skills?: SkillGrantEntry[] } | null | undefined)?.skills ?? [];
            for (const grant of grants) {
                const grantKey = SkillKeyHelper.nameToKey(grant.name ?? '');
                if (grantKey === '') continue;

                const rank = BaseSystemConfig.skillLevelToRank(grant.level ?? 'trained');
                if (rank > 0) {
                    const list = this.modifierSources.skills[grantKey] ?? [];
                    this.modifierSources.skills[grantKey] = list;
                    list.push({
                        name: item.name,
                        type: 'originPath',
                        id: item.id,
                        value: rank,
                        specialization: grant.specialization,
                    });
                }
            }
        }
    }

    /**
     * Ensure every origin-path-granted specialization for this specialist skill has
     * a runtime entry row, delegating to {@link synthesizeOriginSpecialistEntries}.
     * The entry loop in {@link _prepareSkills} then ranks each row from the grant,
     * so a granted Common Lore (X) / Forbidden Lore (X) / Navigate (X) renders as
     * trained without a hand-seeded row. Derived — nothing is persisted.
     *
     * @param skillKey Schema skill key (e.g. 'commonLore').
     * @param skill    The specialist skill being prepared (its `entries` is mutated in place).
     */
    protected _ensureOriginSpecialistEntries(skillKey: string, skill: SkillData): void {
        if (skill.entries === undefined) return;
        const grantSources = this._originPathItems().map((item) => ({
            grants: (item.system.grants as { skills?: SkillGrantEntry[] } | null | undefined) ?? null,
        }));
        synthesizeOriginSpecialistEntries(grantSources, skillKey, {
            characteristic: skill.characteristic,
            advanced: skill.advanced,
            basic: skill.basic,
            entries: skill.entries,
        });
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Is this creature a psyker?
     * @type {boolean}
     */
    get isPsyker(): boolean {
        return this.psy.rating > 0;
    }

    /**
     * Is creature encumbered?
     * @type {boolean}
     */
    get isEncumbered(): boolean {
        return this.encumbrance.value > this.encumbrance.max;
    }

    /**
     * Prepare movement values based on agility and strength.
     * Movement: Half/Full/Charge/Run based on AB (Agility Bonus)
     * Leap/Jump: Based on SB (Strength Bonus)
     * Lifting: Based on SB with multipliers
     * @protected
     */
    _prepareMovement(): void {
        const agility = this.characteristics.agility;
        const strength = this.characteristics.strength;

        // Read the effective bonus so bonus-only modifiers ("+X Agility/Strength
        // Bonus", #415) scale movement, leap, and carry alongside the base bonus.
        const ab = agility.effectiveBonus;
        const sb = strength.effectiveBonus;

        // #409: fold collected movement modifiers (e.g. a stim/drug granting +N
        // movement — key 'movement' on an item/effect) into the base move rate, so
        // all four rates (half/full/charge/run) scale together and stay consistent
        // multiples (×1/×2/×3/×6). Previously these were gathered into
        // modifierSources.movement but never applied.
        const moveMod = sumMovementModifiers(this.modifierSources.movement);

        // Movement based on AB + Size adjustment (PCs take raw values, no floors).
        const { half, full, charge, run } = computeMovement(ab + moveMod, this.size, false);
        this.movement.half = half;
        this.movement.full = full;
        this.movement.charge = charge;
        this.movement.run = run;

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry roll data is consumed as a free-form bag
    override getRollData(): Record<string, unknown> {
        const data = super.getRollData();

        // Add characteristic values and bonuses for formulas
        applyCharacteristicRollData(data, this.characteristics);

        // Add skill values

        data['pr'] = this.psy.rating;

        return data;
    }
}
