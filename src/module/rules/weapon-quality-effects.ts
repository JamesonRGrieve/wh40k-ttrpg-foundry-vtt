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
    items?: Iterable<unknown>;
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
                bonus?: number;
            };
        };
    };
};

type PenetrationContext = {
    weapon?: QualityItem | null;
    rangeName?: string;
    basePenetration?: number;
};

type ExoticDamageContext = {
    weapon?: QualityItem | null;
    actor?: QualityActor | null;
    target?: QualityActor | null;
};

type QualityModifierMap = Record<string, number>;
type QualityDamageModifierMap = Record<string, number | string>;
type QualitySummaryContext = 'attack' | 'parry' | 'damage' | 'penetration' | 'righteous-fury' | 'all';

/* -------------------------------------------- */
/*  Quality Effect Constants                    */
/* -------------------------------------------- */

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
    if (weapon.items) {
        for (const item of weapon.items as Iterable<WH40KItemDocument>) {
            if (item.isAttackSpecial && item.name?.toLowerCase() === normalizedName) {
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
    if (rollData.attackSpecials == null) return false;
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
    const weapon = rollData.weapon;
    if (!weapon) return modifiers;

    // Accurate: +10 BS when using Aim action
    if (weaponHasQuality(weapon, 'accurate')) {
        if ((rollData.modifiers?.aim ?? 0) > 0) {
            modifiers['Accurate'] = WEAPON_QUALITY_EFFECTS.accurate.aimBonus;
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
            const strengthBonus = actor.system.characteristics?.strength?.bonus ?? 0;
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
    if (rollData.weapon == null) return;

    // Get quality modifiers
    const qualityModifiers = calculateQualityAttackModifiers(rollData);

    // Apply to specialModifiers (used in attack-specials.mjs pattern)
    if (!rollData.specialModifiers) {
        rollData.specialModifiers = {};
    }

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
};

export default WeaponQualityEffects;
