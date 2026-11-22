/**
 * @file Characteristic generation as each line's rulebook prints it (#760).
 *
 * Every line rolls 2d10 per characteristic and adds a base: 20 (DH1, DH2, OW, IM),
 * 25 (RT, BC humans) or 30 (DW, BC Chaos Space Marines). The origins' characteristic
 * modifiers then apply in one of two ways:
 * - `flat`: the modifier is added to the result (DH1's home-world columns are 20 ± 5).
 * - `keep-dice` (DH2): the origin's + characteristic rolls 3d10 and keeps the highest
 *   two, its − characteristic keeps the lowest two, and nothing is added.
 *
 * Point allocation is printed only by DH2: each characteristic starts at 25, the
 * origin's + and − start at 30 and 20, 60 points are spent, and no score may go
 * above 40. Every other line gets the same scheme as an unofficial option
 * (`pointBuy.raw` false).
 *
 * DH2 also prints an experienced variant: roll on 25, point-buy from 30, cap 45.
 *
 * Pure: the per-line values live in each game-system config (`characteristicGeneration`),
 * and the builder and Zephyrex VTT both read these functions.
 */

/** How an origin's characteristic modifier enters character generation. */
export type OriginModifierMode = 'flat' | 'keep-dice';

/** One line's characteristic generation rules. */
export interface CharacteristicGenerationRules {
    roll: {
        /** Dice rolled per characteristic. */
        dice: string;
        /** Added to every characteristic's dice. */
        base: number;
        /** How an origin's characteristic modifier applies to a rolled characteristic. */
        originModifiers: OriginModifierMode;
        /** For `keep-dice`: the dice an origin's + or − characteristic rolls, keeping two. */
        keepDice: string;
    };
    pointBuy: {
        /** Every characteristic's starting score, before the origin's modifier. */
        base: number;
        /** Points to distribute. */
        pool: number;
        /** No score may be raised above this by points. */
        cap: number;
        /** Whether the line's rulebook prints point allocation. */
        raw: boolean;
    };
    /** The rulebook's experienced-characters variant, when it prints one. */
    experienced: { rollBase: number; pointBuyBase: number; cap: number } | null;
}

/** The rules a line without its own characteristic generation falls back on. */
export const DEFAULT_CHARACTERISTIC_GENERATION: CharacteristicGenerationRules = {
    roll: { dice: '2d10', base: 25, originModifiers: 'flat', keepDice: '3d10' },
    pointBuy: { base: 25, pool: 60, cap: 40, raw: false },
    experienced: null,
};

/** Rules with a different roll base: the shape every line but DH2 needs. */
export function flatGeneration(rollBase: number): CharacteristicGenerationRules {
    return { ...DEFAULT_CHARACTERISTIC_GENERATION, roll: { ...DEFAULT_CHARACTERISTIC_GENERATION.roll, base: rollBase } };
}

/** The rules with the line's experienced variant applied; unchanged when it prints none. */
export function withExperienced(rules: CharacteristicGenerationRules): CharacteristicGenerationRules {
    const exp = rules.experienced;
    if (exp === null) return rules;
    return {
        ...rules,
        roll: { ...rules.roll, base: exp.rollBase },
        pointBuy: { ...rules.pointBuy, base: exp.pointBuyBase, cap: exp.cap },
    };
}

/** Whether an origin's characteristic modifier is added to a rolled characteristic (false when it changes the dice instead). */
export function originModifierAddsToRoll(rules: CharacteristicGenerationRules, originModifier: number): boolean {
    return rules.roll.originModifiers === 'flat' || originModifier === 0;
}

/**
 * The dice to roll for one characteristic, without the base: `2d10`, or for a
 * `keep-dice` line's + or − characteristic, `3d10kh2` or `3d10kl2`.
 */
export function characteristicDice(rules: CharacteristicGenerationRules, originModifier: number): string {
    if (originModifierAddsToRoll(rules, originModifier)) return rules.roll.dice;
    return `${rules.roll.keepDice}${originModifier > 0 ? 'kh2' : 'kl2'}`;
}

/**
 * The whole roll formula for one characteristic, with the base and any flat origin
 * modifier: `2d10 + 25`, `2d10 + 20 + 5`, `3d10kh2 + 20`.
 */
export function characteristicRollFormula(rules: CharacteristicGenerationRules, originModifier: number, base: number = rules.roll.base): string {
    const dice = characteristicDice(rules, originModifier);
    const flat = originModifierAddsToRoll(rules, originModifier) ? originModifier : 0;
    if (flat === 0) return `${dice} + ${base}`;
    return `${dice} + ${base} ${flat > 0 ? '+' : '-'} ${Math.abs(flat)}`;
}

/** A rolled characteristic's value: the base and the dice, plus the origin's modifier when the line adds it. */
export function rolledCharacteristic(rules: CharacteristicGenerationRules, base: number, diceTotal: number, originModifier: number): number {
    return base + diceTotal + (originModifierAddsToRoll(rules, originModifier) ? originModifier : 0);
}

/** A point-buy characteristic's starting score: the base plus the origin's modifier (DH2: + starts at 30, − at 20). */
export function pointBuyStart(base: number, originModifier: number): number {
    return base + originModifier;
}
