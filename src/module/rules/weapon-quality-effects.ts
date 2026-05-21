/**
 * @file Weapon Quality Effects - Phase 1-4 (Simple + Complex + Advanced + Exotic Qualities)
 * Handles mechanical effects for weapon qualities in combat.
 *
 * Phase 1 Scope:
 * - Category B: Accurate, Balanced, Defensive, Fast, Unbalanced, Unwieldy
 * - Category C (subset): Tearing, Melta
 *
 * Phase 4 Scope (Exotic):
 * - Force: Psyker Psy Rating bonus to damage
 * - Warp Weapon: Ignore non-warded armor
 * - Witch-Edge: Eldar Strength Bonus modifier
 * - Daemonbane: vs Daemon bonuses
 * - Gauss/Vengeful: RF threshold modifiers
 *
 * Architecture:
 * - Modular effect handlers for each quality
 * - Hooks into attack roll flow for Accurate
 * - Provides parry modifiers for Balanced/Defensive/Fast/Unbalanced/Unwieldy
 * - Coordinates with damage roll for Tearing (already implemented in damage-data.mjs)
 * - Coordinates with range system for Melta
 */

import type { WeaponRollData } from '../rolls/roll-data.ts';
import type { WH40KBaseActorDocument, WH40KItemDocument, WH40KItemSystemData } from '../types/global.d.ts';

type AttackSpecialLike = {
    name?: string;
};

type QualityItem = {
    name?: string;
    items?: Iterable<WH40KItemDocument>;
    isAttackSpecial?: boolean;
    system?: WH40KItemSystemData & {
        enabled?: boolean;
        special?: Set<string>;
        effectiveSpecial?: Set<string>;
    };
};

type QualityActor = WH40KBaseActorDocument & {
    system: WH40KBaseActorDocument['system'] & {
        species?: string;
        traits?: Array<{ name?: string }>;
        psyker?: {
            psyRating?: number;
        };
        characteristics?: {
            strength?: {
                bonus: number;
            };
        };
    };
};

type PenetrationContext = {
    weapon?: QualityItem | null | undefined;
    rangeName?: string | undefined;
    basePenetration?: number | undefined;
    /** Degrees of success on the attack roll, used by Razor Sharp (Pen × 2 on 2+ DoS). */
    dos?: number;
};

type ExoticDamageContext = {
    weapon?: QualityItem | null | undefined;
    actor?: QualityActor | null | undefined;
    target?: QualityActor | null | undefined;
};

type QualityModifierMap = Record<string, number>;
type QualityDamageModifierMap = Record<string, number | string>;
type QualitySummaryContext = 'attack' | 'parry' | 'damage' | 'penetration' | 'righteous-fury' | 'all';

/* -------------------------------------------- */
/*  Quality Effect Constants                    */
/* -------------------------------------------- */

/** Save-and-effect shape used by qualities that trigger a defender save on hit (Concussive, Shocking, Snare, etc.). */
export interface WeaponQualityHitEffect {
    requiresSave: 'agility' | 'toughness' | 'willpower' | 'strength';
    failEffect: 'stunned' | 'snared' | 'prone' | 'burning' | 'hallucinating' | 'haywire' | 'poisoned' | 'crippled' | 'armour-melt';
    /** Static round count, OR true if the X parameter on the quality scales it. */
    stunRoundsVariable?: boolean;
    /** Static round count when not variable. */
    stunRounds?: number;
    /**
     * Per-DoF penalty applied to the save target value (e.g. Concussive (X) applies
     * `-X × 10` to the Toughness test). The engine multiplies the level (X) by this
     * value at runtime to compute the actual penalty. -10 = "Challenging step per X".
     */
    saveTargetPenaltyPerLevel?: number;
}

/**
 * Range-banded scaling payload used by qualities whose damage / penetration
 * changes by the current range band (Scatter). The values are signed deltas
 * applied to the relevant pool (damage or penetration).
 */
export interface WeaponQualityRangeBands {
    pointBlank: number;
    shortRange: number;
    standardRange: number;
    longRange: number;
    extremeRange: number;
}

/** Template shape (Blast / Smoke) — radius is variable on level X. */
export interface WeaponQualityTemplate {
    /** 'sphere' for Blast, 'concealment-cloud' for Smoke. */
    shape: 'sphere' | 'concealment-cloud' | 'cone';
    /** True when radius scales with the X level on the quality. */
    radiusVariable: boolean;
}

/**
 * Phase 1 weapon quality definitions
 */
export const WEAPON_QUALITY_EFFECTS = {
    // Category B: Attack/Parry Modifiers
    'accurate': {
        type: 'attack',
        aimBonus: 10, // +10 BS when using Aim action
        description: '+10 BS when using Aim action',
    },
    'balanced': {
        type: 'parry',
        parryBonus: 10, // +10 WS for parry
        description: '+10 WS when parrying with this weapon',
    },
    'defensive': {
        type: 'parry',
        parryBonus: 15, // +15 WS for parry
        description: '+15 WS when parrying with this weapon',
    },
    'fast': {
        type: 'parry',
        enemyParryPenalty: -20, // Enemies suffer -20 to parry this weapon
        description: 'Enemies suffer -20 when attempting to parry this weapon',
    },
    'unbalanced': {
        type: 'parry',
        parryPenalty: -10, // -10 to parry attempts with this weapon
        description: '-10 WS when parrying with this weapon',
    },
    'unwieldy': {
        type: 'parry',
        cannotParry: true, // Cannot parry with this weapon
        description: 'Cannot parry with this weapon',
    },

    // Category C (subset): Damage/Penetration Modifiers
    'tearing': {
        type: 'damage',
        description: 'Roll 2d10 for damage dice, drop the lowest (already implemented in damage-data.mjs)',
    },
    'melta': {
        type: 'penetration',
        description: 'Double penetration at short range (includes Point Blank and Short Range)',
    },

    // Phase 4: Exotic Qualities
    'force': {
        type: 'damage',
        description: 'Psyker adds Psy Rating to damage',
        requiresPsyker: true,
    },
    'warp-weapon': {
        type: 'penetration',
        description: 'Ignores armor that is not warded (force fields and warded armor still apply)',
        ignoresNonWardedArmor: true,
    },
    'witch-edge': {
        type: 'damage',
        description: 'Eldar wielders add their Strength Bonus twice',
        requiresEldar: true,
    },
    'daemonbane': {
        type: 'damage',
        description: '+2d10 damage against Daemons',
        bonusVsDaemons: true,
    },
    'gauss': {
        type: 'righteous-fury',
        description: 'Righteous Fury triggers on 9 or 10 on damage die',
        rfThreshold: 9,
    },
    'vengeful': {
        type: 'righteous-fury',
        description: 'Righteous Fury triggers on 8, 9, or 10 on damage die (replaces standard RF)',
        rfThreshold: 8,
    },

    // Phase 5: Mechanical-effect qualities (#57 partial). The audit's umbrella
    // covers 28 qualities; this set encodes the ones whose effect fits the
    // existing modifier-flag pipeline without new infrastructure. The rest
    // (Blast template, Spray template, Scatter range-bands, Flame
    // auto-burning, Hallucinogenic table, Haywire jam table, Indirect,
    // Lance, Maximal mode-switch, Crippling, Smoke, Snare, Toxic save) are
    // tracked as per-quality follow-up issues.
    'inaccurate': {
        type: 'attack',
        description: 'Aim grants no bonus with this weapon.',
        cancelsAim: true,
    },
    'razor-sharp': {
        type: 'penetration',
        description: "On 2+ DoS, the weapon's Penetration is doubled.",
        razorSharpDoubleOnDoS: 2,
    },
    'proven': {
        type: 'damage',
        description: 'Each damage die treats a result less than the Proven (X) value as X.',
        provenFloor: true,
    },
    'twin-linked': {
        type: 'attack',
        description: '+20 BS on single shots, scoring an additional hit on a successful test with 2+ DoS.',
        attackBonus: 20,
        bonusHitOnTwoDoS: true,
    },
    'storm': {
        type: 'attack',
        description: 'Rate of fire is doubled; semi/full-auto bursts score two additional hits per successful attack.',
        doublesAdditionalHits: true,
    },
    'reliable': {
        type: 'reliability',
        description: 'Weapon jams only on a natural 100. (See `rules/weapon-jam.ts:shouldJamRoll`.)',
        reliable: true,
    },
    'unreliable': {
        type: 'reliability',
        description: 'Weapon jams on a roll of 91 or higher, even on Semi- or Full Auto. (See `rules/weapon-jam.ts:shouldJamRoll`.)',
        unreliable: true,
    },
    'sanctified': {
        type: 'damage',
        description: 'Daemons cannot ignore damage from this weapon.',
        ignoresDaemonResistance: true,
    },
    'power-field': {
        type: 'parry',
        description: 'A successful parry against a non-Power, non-Force weapon destroys the parried weapon.',
        powerFieldDestroysOnParry: true,
    },
    'overheats': {
        type: 'reliability',
        description: 'On a roll of 91+ (or 1, depending on weapon), the weapon overheats. (See `action-data.ts` overheat branch.)',
        overheats: true,
    },
    'recharge': {
        type: 'reliability',
        description: 'Cannot fire on consecutive turns; must spend a round recharging.',
        recharge: true,
    },

    // Phase 6: Mechanical wiring for the remaining audit-listed qualities
    // (#57 completion). Each entry now carries the structured payload the
    // engine consumes — the inline switch in `rolls/damage-data.ts` and the
    // template/save resolvers below are the live consumers.
    'blast': {
        type: 'template',
        description: 'Hits all targets within X metres of the impact point.',
        template: { shape: 'sphere', radiusVariable: true } satisfies WeaponQualityTemplate,
    },
    'concussive': {
        type: 'hit-effect',
        description: 'On a hit, the target makes a Toughness test (-X×10) or is Stunned for 1 round per DoF; knocked Prone if damage exceeds target SB.',
        hitEffect: {
            requiresSave: 'toughness',
            failEffect: 'stunned',
            stunRoundsVariable: true,
            saveTargetPenaltyPerLevel: -10,
        } satisfies WeaponQualityHitEffect,
    },
    'corrosive': {
        type: 'hit-effect',
        description: 'Damage rolls a d10 against armour; armour loses that many points and bypasses Toughness reduction on overflow.',
        hitEffect: { requiresSave: 'toughness', failEffect: 'armour-melt' } satisfies WeaponQualityHitEffect,
        corrosiveArmourDice: '1d10',
    },
    'crippling': {
        type: 'hit-effect',
        description: 'If wounded, target gains Crippled; taking more than a Half Action inflicts X damage ignoring Armour and Toughness.',
        hitEffect: { requiresSave: 'toughness', failEffect: 'crippled' } satisfies WeaponQualityHitEffect,
        cripplingPenaltyPerActionVariable: true,
    },
    'flame': {
        type: 'hit-effect',
        description: 'Target makes an Agility test or catches fire.',
        hitEffect: { requiresSave: 'agility', failEffect: 'burning' } satisfies WeaponQualityHitEffect,
    },
    'flexible': { type: 'parry', cannotBeParried: true, description: 'This weapon cannot be parried.' },
    'graviton': {
        type: 'hit-effect',
        description:
            'On a hit, the target makes a Strength test or falls Prone; vehicles roll Agility instead. Bonus damage equal to the struck location’s Armour Points.',
        hitEffect: { requiresSave: 'strength', failEffect: 'prone' } satisfies WeaponQualityHitEffect,
        gravitonAddsArmourAsDamage: true,
    },
    'hallucinogenic': {
        type: 'hit-effect',
        description: 'Target makes a Toughness test (-X×10) or rolls on the Hallucinogenic table.',
        hitEffect: {
            requiresSave: 'toughness',
            failEffect: 'hallucinating',
            saveTargetPenaltyPerLevel: -10,
        } satisfies WeaponQualityHitEffect,
    },
    'haywire': {
        type: 'hit-effect',
        description: 'On a hit, technological items within X×10 metres roll on the Haywire table at strength 1d10.',
        hitEffect: { requiresSave: 'toughness', failEffect: 'haywire' } satisfies WeaponQualityHitEffect,
        haywireRadiusPerLevel: 10,
    },
    'indirect': {
        type: 'attack',
        description: 'Can be fired without line of sight; suffers a +X BS penalty and scatters 1d10−BSB metres on a miss.',
        allowsIndirectFire: true,
        indirectPenaltyVariable: true,
    },
    'lance': { type: 'penetration', description: 'Penetration is multiplied by DoS (minimum 1).' },
    'maximal': {
        type: 'damage',
        description: 'Once per encounter, fire at +1d10 damage and +2 penetration; the weapon gains Overheats and must Recharge afterwards.',
        maximalDamageDice: '1d10',
        maximalPenetrationBonus: 2,
        triggersRecharge: true,
    },
    'primitive': {
        type: 'damage',
        description: 'Each damage die counts as the Primitive (X) value if it would otherwise roll higher (against non-Primitive armour).',
        primitiveCap: true,
    },
    'scatter': {
        type: 'damage',
        description: 'Range-banded damage: +3 at Point Blank, +0 at Short Range, −3 at Standard/Long/Extreme.',
        rangeBands: {
            pointBlank: 3,
            shortRange: 0,
            standardRange: -3,
            longRange: -3,
            extremeRange: -3,
        } satisfies WeaponQualityRangeBands,
    },
    'shocking': {
        type: 'hit-effect',
        description: 'On a hit, the target makes a Toughness test or suffers 1 level of Fatigue and is Stunned for half DoF rounds (round up).',
        hitEffect: { requiresSave: 'toughness', failEffect: 'stunned', stunRounds: 1 } satisfies WeaponQualityHitEffect,
        shockingHalfDoFStun: true,
        shockingAppliesFatigue: 1,
    },
    'smoke': {
        type: 'template',
        description: 'On detonation, creates a smoke cloud X metres across that grants concealment.',
        template: { shape: 'concealment-cloud', radiusVariable: true } satisfies WeaponQualityTemplate,
    },
    'snare': {
        type: 'hit-effect',
        description: 'On a hit, the target makes an Agility test (-X×10) or is Snared until they escape with a Strength or Agility test (-X×10).',
        hitEffect: {
            requiresSave: 'agility',
            failEffect: 'snared',
            saveTargetPenaltyPerLevel: -10,
        } satisfies WeaponQualityHitEffect,
    },
    'spray': {
        type: 'template',
        description:
            'No BS test required; all targets in a cone make a Challenging (+0) Agility test to avoid being hit. Composes with the Leaping Dodge talent (rules/spray-avoidance.ts).',
        template: { shape: 'cone', radiusVariable: false } satisfies WeaponQualityTemplate,
        sprayAvoidanceCharacteristic: 'agility',
    },
    'toxic': {
        type: 'hit-effect',
        description: 'On a wound, target makes a Toughness test (-X×10) or suffers 1d10 additional damage of the weapon’s damage type.',
        hitEffect: {
            requiresSave: 'toughness',
            failEffect: 'poisoned',
            saveTargetPenaltyPerLevel: -10,
        } satisfies WeaponQualityHitEffect,
        toxicAdditionalDamageDice: '1d10',
    },
};

/* -------------------------------------------- */
/*  Quality Check Helpers                       */
/* -------------------------------------------- */

/**
 * Check if a weapon has a specific quality.
 * Checks both the weapon's special/effectiveSpecial set and embedded attackSpecial items.
 *
 * @param {Item} weapon - The weapon item
 * @param {string} qualityName - Quality name to check (case-insensitive)
 * @returns {boolean} True if weapon has the quality
 */
export function weaponHasQuality(weapon: QualityItem | null | undefined, qualityName: string): boolean {
    if (!weapon) return false;

    const normalizedName = qualityName.toLowerCase();

    // Check effectiveSpecial set (includes craftsmanship-derived qualities)
    if (weapon.system?.effectiveSpecial?.has(normalizedName) === true) {
        return true;
    }

    // Check special set (base qualities)
    if (weapon.system?.special?.has(normalizedName) === true) {
        return true;
    }

    // Check embedded attackSpecial items
    if (weapon.items !== undefined) {
        for (const item of weapon.items) {
            if (item.isAttackSpecial && item.name.toLowerCase() === normalizedName) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if roll data has a specific attack special.
 * Helper function that checks the rollData.attackSpecials array.
 *
 * @param {RollData} rollData - The roll data
 * @param {string} qualityName - Quality name to check
 * @returns {boolean} True if the quality is present in attackSpecials
 */
export function rollDataHasQuality(rollData: WeaponRollData, qualityName: string): boolean {
    return rollData.attackSpecials.some((s: AttackSpecialLike) => s.name?.toLowerCase() === qualityName.toLowerCase());
}

/* -------------------------------------------- */
/*  Attack Roll Modifiers (Category B)          */
/* -------------------------------------------- */

/**
 * Calculate attack roll modifiers from weapon qualities.
 * Called during roll configuration to apply quality bonuses/penalties.
 *
 * @param {WeaponRollData} rollData - The weapon roll data
 * @returns {Object} Object with modifier entries { qualityName: value }
 */
export function calculateQualityAttackModifiers(rollData: WeaponRollData): QualityModifierMap {
    const modifiers: QualityModifierMap = {};
    // eslint-disable-next-line no-restricted-syntax -- boundary: WeaponRollData.weapon is the real WH40KItem document; QualityItem is a structural subset narrowing required for quality checks
    const weapon = rollData.weapon as unknown as QualityItem;

    // Accurate: +10 BS when using Aim action
    if (weaponHasQuality(weapon, 'accurate')) {
        if ((rollData.modifiers['aim'] ?? 0) > 0) {
            modifiers['Accurate'] = WEAPON_QUALITY_EFFECTS.accurate.aimBonus;
        }
    }

    // Inaccurate: aim grants no bonus. Cancels whatever the dialog applied
    // by emitting the negation modifier rather than mutating the source,
    // so the breakdown still shows the player what was applied vs cancelled.
    if (weaponHasQuality(weapon, 'inaccurate')) {
        const aimMod = rollData.modifiers['aim'] ?? 0;
        if (aimMod > 0) {
            modifiers['Inaccurate'] = -aimMod;
        }
    }

    // Twin-linked: +20 BS on single shots (Standard Attack / Called Shot).
    // The "additional hit on 2+ DoS" half lives in `action-data.ts` since
    // it manipulates `damageData.additionalHits` rather than the to-hit roll.
    if (weaponHasQuality(weapon, 'twin-linked')) {
        const action = rollData.action;
        if (action === 'Standard Attack' || action === 'Called Shot') {
            modifiers['Twin-Linked'] = 20;
        }
    }

    // Defensive: -10 to attack (for attacker using defensive weapon)
    // Note: This is already handled in attack-specials.mjs line 73-75
    // Left here for completeness documentation

    return modifiers;
}

/* -------------------------------------------- */
/*  Parry Modifiers (Category B)                */
/* -------------------------------------------- */

/**
 * Get parry modifier for a weapon.
 * Returns the total modifier to apply when parrying with this weapon.
 *
 * @param {Item} weapon - The weapon being used to parry
 * @returns {number} Total parry modifier (can be positive, negative, or 0)
 */
export function getWeaponParryModifier(weapon: QualityItem | null | undefined): number {
    if (!weapon) return 0;

    let totalModifier = 0;

    // Unwieldy: Cannot parry (return special flag)
    if (weaponHasQuality(weapon, 'unwieldy')) {
        return -999; // Special flag indicating cannot parry
    }

    // Defensive: +15 WS for parry
    if (weaponHasQuality(weapon, 'defensive')) {
        totalModifier += WEAPON_QUALITY_EFFECTS.defensive.parryBonus;
    }

    // Balanced: +10 WS for parry
    if (weaponHasQuality(weapon, 'balanced')) {
        totalModifier += WEAPON_QUALITY_EFFECTS.balanced.parryBonus;
    }

    // Unbalanced: -10 to parry attempts
    if (weaponHasQuality(weapon, 'unbalanced')) {
        totalModifier += WEAPON_QUALITY_EFFECTS.unbalanced.parryPenalty;
    }

    return totalModifier;
}

/**
 * Check if weapon can parry.
 *
 * @param {Item} weapon - The weapon to check
 * @returns {boolean} True if weapon can be used to parry
 */
export function canWeaponParry(weapon: QualityItem | null | undefined): boolean {
    if (!weapon) return false;
    return !weaponHasQuality(weapon, 'unwieldy');
}

/**
 * Check whether an attacker's weapon prevents the defender from parrying.
 * Flexible weapons (e.g. whips, chains) cannot be parried by any defender
 * regardless of the defender's own weapon. Mirrors the wielder-side
 * `cannotParry` check on Unwieldy.
 */
export function attackerWeaponPreventsParry(attackerWeapon: QualityItem | null | undefined): boolean {
    if (!attackerWeapon) return false;
    return weaponHasQuality(attackerWeapon, 'flexible');
}

/**
 * Get parry penalty for the attacker's weapon (when being parried).
 * Some qualities (like Fast) impose penalties on enemies trying to parry.
 *
 * @param {Item} attackerWeapon - The weapon being parried against
 * @returns {number} Penalty to apply to defender's parry test
 */
export function getAttackerWeaponParryPenalty(attackerWeapon: QualityItem | null | undefined): number {
    if (!attackerWeapon) return 0;

    // Fast: Enemies suffer -20 to parry this weapon
    if (weaponHasQuality(attackerWeapon, 'fast')) {
        return WEAPON_QUALITY_EFFECTS.fast.enemyParryPenalty;
    }

    return 0;
}

/* -------------------------------------------- */
/*  Penetration Modifiers (Category C)          */
/* -------------------------------------------- */

/**
 * Calculate penetration modifiers from weapon qualities.
 * Called during damage calculation to apply quality effects to penetration.
 *
 * @param {Object} damageContext - Context object with weapon and range info
 * @param {Item} damageContext.weapon - The weapon item
 * @param {string} damageContext.rangeName - Current range name (e.g., "Short Range", "Point Blank")
 * @param {number} damageContext.basePenetration - Base penetration value
 * @returns {Object} Object with penetration modifiers { qualityName: value }
 */
export function calculateQualityPenetrationModifiers(damageContext: PenetrationContext): QualityModifierMap {
    const modifiers: QualityModifierMap = {};
    const { weapon, rangeName, basePenetration } = damageContext;

    if (!weapon || basePenetration === undefined) return modifiers;

    // Melta: Double penetration at short range (Point Blank or Short Range)
    if (weaponHasQuality(weapon, 'melta')) {
        const shortRanges = ['Point Blank', 'Short Range'];
        if (shortRanges.includes(rangeName ?? '')) {
            // Add the base penetration again to double it
            modifiers['Melta'] = basePenetration;
        }
    }

    // Razor Sharp: On 2+ DoS the weapon's penetration is doubled. We add
    // basePenetration as the modifier (so the dialog breakdown shows it as
    // a separate line), guarding against missing DoS context.
    if (weaponHasQuality(weapon, 'razor-sharp') && (damageContext.dos ?? 0) >= 2) {
        modifiers['Razor Sharp'] = basePenetration;
    }

    // Lance: Penetration is multiplied by DoS (minimum 1). 1 DoS yields no
    // bonus; 2 DoS doubles (×2); 3 DoS triples (×3); etc. We emit the
    // additive delta (basePen × (dos - 1)) so the existing additive-modifier
    // pipeline produces total = basePen + basePen*(dos-1) = basePen*dos.
    const lanceDos = damageContext.dos ?? 0;
    if (weaponHasQuality(weapon, 'lance') && lanceDos >= 2) {
        modifiers['Lance'] = basePenetration * (lanceDos - 1);
    }

    return modifiers;
}

/* -------------------------------------------- */
/*  Exotic Quality Effects (Phase 4)            */
/* -------------------------------------------- */

/**
 * Calculate damage modifiers from exotic weapon qualities.
 * Called during damage calculation to apply exotic quality effects.
 *
 * @param {Object} damageContext - Context object with weapon and actor info
 * @param {Item} damageContext.weapon - The weapon item
 * @param {Actor} damageContext.actor - The actor wielding the weapon
 * @param {Actor} damageContext.target - The target actor (if any)
 * @param {number} damageContext.baseDamage - Base damage value
 * @returns {Object} Object with damage modifiers { qualityName: value }
 */
export function calculateExoticQualityDamageModifiers(damageContext: ExoticDamageContext): QualityDamageModifierMap {
    const modifiers: QualityDamageModifierMap = {};
    const { weapon, actor, target } = damageContext;

    if (!weapon || !actor) return modifiers;

    // Force: Psyker adds Psy Rating to damage
    if (weaponHasQuality(weapon, 'force')) {
        const psyRating = actor.system.psyker?.psyRating ?? 0;
        if (psyRating > 0) {
            modifiers['Force (Psy Rating)'] = psyRating;
        }
    }

    // Witch-Edge: Eldar wielders add Strength Bonus twice (total: 2x SB)
    // Note: Standard SB is already added for melee weapons, so we add it once more
    if (weaponHasQuality(weapon, 'witch-edge')) {
        const isEldar =
            actor.system.species?.toLowerCase().includes('eldar') === true ||
            actor.system.traits?.some((t: { name?: string }) => t.name?.toLowerCase().includes('eldar') === true) === true;
        if (isEldar && weapon.system?.isMeleeWeapon === true) {
            const strengthBonus = actor.system.characteristics.strength?.bonus ?? 0;
            modifiers['Witch-Edge (Extra SB)'] = strengthBonus;
        }
    }

    // Daemonbane: +2d10 damage against Daemons
    if (weaponHasQuality(weapon, 'daemonbane') && target) {
        const isDaemon =
            target.system.traits?.some(
                (t: { name?: string }) => t.name?.toLowerCase().includes('daemon') === true || t.name?.toLowerCase().includes('daemonic') === true,
            ) === true || target.system.species?.toLowerCase().includes('daemon') === true;

        if (isDaemon) {
            modifiers['Daemonbane (vs Daemon)'] = '2d10';
        }
    }

    return modifiers;
}

/**
 * Check if weapon ignores armor due to Warp Weapon quality.
 * Returns true if armor should be ignored (for non-warded armor).
 *
 * @param {Item} weapon - The weapon item
 * @param {Item} armor - The armor item (if any)
 * @returns {boolean} True if weapon ignores this armor
 */
export function weaponIgnoresArmor(weapon: QualityItem | null | undefined, armor: QualityItem | null | undefined): boolean {
    if (!weapon || !armor) return false;

    // Warp Weapon: Ignores non-warded armor
    if (weaponHasQuality(weapon, 'warp-weapon')) {
        // Check if armor is warded
        const isWarded = armor.system?.special?.has('warded') === true || armor.system?.effectiveSpecial?.has('warded') === true;
        return !isWarded; // Ignore if NOT warded
    }

    return false;
}

/**
 * Get Righteous Fury threshold for weapon.
 * Returns the damage die value that triggers Righteous Fury.
 *
 * @param {Item} weapon - The weapon item
 * @returns {number} RF threshold (standard is 10)
 */
export function getRighteousFuryThreshold(weapon: QualityItem | null | undefined): number {
    if (!weapon) return 10; // Standard RF threshold

    // Gauss: RF on 9-10
    if (weaponHasQuality(weapon, 'gauss')) {
        return WEAPON_QUALITY_EFFECTS.gauss.rfThreshold;
    }

    // Vengeful: RF on 8-10 (most permissive, check last)
    if (weaponHasQuality(weapon, 'vengeful')) {
        return WEAPON_QUALITY_EFFECTS.vengeful.rfThreshold;
    }

    return 10; // Standard RF threshold
}

/**
 * Check if a damage die result triggers Righteous Fury for this weapon.
 *
 * @param {Item} weapon - The weapon item
 * @param {number} dieResult - The d10 damage die result
 * @returns {boolean} True if this triggers RF
 */
export function checkRighteousFury(weapon: QualityItem | null | undefined, dieResult: number): boolean {
    const threshold = getRighteousFuryThreshold(weapon);
    return dieResult >= threshold;
}

/* -------------------------------------------- */
/*  Integration Helpers                         */
/* -------------------------------------------- */

/**
 * Apply quality modifiers to roll data.
 * Called during roll preparation to integrate quality effects.
 *
 * @param {WeaponRollData} rollData - The weapon roll data
 */
export function applyQualityModifiersToRollData(rollData: WeaponRollData): void {
    // Get quality modifiers
    const qualityModifiers = calculateQualityAttackModifiers(rollData);

    Object.assign(rollData.specialModifiers, qualityModifiers);
}

/**
 * Get weapon quality summary for display.
 * Returns human-readable descriptions of active quality effects.
 *
 * @param {Item} weapon - The weapon item
 * @param {string} context - Context for summary ('attack', 'parry', 'damage', 'all')
 * @returns {string[]} Array of quality effect descriptions
 */
export function getWeaponQualitySummary(weapon: QualityItem | null | undefined, context: QualitySummaryContext = 'all'): string[] {
    const summary: string[] = [];

    if (!weapon) return summary;

    // Filter qualities by context
    const relevantQualities = Object.entries(WEAPON_QUALITY_EFFECTS).filter(([_key, def]) => {
        if (context === 'all') return true;
        return def.type === context;
    });

    // Build summary for active qualities
    for (const [qualityKey, qualityDef] of relevantQualities) {
        if (weaponHasQuality(weapon, qualityKey)) {
            summary.push(`${qualityKey.capitalize()}: ${qualityDef.description}`);
        }
    }

    return summary;
}

/* -------------------------------------------- */
/*  Phase 6 pure resolvers (#57 completion)     */
/* -------------------------------------------- */

/** Range-band keys used by `resolveScatterRangeBand`. */
export type ScatterRangeBand = 'Point Blank' | 'Short Range' | 'Standard Range' | 'Long Range' | 'Extreme Range';

/**
 * Resolve the Scatter quality's signed damage delta for the current range.
 * Replaces the inline `damage-data.ts:333-341` block with a pure table lookup
 * so the per-band values can be unit-tested without standing up an actor.
 */
export function resolveScatterRangeBand(rangeName: string | undefined): number {
    if (rangeName === undefined) return 0;
    const bands = WEAPON_QUALITY_EFFECTS.scatter.rangeBands;
    const SCATTER_BAND_MAP: Record<ScatterRangeBand, number> = {
        'Point Blank': bands.pointBlank,
        'Short Range': bands.shortRange,
        'Standard Range': bands.standardRange,
        'Long Range': bands.longRange,
        'Extreme Range': bands.extremeRange,
    };
    return rangeName in SCATTER_BAND_MAP ? SCATTER_BAND_MAP[rangeName as ScatterRangeBand] : 0;
}

/**
 * Resolve the save target value for a quality whose hit-effect imposes a
 * per-level penalty on the defender's characteristic test. Used by
 * Concussive (X), Hallucinogenic (X), Snare (X), Toxic (X).
 *
 * Concussive (3) on a defender with Toughness 40 →
 *   resolveHitEffectSaveTarget({ characteristicTotal: 40, key: 'concussive', level: 3 })
 *   = 40 + (3 × -10) = 10
 */
export function resolveHitEffectSaveTarget(opts: { characteristicTotal: number; key: keyof typeof WEAPON_QUALITY_EFFECTS; level: number }): number {
    const entry = WEAPON_QUALITY_EFFECTS[opts.key] as { hitEffect?: WeaponQualityHitEffect } | undefined;
    const penalty = entry?.hitEffect?.saveTargetPenaltyPerLevel ?? 0;
    const safeLevel = Math.max(0, Math.trunc(opts.level));
    const total = Math.max(0, Math.trunc(opts.characteristicTotal));
    return Math.max(0, total + penalty * safeLevel);
}

/**
 * Stun-duration payload from Shocking (RAW: half DoF, round up) or
 * Concussive (RAW: 1 round per DoF). Pure: caller passes the DoF and key.
 */
export function resolveStunDuration(opts: { dof: number; key: 'shocking' | 'concussive' }): number {
    const dof = Math.max(0, Math.trunc(opts.dof));
    if (opts.key === 'shocking') return Math.ceil(dof / 2);
    return dof;
}

/**
 * Lance penetration multiplier. Returns the **additive** delta the engine
 * adds on top of `basePenetration` so total = basePen × DoS. Mirrors the
 * inline `calculateQualityPenetrationModifiers` Lance branch but exposed
 * as a standalone helper for chat-card display layers.
 */
export function resolveLanceBonus(basePenetration: number, dos: number): number {
    const pen = Math.max(0, Math.trunc(basePenetration));
    const safeDos = Math.max(1, Math.trunc(dos));
    return pen * (safeDos - 1);
}

/**
 * Primitive (X) cap: a damage die rolling above X is treated as X.
 * Returns the signed adjustment the engine adds to the die total
 * (negative when the die exceeded the cap, 0 otherwise). Pure mirror of
 * the inline `damage-data.ts:301-307` branch.
 */
export function resolvePrimitiveDamageAdjust(dieResult: number, level: number): number {
    const die = Math.max(0, Math.trunc(dieResult));
    const cap = Math.max(0, Math.trunc(level));
    return die > cap ? cap - die : 0;
}

/**
 * Graviton bonus damage equal to the struck location's Armour Points.
 * Pure: takes the armour-point reading and returns the additive delta.
 * Returns 0 when armour is missing or non-positive.
 */
export function resolveGravitonBonusDamage(armourPoints: number | undefined): number {
    if (armourPoints === undefined) return 0;
    const ap = Math.trunc(armourPoints);
    return ap > 0 ? ap : 0;
}

/**
 * Haywire field radius (metres) for a given X level: X × 10 metres.
 */
export function resolveHaywireRadius(level: number): number {
    const safeLevel = Math.max(0, Math.trunc(level));
    return safeLevel * 10;
}

/**
 * Blast / Smoke template radius (metres). Per RAW the variable is just X,
 * but the helper guards against bogus negatives for safety.
 */
export function resolveTemplateRadius(level: number): number {
    return Math.max(0, Math.trunc(level));
}

/**
 * Maximal mode-switch outcome. RAW: +1d10 damage, +2 penetration, and the
 * weapon gains Overheats this shot plus Recharge next round. The dice are
 * the caller's to roll; this helper returns the configured deltas and the
 * follow-up tags the engine consumer should apply.
 */
export function resolveMaximalEffect(): {
    bonusPenetration: number;
    bonusDamageDice: string;
    appliesOverheats: boolean;
    triggersRecharge: boolean;
} {
    return {
        bonusPenetration: WEAPON_QUALITY_EFFECTS.maximal.maximalPenetrationBonus,
        bonusDamageDice: WEAPON_QUALITY_EFFECTS.maximal.maximalDamageDice,
        appliesOverheats: true,
        triggersRecharge: WEAPON_QUALITY_EFFECTS.maximal.triggersRecharge,
    };
}

/**
 * Power Field on a successful parry destroys the parried weapon unless it
 * also carries Power Field or Force. Pure check used by the parry
 * resolution flow and chat-card renderer.
 */
export function resolvePowerFieldParryDestroys(defenderWeapon: QualityItem | null | undefined, attackerWeapon: QualityItem | null | undefined): boolean {
    if (!defenderWeapon || !attackerWeapon) return false;
    if (!weaponHasQuality(defenderWeapon, 'power-field')) return false;
    // Power Field and Force weapons resist destruction.
    if (weaponHasQuality(attackerWeapon, 'power-field') || weaponHasQuality(attackerWeapon, 'force')) {
        return false;
    }
    return true;
}

/**
 * Crippling (X) Half-Action penalty: each round the Crippled target takes
 * more than a Half Action they suffer X damage ignoring Armour and
 * Toughness. Returns the per-tick damage value.
 */
export function resolveCripplingTickDamage(level: number): number {
    return Math.max(0, Math.trunc(level));
}

/**
 * Indirect (X) BS penalty applied to the firer (positive number → penalty).
 */
export function resolveIndirectPenalty(level: number): number {
    const n = Math.max(0, Math.trunc(level));
    return n === 0 ? 0 : n * -10;
}

/* -------------------------------------------- */
/*  Export for External Integration             */
/* -------------------------------------------- */

/**
 * Main integration point for weapon quality effects.
 * Provides all Phase 1-4 quality handlers in one object.
 */
export const WeaponQualityEffects = {
    // Constants
    EFFECTS: WEAPON_QUALITY_EFFECTS,

    // Quality checks
    weaponHasQuality,
    rollDataHasQuality,

    // Attack modifiers
    calculateQualityAttackModifiers,
    applyQualityModifiersToRollData,

    // Parry modifiers
    getWeaponParryModifier,
    canWeaponParry,
    getAttackerWeaponParryPenalty,

    // Penetration modifiers
    calculateQualityPenetrationModifiers,

    // Exotic quality handlers (Phase 4)
    calculateExoticQualityDamageModifiers,
    weaponIgnoresArmor,
    getRighteousFuryThreshold,
    checkRighteousFury,

    // Display helpers
    getWeaponQualitySummary,

    // Phase 6 pure resolvers (#57 completion)
    resolveScatterRangeBand,
    resolveHitEffectSaveTarget,
    resolveStunDuration,
    resolveLanceBonus,
    resolvePrimitiveDamageAdjust,
    resolveGravitonBonusDamage,
    resolveHaywireRadius,
    resolveTemplateRadius,
    resolveMaximalEffect,
    resolvePowerFieldParryDestroys,
    resolveCripplingTickDamage,
    resolveIndirectPenalty,
};

export default WeaponQualityEffects;
