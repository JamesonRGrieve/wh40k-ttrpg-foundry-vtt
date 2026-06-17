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
    provenFloor: boolean;
    bonusHitOnTwoDoS: boolean;
    doublesAdditionalHits: boolean;
    reliable: boolean;
    unreliable: boolean;
    ignoresDaemonResistance: boolean;
    powerFieldDestroysOnParry: boolean;
    overheats: boolean;
    recharge: boolean;
    triggersRecharge: boolean;
    primitiveCap: boolean;
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
}
