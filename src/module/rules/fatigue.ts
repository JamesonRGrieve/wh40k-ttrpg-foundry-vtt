/**
 * Fatigue system (#114) — per-system, homologated across all seven lines.
 *
 * The FFG/C7 lines split three ways at RAW, so a single wired model was wrong
 * for every one of them. Each line's config returns a {@link FatigueModelDef}
 * via `getFatigueModel()`; the world "fatigue mode" setting can override the
 * active model. The three models:
 *
 *   - `halving`   (DH1, DH2): a characteristic whose natural bonus is below the
 *                 current fatigue level counts as HALF its value (round up) for
 *                 all uses. Threshold = TB + WPB; unconscious past threshold for
 *                 (10 − TB) minutes, waking reverted to TB; death past 2×.
 *   - `flat`      (RT, DW, OW, BC): a SINGLE flat penalty (−10) for ANY fatigue —
 *                 extra levels add nothing. Threshold = TB; no fatigue-death.
 *   - `condition` (IM): a two-tier Fatigued Condition — Minor = Disadvantage,
 *                 Major = all Tests Very Hard (−30). No numeric threshold.
 *
 * Pure helpers only. The schema field lives on `creature.ts:fatigue`; the
 * `applyFatigue` method on base-actor handles persistence; `creature.ts`
 * applies the halving to effective characteristics during data prep, and the
 * roll dialog applies the flat/condition test modifier.
 */

import type { FatigueModel, FatigueModelDef } from '../config/game-systems/types.ts';
import { nonNegInt } from './_num.ts';

/** The world "fatigue mode" setting: force one model, or `auto` = each line's RAW default. */
export type FatigueMode = 'auto' | FatigueModel;

/**
 * Canonical rule set for each model — used when the world setting FORCES a mode,
 * and as the building blocks each per-system config composes its RAW default from.
 */
export const FATIGUE_MODES: Record<FatigueModel, FatigueModelDef> = {
    halving: { model: 'halving', threshold: 'tb+wpb', flatPenalty: 0, deathAtDoubleThreshold: true, wakeBehavior: 'revert-to-tb', fullRecoveryHours: 6 },
    flat: { model: 'flat', threshold: 'tb', flatPenalty: -10, deathAtDoubleThreshold: false, wakeBehavior: 'revert-to-tb', fullRecoveryHours: 6 },
    condition: { model: 'condition', threshold: 'none', flatPenalty: 0, deathAtDoubleThreshold: false, wakeBehavior: 'none', fullRecoveryHours: 6 },
};

/** Resolve the active fatigue rule set: the system default unless the world setting forces a model. */
export function resolveFatigueModel(systemDefault: FatigueModelDef, mode: FatigueMode): FatigueModelDef {
    return mode === 'auto' ? systemDefault : FATIGUE_MODES[mode];
}

export interface FatigueThresholdInput {
    /** Actor's Toughness bonus (tens digit). */
    toughnessBonus: number;
    /** Actor's Willpower bonus (tens digit). */
    willpowerBonus: number;
}

/** Fatigue threshold per the active model: TB, TB+WPB, or 0 (condition model has no threshold). */
export function getFatigueThreshold(input: FatigueThresholdInput, def: FatigueModelDef): number {
    if (def.threshold === 'none') return 0;
    const tb = nonNegInt(input.toughnessBonus);
    if (def.threshold === 'tb') return tb;
    return tb + nonNegInt(input.willpowerBonus);
}

export interface FatigueStateInput {
    /** Current fatigue level. */
    fatigueLevel: number;
    /** Actor's Toughness bonus. */
    toughnessBonus: number;
    /** Actor's Willpower bonus. */
    willpowerBonus: number;
}

/** Whether the actor is past the threshold → Unconscious for (10 − TB) minutes. False for the condition model. */
export function isFatigueUnconscious(input: FatigueStateInput, def: FatigueModelDef): boolean {
    if (def.threshold === 'none') return false;
    return nonNegInt(input.fatigueLevel) > getFatigueThreshold(input, def);
}

/** Whether the actor has passed 2× threshold → death. Only the halving-model lines have fatigue-death. */
export function isFatigueDeath(input: FatigueStateInput, def: FatigueModelDef): boolean {
    if (!def.deathAtDoubleThreshold || def.threshold === 'none') return false;
    return nonNegInt(input.fatigueLevel) > getFatigueThreshold(input, def) * 2;
}

/** Unconsciousness duration in minutes: 10 − Toughness bonus, floored at 1. */
export function getFatigueUnconsciousMinutes(toughnessBonus: number): number {
    return Math.max(1, 10 - nonNegInt(toughnessBonus));
}

/**
 * Whether a characteristic is halved by the current fatigue level (halving model
 * RAW): a characteristic whose BONUS is lower than the fatigue count is halved.
 *   fatigue 4, bonus 3 → halved; fatigue 4, bonus 4 → not; fatigue 0 → never.
 */
export function isCharacteristicHalvedByFatigue(characteristicBonus: number, fatigueLevel: number): boolean {
    const level = nonNegInt(fatigueLevel);
    if (level === 0) return false;
    return nonNegInt(characteristicBonus) < level;
}

/**
 * Flat-model test penalty (#114): a SINGLE flat penalty for ANY fatigue level
 * (RT/DW/OW/BC RAW — extra levels add no further penalty). 0 for other models or
 * when unfatigued. Returns a non-positive number.
 */
export function getFlatFatiguePenalty(fatigueLevel: number, def: FatigueModelDef): number {
    if (def.model !== 'flat') return 0;
    return nonNegInt(fatigueLevel) >= 1 ? def.flatPenalty : 0;
}

export interface HalvedCharacteristic {
    effectiveValue: number;
    effectiveBonus: number;
}

/**
 * Full-effective-value fatigue halving (#114, DH1/DH2 RAW). A fatigued
 * characteristic (natural bonus < fatigue level) counts as HALF its value
 * (rounded up) for all uses. Returns the halved effective value + derived bonus,
 * or `null` when the characteristic is not fatigued (caller keeps its fields).
 *
 * @param effectiveValue post-modifier effective value (`char.effectiveValue`)
 * @param naturalBonus   the characteristic's own bonus (`char.bonus`) — the RAW
 *                       "characteristic bonus" compared against the fatigue level
 * @param unnatural      unnatural multiplier (≥ 2 multiplies the tens-digit bonus)
 * @param bonusModifier  the "+X Bonus" channel added on top of the natural bonus
 * @param fatigueLevel   current fatigue level
 */
export function getFatigueHalvedCharacteristic(
    effectiveValue: number,
    naturalBonus: number,
    unnatural: number,
    bonusModifier: number,
    fatigueLevel: number,
): HalvedCharacteristic | null {
    if (!isCharacteristicHalvedByFatigue(naturalBonus, fatigueLevel)) return null;
    const halvedValue = Math.ceil(nonNegInt(effectiveValue) / 2);
    const tensBonus = Math.floor(halvedValue / 10);
    const un = nonNegInt(unnatural);
    const nat = un >= 2 ? tensBonus * un : tensBonus;
    return { effectiveValue: halvedValue, effectiveBonus: nat + Math.trunc(bonusModifier) };
}

/** IM Fatigued-Condition tiers (the condition model has no numeric levels). */
export type FatigueConditionTier = 'none' | 'minor' | 'major';

/**
 * Map the numeric fatigue track onto IM's two-tier Fatigued Condition (#114):
 * 0 = none, 1 = Minor, 2+ = Major.
 */
export function getFatigueConditionTier(fatigueLevel: number): FatigueConditionTier {
    const level = nonNegInt(fatigueLevel);
    if (level <= 0) return 'none';
    return level === 1 ? 'minor' : 'major';
}

/**
 * Minor approximates IM's Disadvantage (roll-twice-take-worse) as a flat −10 —
 * the roll engine has no Disadvantage die mechanic yet (tracked as a follow-up).
 * Major is Very Hard (−30), which IS a flat difficulty step.
 */
const IM_FATIGUE_MINOR_MODIFIER = -10;
const IM_FATIGUE_MAJOR_MODIFIER = -30;

/** IM per-tier flat test modifier. */
export function getFatigueConditionModifier(fatigueLevel: number): number {
    const tier = getFatigueConditionTier(fatigueLevel);
    if (tier === 'major') return IM_FATIGUE_MAJOR_MODIFIER;
    if (tier === 'minor') return IM_FATIGUE_MINOR_MODIFIER;
    return 0;
}

/**
 * The flat test modifier fatigue imposes on the active roll, dispatched by model
 * (#114): `flat` → the single flat penalty; `condition` → the IM tier modifier;
 * `halving` → 0 here (halving is applied to the tested characteristic's effective
 * value during data prep, not as a flat roll modifier). Non-positive; 0 unfatigued.
 */
export function getFatigueTestModifier(fatigueLevel: number, def: FatigueModelDef): number {
    if (def.model === 'flat') return getFlatFatiguePenalty(fatigueLevel, def);
    if (def.model === 'condition') return getFatigueConditionModifier(fatigueLevel);
    // halving: applied to the tested characteristic's effective value in data prep.
    return 0;
}

/**
 * Fatigue level remaining after a rest (#114): 1 level removed per hour, and a
 * full `def.fullRecoveryHours` of continuous rest removes ALL remaining fatigue.
 */
export function getFatigueAfterRest(currentLevel: number, hoursOfRest: number, def: FatigueModelDef): number {
    const level = nonNegInt(currentLevel);
    const hours = nonNegInt(hoursOfRest);
    if (hours >= def.fullRecoveryHours) return 0;
    return Math.max(0, level - hours);
}

/** Fatigue level after waking from fatigue-unconsciousness, per the line's wake rule (#114). */
export function getFatigueAfterWaking(currentLevel: number, toughnessBonus: number, def: FatigueModelDef): number {
    const level = nonNegInt(currentLevel);
    if (def.wakeBehavior === 'revert-to-tb') return Math.min(level, nonNegInt(toughnessBonus));
    if (def.wakeBehavior === 'drop-one-level') return Math.max(0, level - 1);
    return level; // 'none'
}
