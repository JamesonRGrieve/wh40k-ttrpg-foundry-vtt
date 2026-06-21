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
import { nonNegInt } from './_num.ts';
import { getWeaponQualityMechanics } from './weapon-quality-payloads.ts';

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

/* -------------------------------------------- */
/*  Quality mechanics source (#303)             */
/* -------------------------------------------- */

/**
 * The weapon-quality mechanical payloads + effect text formerly lived here as the
 * hardcoded `WEAPON_QUALITY_EFFECTS` registry. They now live on the weaponQuality
 * compendium documents (`system.mechanics`, see `data/item/weapon-quality.ts`) and
 * are read at runtime through the by-identifier index in `weapon-quality-payloads.ts`
 * (Direction #7). The resolvers below check quality presence by name
 * (`weaponHasQuality`) and pull any payload values from `getWeaponQualityMechanics`.
 */
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
            modifiers['Accurate'] = getWeaponQualityMechanics('accurate')?.aimBonus ?? 0;
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
        totalModifier += getWeaponQualityMechanics('defensive')?.parryBonus ?? 0;
    }

    // Balanced: +10 WS for parry
    if (weaponHasQuality(weapon, 'balanced')) {
        totalModifier += getWeaponQualityMechanics('balanced')?.parryBonus ?? 0;
    }

    // Unbalanced: -10 to parry attempts
    if (weaponHasQuality(weapon, 'unbalanced')) {
        totalModifier += getWeaponQualityMechanics('unbalanced')?.parryPenalty ?? 0;
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
        return getWeaponQualityMechanics('fast')?.enemyParryPenalty ?? 0;
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
        const threshold = getWeaponQualityMechanics('gauss')?.rfThreshold;
        if (threshold != null) return threshold;
    }

    // Vengeful: RF on 8-10 (most permissive, check last)
    if (weaponHasQuality(weapon, 'vengeful')) {
        const threshold = getWeaponQualityMechanics('vengeful')?.rfThreshold;
        if (threshold != null) return threshold;
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

/* -------------------------------------------- */
/*  Phase 6 pure resolvers (#57 completion)     */
/* -------------------------------------------- */

/** Range-band keys used by `resolveScatterRangeBand`. */
type ScatterRangeBand = 'Point Blank' | 'Short Range' | 'Standard Range' | 'Long Range' | 'Extreme Range';

/**
 * Resolve the Scatter quality's signed damage delta for the current range.
 * Replaces the inline `damage-data.ts:333-341` block with a pure table lookup
 * so the per-band values can be unit-tested without standing up an actor.
 */
export function resolveScatterRangeBand(rangeName: string | undefined): number {
    if (rangeName === undefined) return 0;
    const bands = getWeaponQualityMechanics('scatter')?.rangeBands;
    const SCATTER_BAND_MAP: Record<ScatterRangeBand, number> = {
        'Point Blank': bands?.pointBlank ?? 0,
        'Short Range': bands?.shortRange ?? 0,
        'Standard Range': bands?.standardRange ?? 0,
        'Long Range': bands?.longRange ?? 0,
        'Extreme Range': bands?.extremeRange ?? 0,
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
export function resolveHitEffectSaveTarget(opts: { characteristicTotal: number; key: string; level: number }): number {
    const penalty = getWeaponQualityMechanics(opts.key)?.hitEffect.saveTargetPenaltyPerLevel ?? 0;
    const safeLevel = nonNegInt(opts.level);
    const total = nonNegInt(opts.characteristicTotal);
    return Math.max(0, total + penalty * safeLevel);
}

/**
 * Stun-duration payload from Shocking (RAW: half DoF, round up) or
 * Concussive (RAW: 1 round per DoF). Pure: caller passes the DoF and key.
 */
export function resolveStunDuration(opts: { dof: number; key: 'shocking' | 'concussive' }): number {
    const dof = nonNegInt(opts.dof);
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
    const pen = nonNegInt(basePenetration);
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
    const die = nonNegInt(dieResult);
    const cap = nonNegInt(level);
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
    const safeLevel = nonNegInt(level);
    return safeLevel * 10;
}

/**
 * Blast / Smoke template radius (metres). Per RAW the variable is just X,
 * but the helper guards against bogus negatives for safety.
 */
export function resolveTemplateRadius(level: number): number {
    return nonNegInt(level);
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
    const maximal = getWeaponQualityMechanics('maximal');
    return {
        bonusPenetration: maximal?.maximalPenetrationBonus ?? 0,
        bonusDamageDice: maximal?.maximalDamageDice ?? '',
        appliesOverheats: true,
        triggersRecharge: maximal?.triggersRecharge ?? false,
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
    return nonNegInt(level);
}

/**
 * Indirect (X) BS penalty applied to the firer (positive number → penalty).
 */
export function resolveIndirectPenalty(level: number): number {
    const n = nonNegInt(level);
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
