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

// The weapon, actor and roll-data shapes below are the structural surface these
// resolvers read, declared here rather than imported from `rolls/roll-data.ts` /
// `types/global.d.ts`: those type edges tied this leaf rules module into the
// roll ↔ action-manager import cycle that everything consuming it then joined.
import type { WeaponQualityDieOpKind, WeaponQualityDieOpPhase } from '../data/item/weapon-quality-mechanics.ts';
import type { I18nKey } from '../types/i18n-keys';
import { parseQualityLevel } from '../utils/quality-id.ts';
import { nonNegInt } from './_num.ts';
import { getWeaponQualityMechanics, getWeaponQualityMechanicsForId } from './weapon-quality-payloads.ts';

type AttackSpecialLike = {
    name?: string;
};

/** An embedded item as {@link weaponHasQuality} reads it: an attack special, matched by name. */
type QualityEmbeddedItem = {
    name: string;
    isAttackSpecial: boolean;
};

type QualityItem = {
    name?: string;
    items?: Iterable<QualityEmbeddedItem>;
    isAttackSpecial?: boolean;
    system?: {
        enabled?: boolean;
        special?: Set<string>;
        effectiveSpecial?: Set<string>;
        isMeleeWeapon?: boolean;
    };
};

/** A weapon roll as the attack-modifier resolvers read it (`rolls/roll-data.ts` WeaponRollData). */
type QualityRollData = {
    weapon: QualityItem;
    attackSpecials: AttackSpecialLike[];
    modifiers: Record<string, number>;
    specialModifiers: Record<string, number>;
};

/** Righteous Fury triggers on a natural 10 unless a quality widens it. */
const STANDARD_RF_THRESHOLD = 10;

/** Qualities whose payload (or rating) lowers the Righteous Fury threshold. */
const RF_THRESHOLD_QUALITIES = ['gauss', 'vengeful'] as const;

type QualityActor = {
    system: {
        species?: string;
        traits?: Array<{ name?: string }>;
        psyker?: {
            psyRating?: number;
        };
        characteristics: {
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

/** Stable ids of the exotic quality damage contributions. */
export const EXOTIC_DAMAGE_MODIFIER_IDS = ['force', 'witchEdge', 'daemonbane'] as const;

type ExoticDamageModifierId = (typeof EXOTIC_DAMAGE_MODIFIER_IDS)[number];

/** Exotic quality damage contributions by stable id (a number, or a dice formula). */
type QualityDamageModifierMap = Partial<Record<ExoticDamageModifierId, number | string>>;

/** Langpack key of the label each exotic quality damage contribution shows under on the damage card. */
export const EXOTIC_DAMAGE_MODIFIER_LABEL_KEYS: Readonly<Record<ExoticDamageModifierId, I18nKey>> = {
    force: 'WH40K.Weapon.QualityModifier.Force',
    witchEdge: 'WH40K.Weapon.QualityModifier.WitchEdge',
    daemonbane: 'WH40K.Weapon.QualityModifier.Daemonbane',
};

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
    if (findWeaponQualityId(weapon, normalizedName) !== null) return true;

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
 * The quality id a weapon carries for `qualityName` — the bare id (`tearing`) or a
 * rated one (`vengeful-9`, `blast-10+1d10`) whose base id matches — or null.
 * Checks `effectiveSpecial` (includes craftsmanship-derived qualities) before the
 * base `special` set. Pack weapons store rated qualities only as rated ids, so an
 * exact-id lookup alone never matched them.
 */
function findWeaponQualityId(weapon: QualityItem, qualityName: string): string | null {
    for (const ids of [weapon.system?.effectiveSpecial, weapon.system?.special]) {
        if (ids === undefined) continue;
        if (ids.has(qualityName)) return qualityName;
        for (const id of ids) {
            if (parseQualityLevel(id).baseId === qualityName) return id;
        }
    }
    return null;
}

/** The fixed rating of a weapon's rated quality (`vengeful-9` → 9), or null when unrated or absent. */
function weaponQualityLevel(weapon: QualityItem, qualityName: string): number | null {
    const id = findWeaponQualityId(weapon, qualityName);
    return id === null ? null : parseQualityLevel(id).level;
}

/**
 * Check if roll data has a specific attack special.
 * Helper function that checks the rollData.attackSpecials array.
 *
 * @param {RollData} rollData - The roll data
 * @param {string} qualityName - Quality name to check
 * @returns {boolean} True if the quality is present in attackSpecials
 */
export function rollDataHasQuality(rollData: Pick<QualityRollData, 'attackSpecials'>, qualityName: string): boolean {
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
function calculateQualityAttackModifiers(rollData: QualityRollData): QualityModifierMap {
    const modifiers: QualityModifierMap = {};
    const weapon = rollData.weapon;

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

    // Twin-linked: "+20 to hit when fired" (DH2 / RT Armoury) — every firing
    // mode, not only single shots. The bonus is the quality doc's `attackBonus`.
    // The "additional hit on 2+ DoS" half lives in `action-data.ts` since it
    // manipulates `damageData.additionalHits` rather than the to-hit roll.
    if (weaponHasQuality(weapon, 'twin-linked')) {
        modifiers['Twin-Linked'] = getWeaponQualityMechanics('twin-linked')?.attackBonus ?? 0;
    }

    return modifiers;
}

/* -------------------------------------------- */
/*  Parry Modifiers (Category B)                */
/* -------------------------------------------- */

/** One quality's modifier on a Parry made with the weapon that carries it. */
export interface ParryQualityModifier {
    /** The quality id as the weapon carries it (`balanced`, `defensive`, …). */
    readonly quality: string;
    readonly value: number;
}

/**
 * The modifiers a weapon's own qualities put on a Parry made with it (#414), one
 * per quality so each is a sourced row on the test. Every line prints the same
 * three: Balanced "+10 bonus to Weapon Skill tests made to Parry", Defensive "+15
 * bonus to tests made when used to Parry", Unbalanced "–10 penalty when used to
 * Parry". The values are the qualities' authored `parryBonus` / `parryPenalty`,
 * resolved for the wielder's line — no quality is named here. (Unwieldy, which
 * cannot parry at all, is {@link canWeaponParry}.)
 * @param {QualityItem | null | undefined} weapon  The weapon the Parry is made with.
 * @param {string} [systemId]  The wielder's game line.
 * @returns {ParryQualityModifier[]}  The non-zero modifiers, in the weapon's quality order.
 */
export function weaponParryModifiers(weapon: QualityItem | null | undefined, systemId?: string): ParryQualityModifier[] {
    const ids = weapon?.system?.effectiveSpecial ?? weapon?.system?.special;
    if (ids === undefined) return [];
    const modifiers: ParryQualityModifier[] = [];
    for (const quality of ids) {
        const mechanics = getWeaponQualityMechanicsForId(quality, systemId);
        const value = (mechanics?.parryBonus ?? 0) + (mechanics?.parryPenalty ?? 0);
        if (value !== 0) modifiers.push({ quality, value });
    }
    return modifiers;
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
 * The penalty the attacker's weapon imposes on a defender's Parry (#414). Fast:
 * "Opponents that would Parry an attack against a weapon with the Fast quality
 * take a –20 penalty" (a DH1 supplement). The value is the quality's
 * authored `enemyParryPenalty`, resolved for the attacker's line.
 *
 * @param {Item} attackerWeapon - The weapon being parried against
 * @param {string} [systemId] - The attacker's game line
 * @returns {number} Penalty to apply to defender's parry test
 */
export function getAttackerWeaponParryPenalty(attackerWeapon: QualityItem | null | undefined, systemId?: string): number {
    if (!attackerWeapon) return 0;

    if (weaponHasQuality(attackerWeapon, 'fast')) {
        return getWeaponQualityMechanics('fast', systemId)?.enemyParryPenalty ?? 0;
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
            modifiers.force = psyRating;
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
            modifiers.witchEdge = strengthBonus;
        }
    }

    // Daemonbane: +2d10 damage against Daemons
    if (weaponHasQuality(weapon, 'daemonbane') && target) {
        const isDaemon =
            target.system.traits?.some(
                (t: { name?: string }) => t.name?.toLowerCase().includes('daemon') === true || t.name?.toLowerCase().includes('daemonic') === true,
            ) === true || target.system.species?.toLowerCase().includes('daemon') === true;

        if (isDaemon) {
            modifiers.daemonbane = '2d10';
        }
    }

    return modifiers;
}

/** A worn armour piece as the Warp Weapon check reads it: its special property ids. */
export interface WardableArmour {
    readonly properties: Iterable<string>;
}

/** An owned item as {@link armourCoveringLocation} reads it. */
export interface WornArmourCandidate {
    readonly type: string;
    /** An armour item's system (`data/item/armour.ts`): equip state, coverage and special properties are schema-required. */
    readonly system: { readonly state: { readonly equipped: boolean }; readonly coverage: Iterable<string>; readonly properties: Iterable<string> };
}

/** A location as an upper-cased, space-free key, so `Right Arm`, `rightArm` and `RIGHTARM` agree. */
function locationKey(location: string): string {
    return location.replace(/\s/g, '').toUpperCase();
}

/**
 * The worn (equipped) armour pieces that cover a hit location.
 * @param {Iterable<WornArmourCandidate>} items  The target's owned items.
 * @param {string} location  The struck location (`body`, `Right Arm`, …).
 * @returns {WardableArmour[]}  The covering pieces' properties.
 */
export function armourCoveringLocation(items: Iterable<WornArmourCandidate>, location: string): WardableArmour[] {
    const key = locationKey(location);
    const pieces: WardableArmour[] = [];
    for (const item of items) {
        // Only an armour item carries coverage; the type check comes first.
        if (item.type !== 'armour' || !item.system.state.equipped) continue;
        const coverage = Array.from(item.system.coverage, locationKey);
        if (coverage.includes('ALL') || coverage.includes(key)) pieces.push({ properties: item.system.properties });
    }
    return pieces;
}

/**
 * The armour property ids that ward against the Warp, read off the armour-property
 * vocabulary's `wardsAgainstWarp` flags.
 * @param {Readonly<Record<string, { wardsAgainstWarp?: true }>>} properties  The armour-property vocabulary.
 * @returns {Set<string>}  The warding property ids.
 */
export function warpWardingProperties(properties: Readonly<Record<string, { readonly wardsAgainstWarp?: true }>>): Set<string> {
    return new Set(
        Object.entries(properties)
            .filter(([, property]) => property.wardsAgainstWarp === true)
            .map(([id]) => id),
    );
}

/**
 * Whether a weapon ignores the armour (and cover) at the struck location (#414).
 *
 * Warp Weapon, every line: the attack is "able to ignore such mundane things as
 * armour or cover … unless the armour is created from psychoactive materials or
 * is somehow warded against the Warp" (DH2, OW; DH1 / DW / RT: "carries the holy
 * quality"; BC: "armour specially warded work[s] normally"). So the armour holds
 * when ANY piece covering the location carries a warding property; with no
 * warded piece (or no armour at all) the hit ignores it.
 * @param {QualityItem | null | undefined} weapon  The attacking weapon.
 * @param {readonly WardableArmour[]} coveringArmour  The worn armour covering the struck location.
 * @param {ReadonlySet<string>} wardingProperties  The armour property ids that ward against the Warp.
 * @returns {boolean}  True when the hit ignores the location's armour and cover.
 */
export function weaponIgnoresArmor(
    weapon: QualityItem | null | undefined,
    coveringArmour: readonly WardableArmour[],
    wardingProperties: ReadonlySet<string>,
): boolean {
    if (!weapon || !weaponHasQuality(weapon, 'warp-weapon')) return false;
    const warded = coveringArmour.some((piece) => Array.from(piece.properties).some((property) => wardingProperties.has(property)));
    return !warded;
}

/**
 * Get Righteous Fury threshold for weapon.
 * Returns the damage die value that triggers Righteous Fury.
 *
 * @param {Item} weapon - The weapon item
 * @returns {number} RF threshold (standard is 10)
 */
export function getRighteousFuryThreshold(weapon: QualityItem | null | undefined): number {
    if (!weapon) return STANDARD_RF_THRESHOLD;

    // Each RF-widening quality the weapon carries offers a threshold; the most
    // permissive (lowest) wins. A rated quality's own rating (Vengeful (9)) is its
    // threshold; an unrated one falls back to the compendium payload's default.
    let threshold = STANDARD_RF_THRESHOLD;
    for (const quality of RF_THRESHOLD_QUALITIES) {
        if (!weaponHasQuality(weapon, quality)) continue;
        const offered = weaponQualityLevel(weapon, quality) ?? getWeaponQualityMechanics(quality)?.rfThreshold;
        if (offered != null && offered < threshold) threshold = offered;
    }
    return threshold;
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
export function applyQualityModifiersToRollData(rollData: QualityRollData): void {
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
 * Proven (X) floor: a damage die rolling below X is treated as X.
 * Returns the signed adjustment the engine adds to the die total
 * (positive when the die fell short of the floor, 0 otherwise).
 *
 * Counterpart to {@link resolvePrimitiveDamageAdjust}. Both are per-DIE: with a
 * multi-die weapon each qualifying die contributes its own adjustment and the
 * engine sums them.
 */
export function resolveProvenDamageAdjust(dieResult: number, level: number): number {
    const die = nonNegInt(dieResult);
    const floor = nonNegInt(level);
    return die < floor ? floor - die : 0;
}

/* -------------------------------------------- */
/*  Die operations (#303)                       */
/* -------------------------------------------- */

/**
 * Minimal Foundry `Die`-term surface {@link applyKeepHighestToDie} mutates. Declared
 * structurally so the term surgery is unit-testable without standing up Foundry's
 * dice classes; `foundry.dice.terms.Die` satisfies it at runtime.
 */
export interface DieTermLike {
    number: number | null;
    modifiers: string[];
}

/**
 * A quality's `dieOps` entry with its threshold already resolved against the
 * weapon's `(X)` level, plus the provenance needed for the damage breakdown.
 */
export interface ResolvedDieOp {
    /** Display name of the quality that declared the operation (provenance). */
    quality: string;
    op: WeaponQualityDieOpKind;
    phase: WeaponQualityDieOpPhase;
    /** `keepHighest`: extra dice to append (always ≥ 1 on a resolved op). */
    extraDice: number;
    /** `floor` / `cap`: the effective threshold (always ≥ 1 on a resolved op). */
    threshold: number;
    /** Key the post-evaluation adjustment accumulates under in the hit's modifier map. */
    modifierKey: string;
}

/** An attack special as it appears on roll data: display name plus optional `(X)` level. */
interface AttackSpecialWithLevel {
    name: string;
    level?: number;
}

/**
 * Collapse a quality display name to its pack identifier
 * (`Razor Sharp` → `razor-sharp`, `Primitive (X)` → `primitive-x`).
 */
export function weaponQualityIdentifierFromName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Resolve every die operation the weapon's attack specials declare, substituting each
 * quality's `(X)` level where the descriptor asks for it.
 *
 * Operations that would be inert or destructive are dropped here rather than at the
 * call site: a levelled `floor` / `cap` with no level in play would otherwise resolve
 * to a threshold of 0 and cap every damage die to nothing.
 */
export function collectWeaponQualityDieOps(specials: ReadonlyArray<AttackSpecialWithLevel>, systemId?: string): ResolvedDieOp[] {
    const resolved: ResolvedDieOp[] = [];
    for (const special of specials) {
        const identifier = weaponQualityIdentifierFromName(special.name);
        // A levelled quality is authored as a sibling `<id>-x` doc; a weapon carrying
        // the bare name resolves to whichever of the two the pack defines.
        const mechanics = getWeaponQualityMechanicsForId(identifier, systemId);
        if (mechanics === null) continue;
        for (const dieOp of mechanics.dieOps) {
            const modifierKey = dieOp.modifierKey === '' ? identifier : dieOp.modifierKey;
            if (dieOp.op === 'keepHighest') {
                const extraDice = nonNegInt(dieOp.extraDice ?? 0);
                if (extraDice === 0) continue;
                resolved.push({ quality: special.name, op: dieOp.op, phase: dieOp.phase, extraDice, threshold: 0, modifierKey });
                continue;
            }
            const threshold = dieOp.usesLevel ? nonNegInt(special.level ?? 0) : nonNegInt(dieOp.threshold ?? 0);
            if (threshold === 0) continue;
            resolved.push({ quality: special.name, op: dieOp.op, phase: dieOp.phase, extraDice: 0, threshold, modifierKey });
        }
    }
    return resolved;
}

/**
 * `keepHighest` term surgery: append `extraDice` dice to the term and keep the
 * ORIGINAL count, highest first — Tearing adds a damage die and drops the lowest
 * (RT rules).
 *
 * Idempotent: a term that already carries any `kh` modifier is left alone, so a
 * re-prepared roll (or a weapon whose formula authored its own `kh`) never stacks the
 * extra die twice. Returns whether the term was modified.
 */
export function applyKeepHighestToDie(die: DieTermLike, extraDice: number): boolean {
    if (die.modifiers.some((modifier) => modifier.startsWith('kh'))) return false;
    const keep = nonNegInt(die.number ?? 0);
    const extra = nonNegInt(extraDice);
    if (keep === 0 || extra === 0) return false;
    die.modifiers.push(`kh${keep}`);
    die.number = keep + extra;
    return true;
}

/**
 * Signed damage adjustment a resolved post-evaluation die operation contributes for
 * one rolled die. Dispatches to the pure per-quality resolvers so the arithmetic lives
 * in exactly one place; `keepHighest` is a pre-evaluation op and contributes nothing.
 */
export function resolveDieOpDamageAdjust(dieResult: number, dieOp: ResolvedDieOp): number {
    if (dieOp.op === 'floor') return resolveProvenDamageAdjust(dieResult, dieOp.threshold);
    if (dieOp.op === 'cap') return resolvePrimitiveDamageAdjust(dieResult, dieOp.threshold);
    return 0;
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
export function resolveMaximalEffect(systemId?: string): {
    bonusPenetration: number;
    bonusDamageDice: string;
    appliesOverheats: boolean;
    triggersRecharge: boolean;
} {
    // Scoped to the actor's line: the lines' Maximal rules differ (DW adds Overheats).
    const maximal = getWeaponQualityMechanics('maximal', systemId);
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
