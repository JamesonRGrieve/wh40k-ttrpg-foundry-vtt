import SystemDataModel from '../abstract/system-data-model.ts';

/* -------------------------------------------------------------------------- */
/*  Dynamic modifier hooks (data-driven, Direction #7)                        */
/* -------------------------------------------------------------------------- */

/**
 * The axes a dynamic modifier can target. Personal-combat and personal-test axes
 * live here; RT ship-combat axes are modelled separately (a parallel subsystem),
 * per the schema survey §D9. `characteristic` / `skill` / `resource` name their
 * subject via `targetKey`.
 */
export const DYNAMIC_MODIFIER_TARGETS = [
    'attack',
    'damage',
    'penetration',
    'defense',
    'initiative',
    'speed',
    'characteristic',
    'skill',
    'resource',
    'damageReduction',
    'critReduction',
    'additionalHits',
    'additionalReactions',
] as const;
/** How the value combines with the base — additive by default; the survey's D1. */
export const DYNAMIC_MODIFIER_MODES = ['add', 'multiply', 'set', 'min', 'max'] as const;
/** Whose roll the modifier acts on — an attacker-side bonus or a defender-side reduction. */
export const DYNAMIC_MODIFIER_SIDES = ['attacker', 'defender'] as const;
/**
 * Dynamic scalar source (`value = source.field × factor [× multiplier]`, rounded).
 * `''` = no scaling (use the static `value` / `valueFormula`). Includes Psy Rating
 * (`pr`), Corruption Bonus (`cb`), the item's own level/rating (`level`), degrees of
 * success (`dos`), and the struck location's armour (`armourPoints`) — survey §D3.
 */
export const DYNAMIC_SCALE_SOURCES = [
    '',
    'ws',
    'bs',
    's',
    't',
    'ag',
    'int',
    'per',
    'wp',
    'fel',
    'pr',
    'cb',
    'level',
    'dos',
    'degrees',
    'penetration',
    'armourPoints',
] as const;
/** Whether the scale reads a characteristic's `bonus` (tens digit) or `total`. */
export const DYNAMIC_SCALE_FIELDS = ['bonus', 'total'] as const;
/** Rounding applied to a scaled value. */
export const DYNAMIC_SCALE_ROUNDING = ['up', 'down', 'nearest', 'none'] as const;
/** Optional second dynamic factor for product-of-two-variables scaling (Lance = pen × DoS) — survey §D4. */
export const DYNAMIC_SCALE_MULTIPLIERS = ['', 'dos', 'degrees', 'level'] as const;
/** When the modifier fires (timing half of the trigger) — survey trigger split. */
export const DYNAMIC_MODIFIER_WHEN = ['always', 'onHit', 'onCrit', 'onKill', 'onCharge', 'onAction', 'onParry', 'atRangeBand'] as const;
/** Duration units for temporary/consumable effects — survey §D6. */
export const DYNAMIC_DURATION_UNITS = ['instant', 'rounds', 'minutes', 'hours', 'days', 'encounter', 'scene', 'permanent'] as const;
/** Per-round action cost to sustain a psychic upkeep buff (`''` = not sustained). */
export const DYNAMIC_DURATION_UPKEEP = ['', 'free', 'half', 'full'] as const;
/** How re-application of a temporary effect (a second drug dose) stacks. */
export const DYNAMIC_DURATION_STACKING = ['none', 'stack', 'refresh', 'escalating'] as const;

/** A scaled magnitude: `source.field × factor [× multiplier]`, rounded, clamped to [min, max]. */
interface DynamicScale {
    source: (typeof DYNAMIC_SCALE_SOURCES)[number];
    field: (typeof DYNAMIC_SCALE_FIELDS)[number];
    factor: number;
    round: (typeof DYNAMIC_SCALE_ROUNDING)[number];
    multiplier: (typeof DYNAMIC_SCALE_MULTIPLIERS)[number];
    min: number | null;
    max: number | null;
}

/** The delayed "crash" a temporary effect inflicts when it wears off (drug after-effect). */
interface DynamicAftereffect {
    target: (typeof DYNAMIC_MODIFIER_TARGETS)[number];
    targetKey: string;
    value: number;
    valueFormula: string;
    durationUnit: (typeof DYNAMIC_DURATION_UNITS)[number];
    durationValue: number;
}

/** The lifecycle of a temporary/consumable/sustained dynamic modifier. */
interface DynamicDuration {
    unit: (typeof DYNAMIC_DURATION_UNITS)[number];
    value: number;
    valueFormula: string;
    sustained: boolean;
    upkeep: (typeof DYNAMIC_DURATION_UPKEEP)[number];
    stacking: (typeof DYNAMIC_DURATION_STACKING)[number];
    save: { characteristic: string; difficulty: number };
    aftereffect: DynamicAftereffect;
}

/**
 * A single declared dynamic modifier hook — the data an item authors so the
 * central collector can evaluate its (possibly characteristic-/DoS-/PR-scaled,
 * conditionally-triggered, temporary) contribution to a roll at runtime, instead
 * of the value being hardcoded by name in `src/`. Non-numeric grants (grant a
 * talent / quality / sense / condition-on-hit) do NOT live here — they belong in
 * the `grants` / weaponQuality `hitEffect` channels (survey §D8).
 */
export interface DynamicModifierEntry {
    /** The axis modified. `characteristic`/`skill`/`resource` name their subject in `targetKey`. */
    target: (typeof DYNAMIC_MODIFIER_TARGETS)[number];
    /** Char/skill/resource id when `target` names one (e.g. `strength`, `awareness`, `wounds`); else blank. */
    targetKey: string;
    /** Attacker-side bonus vs defender-side reduction. */
    side: (typeof DYNAMIC_MODIFIER_SIDES)[number];
    /** How the magnitude combines with the base. */
    mode: (typeof DYNAMIC_MODIFIER_MODES)[number];
    /** Static magnitude (used when `scale.source` and `valueFormula` are empty). */
    value: number;
    /** Dice/Roll expression over `@sb/@bsb/@pr/@dos/@level` for dice-valued magnitudes (ammo +Xd10). */
    valueFormula: string;
    /** Dynamic scalar magnitude; `source: ''` disables it. */
    scale: DynamicScale;
    /** Timing half of the trigger. */
    when: (typeof DYNAMIC_MODIFIER_WHEN)[number];
    /** Predicate half of the trigger (`whileState`, `vsType`, `vsFaction`, `rangeBand`, `action`); blank = unconditional. */
    condition: string;
    /** The predicate's value (the creature type, faction, state, range band, or action name). */
    conditionValue: string;
    /** Temporary/consumable lifecycle (default `instant` = permanent-while-present). */
    duration: DynamicDuration;
    /** Escape hatch (survey §D7): a raw Roll-syntax formula for the irreducible <5%. Prefer the structured fields. */
    formula: string;
    /** Display/provenance label override; blank = the owning item's name. */
    label: string;
}

/**
 * The kinds of thing a conditional grant may confer (survey §D8).
 *
 * - `quality` — a weapon quality / attack special added to the attack
 *   (Hammer Blow → Concussive (2)). **The only kind with a live consumer today**
 *   (`collectGrantedQualities` → `damage-data._calculateSpecials`).
 * - `talent` / `trait` / `condition` / `sense` / `weaponProfile` / `immunity` —
 *   declared so the descriptor does not need reshaping when their consumers land;
 *   each resolves through `uuid` rather than `name`.
 */
// Not exported: only `quality` has a consumer today, so the runtime array is used
// only in-file (the schema `choices` below). The PUBLIC surface consumers need is
// the `GrantEffectKind` union type — re-export the array if/when a consumer of the
// other six kinds needs to iterate it at runtime. Keeps the export dead-code-free.
const GRANT_EFFECT_KINDS = ['quality', 'talent', 'trait', 'condition', 'sense', 'weaponProfile', 'immunity'] as const;

/** The grant-effect kinds as a union — the schema's `choices` and the type share one source. */
export type GrantEffectKind = (typeof GRANT_EFFECT_KINDS)[number];

/**
 * A data-driven **conditional grant** (survey §D8): an item that, when its trigger
 * fires, confers something non-numeric on the attack or actor — e.g. Hammer Blow
 * granting Concussive (2) [DH2/OW/BC] or Shocking [DW/DH1] on an All-Out Attack.
 *
 * This is the *non-numeric* counterpart to {@link DynamicModifierEntry}: it names a
 * thing to add rather than a numeric axis to modify (which the numeric-only
 * `dynamicModifiers` schema deliberately scopes out). It reuses that hook's
 * `when` / `condition` / `conditionValue` trigger primitives verbatim, so a grant is
 * gated exactly the way a numeric hook is and both read through the same
 * `hookApplies` predicate.
 *
 * The central collectors (`collectGrantedEffects` / `collectGrantedQualities`) read
 * these so the grant is defined once, in content, **per line** — the granted quality
 * differs by game line — instead of being name-matched in `src/`.
 */
export interface GrantedEffectEntry {
    /** What sort of thing is granted. Only `quality` has a live consumer today. */
    kind: GrantEffectKind;
    /** The granted thing's display name, e.g. `Concussive`, `Shocking`. Qualities resolve by name (they are attack specials, not documents). */
    name: string;
    /** Compendium UUID of the granted document, for the kinds that are documents (talent/trait/condition/…). Blank for `quality`. */
    uuid: string;
    /** The grant's `(X)` level (e.g. Concussive (2)); 0 for unlevelled grants like Shocking. */
    level: number;
    /** Timing half of the trigger (mirrors {@link DynamicModifierEntry.when}). */
    when: (typeof DYNAMIC_MODIFIER_WHEN)[number];
    /** Predicate half of the trigger (`melee` / `ranged` / …); blank = unconditional. */
    condition: string;
    /** The predicate's value — the action name, range band, etc. */
    conditionValue: string;
}

/** The `ArrayField` of {@link GrantedEffectEntry} conditional grants. */
function grantedEffectsSchema(): foundry.data.fields.DataField.Any {
    const fields = foundry.data.fields;
    return new fields.ArrayField(
        new fields.SchemaField({
            kind: new fields.StringField({ required: true, initial: 'quality', choices: [...GRANT_EFFECT_KINDS] }),
            name: new fields.StringField({ required: true, blank: false }),
            uuid: new fields.StringField({ required: false, blank: true, initial: '' }),
            level: new fields.NumberField({ required: true, initial: 0 }),
            when: new fields.StringField({ required: true, initial: 'always', choices: [...DYNAMIC_MODIFIER_WHEN] }),
            condition: new fields.StringField({ required: false, blank: true, initial: '' }),
            conditionValue: new fields.StringField({ required: false, blank: true, initial: '' }),
        }),
        { required: true, initial: [] },
    );
}

/**
 * The `ArrayField` of {@link DynamicModifierEntry} hooks. A validatable structured
 * descriptor (not a formula language): the collector reads these fields to compute
 * each modifier's value and provenance at roll time. See the schema survey at
 * `src/packs/MODIFIER_HOOK_SCHEMA_SURVEY.md` for the design rationale.
 */
function dynamicModifiersSchema(): foundry.data.fields.DataField.Any {
    const fields = foundry.data.fields;
    return new fields.ArrayField(
        new fields.SchemaField({
            target: new fields.StringField({ required: true, initial: 'damage', choices: [...DYNAMIC_MODIFIER_TARGETS] }),
            targetKey: new fields.StringField({ required: false, blank: true, initial: '' }),
            side: new fields.StringField({ required: true, initial: 'attacker', choices: [...DYNAMIC_MODIFIER_SIDES] }),
            mode: new fields.StringField({ required: true, initial: 'add', choices: [...DYNAMIC_MODIFIER_MODES] }),
            value: new fields.NumberField({ required: true, initial: 0 }),
            valueFormula: new fields.StringField({ required: false, blank: true, initial: '' }),
            scale: new fields.SchemaField({
                source: new fields.StringField({ required: true, initial: '', choices: [...DYNAMIC_SCALE_SOURCES] }),
                field: new fields.StringField({ required: true, initial: 'bonus', choices: [...DYNAMIC_SCALE_FIELDS] }),
                factor: new fields.NumberField({ required: true, initial: 1 }),
                round: new fields.StringField({ required: true, initial: 'up', choices: [...DYNAMIC_SCALE_ROUNDING] }),
                multiplier: new fields.StringField({ required: true, initial: '', choices: [...DYNAMIC_SCALE_MULTIPLIERS] }),
                min: new fields.NumberField({ required: false, nullable: true, initial: null }),
                max: new fields.NumberField({ required: false, nullable: true, initial: null }),
            }),
            when: new fields.StringField({ required: true, initial: 'always', choices: [...DYNAMIC_MODIFIER_WHEN] }),
            condition: new fields.StringField({ required: false, blank: true, initial: '' }),
            conditionValue: new fields.StringField({ required: false, blank: true, initial: '' }),
            duration: new fields.SchemaField({
                unit: new fields.StringField({ required: true, initial: 'instant', choices: [...DYNAMIC_DURATION_UNITS] }),
                value: new fields.NumberField({ required: true, initial: 0 }),
                valueFormula: new fields.StringField({ required: false, blank: true, initial: '' }),
                sustained: new fields.BooleanField({ required: true, initial: false }),
                upkeep: new fields.StringField({ required: true, initial: '', choices: [...DYNAMIC_DURATION_UPKEEP] }),
                stacking: new fields.StringField({ required: true, initial: 'none', choices: [...DYNAMIC_DURATION_STACKING] }),
                save: new fields.SchemaField({
                    characteristic: new fields.StringField({ required: false, blank: true, initial: '' }),
                    difficulty: new fields.NumberField({ required: true, initial: 0 }),
                }),
                aftereffect: new fields.SchemaField({
                    target: new fields.StringField({ required: true, initial: 'characteristic', choices: [...DYNAMIC_MODIFIER_TARGETS] }),
                    targetKey: new fields.StringField({ required: false, blank: true, initial: '' }),
                    value: new fields.NumberField({ required: true, initial: 0 }),
                    valueFormula: new fields.StringField({ required: false, blank: true, initial: '' }),
                    durationUnit: new fields.StringField({ required: true, initial: 'instant', choices: [...DYNAMIC_DURATION_UNITS] }),
                    durationValue: new fields.NumberField({ required: true, initial: 0 }),
                }),
            }),
            formula: new fields.StringField({ required: false, blank: true, initial: '' }),
            label: new fields.StringField({ required: false, blank: true, initial: '' }),
        }),
        { required: true, initial: [] },
    );
}

/**
 * One situational-modifier channel: an `ArrayField` of conditional
 * `{ key, value, condition, icon }` entries. The `situational.characteristics`,
 * `situational.skills`, and `situational.combat` channels are structurally
 * identical, so they share this factory instead of repeating the sub-schema
 * three times (#427). The field types, options, and the `fa-exclamation-triangle`
 * icon default are reproduced exactly, so the emitted schema is unchanged.
 */
function situationalEntrySchema(): foundry.data.fields.DataField.Any {
    const fields = foundry.data.fields;
    return new fields.ArrayField(
        new fields.SchemaField({
            key: new fields.StringField({ required: true }),
            value: new fields.NumberField({ required: true, initial: 0 }),
            condition: new fields.StringField({ required: true }),
            icon: new fields.StringField({ required: false, initial: 'fa-exclamation-triangle' }),
            // Homebrew test-variant scoping (#246/#440): when set to a skill test
            // variant name (e.g. "Visual"), this modifier only applies when that
            // sense channel is the one being rolled — an auspex bonus tagged Visual
            // augments sight, not hearing. Blank = universal (applies to every variant).
            appliesToVariant: new fields.StringField({ required: false, blank: true, initial: '' }),
        }),
        { required: true, initial: [] },
    );
}

/**
 * MODIFIER SYSTEM DOCUMENTATION
 *
 * This template provides two types of modifiers for items that affect actor statistics:
 *
 * ============================================================================
 * 1. ALWAYS-ON MODIFIERS (Auto-Applied)
 * ============================================================================
 *
 * These modifiers are automatically applied during prepareEmbeddedData() and permanently
 * affect the actor's statistics while the item is present/equipped.
 *
 * ACTIVATION CONDITIONS:
 * - Talents: Always active if item exists on actor
 * - Traits: Always active if item exists on actor
 * - Conditions: Always active if item exists on actor
 * - Armour: Active when system.state.equipped === true
 * - Cybernetics: Active when system.state.equipped === true
 * - Gear: Active when system.state.equipped === true
 *
 * MODIFIER FIELDS:
 *
 * • modifiers.characteristics
 *   → Adds to characteristic totals in prepareEmbeddedData()
 *   → Applied before characteristic.bonus calculation
 *   → Example: { strength: 10, agility: -5 }
 *   → Usage: Unnatural Characteristics, Power Armour bonuses
 *
 * • modifiers.skills
 *   → Adds to skill.current in prepareEmbeddedData()
 *   → Applied after training calculation
 *   → Example: { dodge: 10, awareness: 5 }
 *   → Usage: Skill bonuses from talents, equipment
 *
 * • modifiers.combat
 *   → Adds to attack/damage/defense/initiative rolls
 *   → Fields: attack, damage, penetration, defense, initiative, speed
 *   → Example: { attack: 10, damage: 2, initiative: 1 }
 *   → Usage: Weapon attachments, combat talents, stance bonuses
 *
 * • modifiers.resources
 *   → Adds to maximum resource values
 *   → Fields: wounds, fate, insanity, corruption
 *   → Example: { wounds: 5, fate: 1 }
 *   → Usage: Talents that increase max wounds, fate bonuses
 *
 * • modifiers.other
 *   → Generic modifier array for custom effects
 *   → Each entry: { key, label, value, mode }
 *   → Modes: "add", "multiply", "override", "downgrade", "upgrade"
 *   → Example: [{ key: "movement", label: "Fleet of Foot", value: 2, mode: "add" }]
 *
 * ============================================================================
 * 2. SITUATIONAL MODIFIERS (Manual Application)
 * ============================================================================
 *
 * These modifiers are displayed in roll dialogs as optional checkboxes that players
 * can enable/disable based on current circumstances. They are NOT auto-applied.
 *
 * DISPLAY LOCATION:
 * - Shown in characteristic/skill roll dialogs
 * - Presented as checkboxes with condition text
 * - Player chooses which apply to current roll
 *
 * MODIFIER FIELDS:
 *
 * • modifiers.situational.characteristics
 *   → Array of conditional characteristic modifiers
 *   → Each entry: { key, value, condition, icon }
 *   → Example: [{
 *       key: "strength",
 *       value: 10,
 *       condition: "When lifting or moving heavy objects",
 *       icon: "fa-dumbbell"
 *     }]
 *
 * • modifiers.situational.skills
 *   → Array of conditional skill modifiers
 *   → Each entry: { key, value, condition, icon }
 *   → Example: [{
 *       key: "stealth",
 *       value: 10,
 *       condition: "In shadows or darkness",
 *       icon: "fa-moon"
 *     }]
 *
 * • modifiers.situational.combat
 *   → Array of conditional combat modifiers
 *   → Each entry: { key, value, condition, icon }
 *   → Example: [{
 *       key: "attack",
 *       value: 10,
 *       condition: "When fighting xenos",
 *       icon: "fa-skull-crossbones"
 *     }]
 *
 * ============================================================================
 * PRACTICAL EXAMPLES
 * ============================================================================
 *
 * TALENT: "Unnatural Strength (x2)"
 * {
 *   modifiers: {
 *     characteristics: { strength: 10 }  // Always-on +10 Strength
 *   }
 * }
 *
 * TALENT: "Hatred (Orks)"
 * {
 *   modifiers: {
 *     situational: {
 *       combat: [{
 *         key: "attack",
 *         value: 10,
 *         condition: "When attacking Orks",
 *         icon: "fa-skull"
 *       }]
 *     }
 *   }
 * }
 *
 * ARMOUR: "Power Armour"
 * {
 *   modifiers: {
 *     characteristics: { strength: 20 },  // Auto-applied when equipped
 *     resources: { wounds: 5 }
 *   }
 * }
 *
 * TRAIT: "Quadruped"
 * {
 *   modifiers: {
 *     other: [{
 *       key: "movement",
 *       label: "Movement",
 *       value: 2,
 *       mode: "add"
 *     }]
 *   }
 * }
 *
 * ============================================================================
 * MODIFIER TRACKING
 * ============================================================================
 *
 * All applied modifiers are tracked in actor.system.modifierSources for transparency:
 *
 * actor.system.modifierSources = {
 *   characteristics: {
 *     strength: [
 *       { name: "Power Armour", type: "armour", id: "xxx", value: 20 },
 *       { name: "Unnatural Strength", type: "trait", id: "yyy", value: 10 }
 *     ]
 *   },
 *   skills: { dodge: [{ name: "Dodge Training", ... }] },
 *   combat: { attack: [...], damage: [...], initiative: [...] },
 *   wounds: [{ name: "True Grit", type: "talent", value: 5 }],
 *   fate: [...],
 *   movement: [...]
 * }
 *
 * @mixin
 */
export default class ModifiersTemplate extends SystemDataModel {
    // Typed property declarations matching defineSchema()
    declare modifiers: {
        characteristics: Record<string, number>;
        skills: Record<string, number>;
        combat: { attack: number; damage: number; penetration: number; defense: number; initiative: number; speed: number };
        resources: { wounds: number; fate: number; insanity: number; corruption: number };
        other: Array<{ key: string; label: string; value: number; mode: string }>;
        situational: {
            characteristics: Array<{ key: string; value: number; condition: string; icon: string; appliesToVariant?: string }>;
            skills: Array<{ key: string; value: number; condition: string; icon: string; appliesToVariant?: string }>;
            combat: Array<{ key: string; value: number; condition: string; icon: string; appliesToVariant?: string }>;
        };
        /** Data-driven dynamic modifier hooks (Direction #7) — see {@link DynamicModifierEntry}. */
        dynamicModifiers: DynamicModifierEntry[];
        /** Data-driven conditional grants (Direction #7, survey §D8) — see {@link GrantedEffectEntry}. */
        grantedEffects: GrantedEffectEntry[];
    };

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            modifiers: new fields.SchemaField({
                characteristics: new fields.ObjectField({ required: true, initial: {} }),
                skills: new fields.ObjectField({ required: true, initial: {} }),
                combat: new fields.SchemaField({
                    attack: new fields.NumberField({ required: false, initial: 0 }),
                    damage: new fields.NumberField({ required: false, initial: 0 }),
                    penetration: new fields.NumberField({ required: false, initial: 0 }),
                    defense: new fields.NumberField({ required: false, initial: 0 }),
                    initiative: new fields.NumberField({ required: false, initial: 0 }),
                    speed: new fields.NumberField({ required: false, initial: 0 }),
                }),
                resources: new fields.SchemaField({
                    wounds: new fields.NumberField({ required: false, initial: 0 }),
                    fate: new fields.NumberField({ required: false, initial: 0 }),
                    insanity: new fields.NumberField({ required: false, initial: 0 }),
                    corruption: new fields.NumberField({ required: false, initial: 0 }),
                }),
                other: new fields.ArrayField(
                    new fields.SchemaField({
                        key: new fields.StringField({ required: true }),
                        label: new fields.StringField({ required: false }),
                        value: new fields.NumberField({ required: true, initial: 0 }),
                        mode: new fields.StringField({
                            required: true,
                            initial: 'add',
                            choices: ['add', 'multiply', 'override', 'downgrade', 'upgrade'],
                        }),
                    }),
                    { required: true, initial: [] },
                ),
                situational: new fields.SchemaField({
                    characteristics: situationalEntrySchema(),
                    skills: situationalEntrySchema(),
                    combat: situationalEntrySchema(),
                }),
                // Data-driven dynamic modifier hooks (Direction #7). Empty on legacy
                // items; authored on content whose modifier is dynamic / conditional /
                // temporary and read by the central collector.
                dynamicModifiers: dynamicModifiersSchema(),
                // Data-driven conditional grants (Direction #7, §D8). Empty on legacy
                // items; authored per line on content that grants a quality on a
                // trigger (Hammer Blow → Concussive/Shocking on All-Out).
                grantedEffects: grantedEffectsSchema(),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate modifiers data.
     * @param {object} source  The source data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel._migrateData receives raw unknown source data before schema validation
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        ModifiersTemplate.#normalizeModifiers(source);
    }

    /**
     * Ensure modifiers nested objects exist.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #normalizeModifiers(source: Record<string, unknown>): void {
        if (source['modifiers'] === null || source['modifiers'] === undefined) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: modifiers is a raw object from source data before schema validation; cast to Record for property initialization
        const mods = source['modifiers'] as Record<string, unknown>;
        if (!('characteristics' in mods) || mods['characteristics'] === undefined) mods['characteristics'] = {};
        if (!('skills' in mods) || mods['skills'] === undefined) mods['skills'] = {};
        if (!('combat' in mods) || mods['combat'] === undefined) mods['combat'] = {};
        if (!('resources' in mods) || mods['resources'] === undefined) mods['resources'] = {};
        if (!('other' in mods) || mods['other'] === undefined) mods['other'] = [];
        if (!('situational' in mods) || mods['situational'] === undefined) mods['situational'] = { characteristics: [], skills: [], combat: [] };
        if (!('dynamicModifiers' in mods) || mods['dynamicModifiers'] === undefined) mods['dynamicModifiers'] = [];
        ModifiersTemplate.#normalizeGrantedEffects(mods);
    }

    /**
     * Normalize the conditional-grant channel (§D8).
     *
     * Folds the legacy quality-only `grantedQualities` array forward into the unified
     * `grantedEffects` array, stamping the `kind: 'quality'` discriminator every legacy
     * entry implied, so content and live-world items authored before the channel was
     * generalized keep resolving.
     * @param mods  The raw `modifiers` object from source data, pre-validation.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: migration helper receives raw source from _migrateData
    static #normalizeGrantedEffects(mods: Record<string, unknown>): void {
        const legacy = mods['grantedQualities'];
        if (Array.isArray(legacy) && !('grantedEffects' in mods)) {
            mods['grantedEffects'] = legacy.map((entry) => (typeof entry === 'object' && entry !== null ? { kind: 'quality', ...entry } : entry));
        }
        delete mods['grantedQualities'];
        if (!('grantedEffects' in mods) || mods['grantedEffects'] === undefined) mods['grantedEffects'] = [];
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean modifiers template data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel._cleanData receives raw source before schema validation
    static override _cleanData(source: Record<string, unknown> | undefined, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
    }

    /* -------------------------------------------- */

    /**
     * Check if this item provides any modifiers.
     * @type {boolean}
     */
    get hasModifiers(): boolean {
        const mods = this.modifiers;
        if (Object.keys(mods.characteristics).length) return true;
        if (Object.keys(mods.skills).length) return true;
        if (Object.values(mods.combat).some((v) => v !== 0)) return true;
        if (Object.values(mods.resources).some((v) => v !== 0)) return true;
        if (mods.other.length > 0) return true;
        if (mods.situational.characteristics.length > 0) return true;
        if (mods.situational.skills.length > 0) return true;
        if (mods.situational.combat.length > 0) return true;
        if (mods.dynamicModifiers.length > 0) return true;
        if (mods.grantedEffects.length > 0) return true;
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Whether this item declares any data-driven dynamic modifier hooks
     * (Direction #7). Read by the central collector to skip items with none.
     * @type {boolean}
     */
    get hasDynamicModifiers(): boolean {
        return this.modifiers.dynamicModifiers.length > 0;
    }

    /* -------------------------------------------- */

    /**
     * Get the modifier for a specific characteristic.
     * @param {string} char   The characteristic key.
     * @returns {number}
     */
    getCharacteristicModifier(char: string): number {
        return this.modifiers.characteristics[char] ?? 0;
    }

    /* -------------------------------------------- */

    /**
     * Get the modifier for a specific skill.
     * @param {string} skill   The skill key.
     * @returns {number}
     */
    getSkillModifier(skill: string): number {
        return this.modifiers.skills[skill] ?? 0;
    }

    /* -------------------------------------------- */

    /**
     * Get all modifiers as a flat array for display.
     * @type {object[]}
     */
    get modifiersList(): Array<{ key: string; label: string; value: number; type: string }> {
        const list: Array<{ key: string; label: string; value: number; type: string }> = [];
        const mods = this.modifiers;

        // Characteristics
        for (const [key, value] of Object.entries(mods.characteristics)) {
            if (value !== 0) {
                list.push({
                    key,
                    label: game.i18n.localize(`WH40K.Characteristic.${key.capitalize()}`),
                    value,
                    type: 'characteristic',
                });
            }
        }

        // Skills
        for (const [key, value] of Object.entries(mods.skills)) {
            if (value !== 0) {
                list.push({
                    key,
                    label: game.i18n.localize(`WH40K.Skill.${key}`),
                    value,
                    type: 'skill',
                });
            }
        }

        // Combat
        for (const [key, value] of Object.entries(mods.combat)) {
            if (value !== 0) {
                list.push({
                    key,
                    label: game.i18n.localize(`WH40K.Combat.${key.capitalize()}`),
                    value,
                    type: 'combat',
                });
            }
        }

        // Resources
        for (const [key, value] of Object.entries(mods.resources)) {
            if (value !== 0) {
                list.push({
                    key,
                    label: game.i18n.localize(`WH40K.Resource.${key.capitalize()}`),
                    value,
                    type: 'resource',
                });
            }
        }

        // Other
        for (const mod of mods.other) {
            list.push({
                ...mod,
                type: 'other',
            });
        }

        return list;
    }

    /* -------------------------------------------- */

    /**
     * Get situational modifiers as a structured list.
     * @type {object}
     */
    get situationalModifiers(): {
        characteristics: Array<{ key: string; value: number; condition: string; icon: string; appliesToVariant?: string }>;
        skills: Array<{ key: string; value: number; condition: string; icon: string; appliesToVariant?: string }>;
        combat: Array<{ key: string; value: number; condition: string; icon: string; appliesToVariant?: string }>;
    } {
        const situational = this.modifiers.situational;
        return {
            characteristics: situational.characteristics,
            skills: situational.skills,
            combat: situational.combat,
        };
    }

    /* -------------------------------------------- */

    /**
     * Check if this item has any situational modifiers.
     * @type {boolean}
     */
    get hasSituationalModifiers(): boolean {
        const sit = this.situationalModifiers;
        return sit.characteristics.length > 0 || sit.skills.length > 0 || sit.combat.length > 0;
    }
}
