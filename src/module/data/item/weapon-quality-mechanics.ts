/**
 * @file Structured weapon-quality mechanical payload shape (#303).
 *
 * The shape of the `mechanics` field on the weaponQuality DataModel
 * (`weapon-quality.ts`). It lives in this dependency-free leaf module so both the
 * DataModel (data layer) and the boot-index resolver (`rules/weapon-quality-payloads.ts`)
 * can import the type without forming an import cycle through the rules → data → rules
 * edge that `data/item/weapon-quality.ts` already participates in via `ItemDataModel`.
 *
 * Every field is optional/sentinel — a given quality only sets the keys its rule
 * uses; the rest stay at their "absent" default (`null` / `false` / `''`).
 */

/** Defender-save-on-hit payload (Concussive, Shocking, Snare, …). */
interface WeaponQualityHitEffect {
    requiresSave: string;
    failEffect: string;
    stunRoundsVariable: boolean;
    stunRounds: number | null;
    saveTargetPenaltyPerLevel: number | null;
}

/** Template payload (Blast / Smoke / Spray). */
interface WeaponQualityTemplate {
    shape: string;
    radiusVariable: boolean;
}

/**
 * Die-level operation kinds a quality may declare (#303).
 *
 * - `keepHighest` — append `extraDice` dice to each damage Die term and keep the
 *   ORIGINAL number of dice, highest first (Tearing: "roll one extra die, discard
 *   the lowest").
 * - `floor` — a die rolling below the threshold counts as the threshold (Proven (X)).
 * - `cap` — a die rolling above the threshold counts as the threshold (Primitive (X)).
 */
export const WEAPON_QUALITY_DIE_OP_KINDS = ['keepHighest', 'floor', 'cap'] as const;

/** {@link WEAPON_QUALITY_DIE_OP_KINDS} as a union — the schema's `choices` and the type share one source. */
export type WeaponQualityDieOpKind = (typeof WEAPON_QUALITY_DIE_OP_KINDS)[number];

/**
 * When a die operation runs relative to `Roll#evaluate()`.
 *
 * - `preEvaluate` — term surgery on the unevaluated Roll (the only phase in which
 *   the dice pool itself can still be changed).
 * - `postEvaluate` — a per-die adjustment against already-rolled results, emitted as
 *   a signed delta into the hit's modifier map so the chat card keeps its provenance.
 */
export const WEAPON_QUALITY_DIE_OP_PHASES = ['preEvaluate', 'postEvaluate'] as const;

/** {@link WEAPON_QUALITY_DIE_OP_PHASES} as a union — the schema's `choices` and the type share one source. */
export type WeaponQualityDieOpPhase = (typeof WEAPON_QUALITY_DIE_OP_PHASES)[number];

/**
 * One structured die operation on the damage roll (#303). Declared as content on the
 * weaponQuality compendium document so the engine never name-matches `'Tearing'` /
 * `'Proven'` / `'Primitive'` in `src/` (Direction #7).
 */
export interface WeaponQualityDieOp {
    op: WeaponQualityDieOpKind;
    phase: WeaponQualityDieOpPhase;
    /** `keepHighest` only: how many extra dice to append to each damage Die term. */
    extraDice: number | null;
    /** `floor` / `cap`: the fixed threshold, used when `usesLevel` is false. */
    threshold: number | null;
    /** `floor` / `cap`: take the threshold from the quality's `(X)` level instead of `threshold`. */
    usesLevel: boolean;
    /** Modifier-map key the resulting adjustment accumulates under; defaults to the quality identifier when blank. */
    modifierKey: string;
}

/** Range-banded damage/penetration deltas (Scatter). */
interface WeaponQualityRangeBands {
    pointBlank: number | null;
    shortRange: number | null;
    standardRange: number | null;
    longRange: number | null;
    extremeRange: number | null;
}

/**
 * Structured mechanical payload for a weapon quality (#303). Lives on the
 * compendium document so quality mechanics + effect text are content data, not
 * an in-`src/` registry (Direction #7). The boot-time index in
 * `module/rules/weapon-quality-payloads.ts` reads these off the packs and the
 * resolvers consume them by identifier.
 */
export interface WeaponQualityMechanics {
    type: string;
    aimBonus: number | null;
    parryBonus: number | null;
    enemyParryPenalty: number | null;
    parryPenalty: number | null;
    attackBonus: number | null;
    rfThreshold: number | null;
    razorSharpDoubleOnDoS: number | null;
    haywireRadiusPerLevel: number | null;
    maximalPenetrationBonus: number | null;
    shockingAppliesFatigue: number | null;
    cannotParry: boolean;
    cannotBeParried: boolean;
    requiresPsyker: boolean;
    requiresEldar: boolean;
    bonusVsDaemons: boolean;
    ignoresNonWardedArmor: boolean;
    cancelsAim: boolean;
    bonusHitOnTwoDoS: boolean;
    doublesAdditionalHits: boolean;
    reliable: boolean;
    unreliable: boolean;
    /**
     * The weapon is destroyed on an unmodified 00 (a `rollTotal` of 100) attack
     * roll — it falls apart. Enforced in `rolls/action-data.ts` via the pure
     * `rules/weapon-destroy.ts` helper, which sets `system.state.broken`
     * (cleared by the Repair action). Content-declared (Scavenged); the engine
     * never name-matches the quality in `src/` (Direction #7).
     */
    destroyOnCriticalFail: boolean;
    ignoresDaemonResistance: boolean;
    powerFieldDestroysOnParry: boolean;
    overheats: boolean;
    recharge: boolean;
    triggersRecharge: boolean;
    cripplingPenaltyPerActionVariable: boolean;
    gravitonAddsArmourAsDamage: boolean;
    allowsIndirectFire: boolean;
    indirectPenaltyVariable: boolean;
    shockingHalfDoFStun: boolean;
    corrosiveArmourDice: string;
    maximalDamageDice: string;
    toxicAdditionalDamageDice: string;
    sprayAvoidanceCharacteristic: string;
    hitEffect: WeaponQualityHitEffect;
    template: WeaponQualityTemplate;
    rangeBands: WeaponQualityRangeBands;
    /**
     * Die-level operations this quality applies to the damage roll (#303). Empty for
     * every quality that does not touch the dice pool.
     */
    dieOps: WeaponQualityDieOp[];
}
