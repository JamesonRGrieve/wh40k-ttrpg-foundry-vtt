/**
 * Formula Evaluator Utility
 *
 * Evaluates origin path formulas for wounds and fate points.
 *
 * Wound Formula Examples:
 * - "2xTB+1d5+2" - Two times Toughness Bonus plus 1d5 plus 2
 * - "TB+1d5" - Toughness Bonus plus 1d5
 * - "3xWB+1d10" - Three times Willpower Bonus plus 1d10
 *
 * Fate Formula Examples:
 * - "(1-5|=2),(6-10|=3)" - Roll 1d10: 1-5=2 fate, 6-10=3 fate
 * - "(1-8|=3),(9-10|=4)" - Roll 1d10: 1-8=3 fate, 9-10=4 fate
 */

import type { WH40KBaseActorDocument } from '../types/global.d.ts';

type CharacteristicBonusKey =
    | 'toughness'
    | 'willpower'
    | 'strength'
    | 'agility'
    | 'intelligence'
    | 'perception'
    | 'fellowship'
    | 'weaponSkill'
    | 'ballisticSkill'
    | 'influence';

type FateCondition = {
    min: number;
    max: number;
    value: number;
};

/**
 * Evaluate a wounds formula with characteristic bonus references.
 *
 * @param {string} formula - The wounds formula (e.g., "2xTB+1d5+2")
 * @param {Actor} actor - The actor to evaluate for (provides characteristic bonuses)
 * @returns {number} Evaluated wounds value
 */
export function evaluateWoundsFormula(formula: string, actor: WH40KBaseActorDocument): number {
    if (!formula || typeof formula !== 'string') {
        return 0;
    }

    // Trim whitespace
    const trimmedFormula = formula.trim();
    if (trimmedFormula === '') return 0;

    try {
        // Replace characteristic bonus references with their values
        let evaluated = trimmedFormula;

        // Map of characteristic abbreviations to their full names
        const charMap: Record<string, CharacteristicBonusKey> = {
            TB: 'toughness',
            WB: 'willpower',
            SB: 'strength',
            AB: 'agility',
            IB: 'intelligence',
            PB: 'perception',
            FB: 'fellowship',
            WSB: 'weaponSkill',
            BSB: 'ballisticSkill',
            InfB: 'influence',
        };

        // Replace each characteristic bonus reference
        for (const [abbr, charName] of Object.entries(charMap)) {
            // Match patterns like "2xTB" or "TB" (with or without multiplier)
            const regex = new RegExp(`(\\d+)x${abbr}|${abbr}`, 'gi');
            evaluated = evaluated.replace(regex, (_match: string, multiplier?: string) => {
                const bonus = actor?.system?.characteristics?.[charName]?.bonus || 0;
                const mult = multiplier ? parseInt(multiplier, 10) : 1;
                return (bonus * mult).toString();
            });
        }

        // Now evaluate dice notation using Foundry's Roll class
        const roll = new Roll(evaluated).evaluateSync();
        const total = typeof roll.total === 'number' ? roll.total : 0;
        return Math.max(0, Math.floor(total));
    } catch (err) {
        console.error(`Failed to evaluate wounds formula "${trimmedFormula}":`, err);
        return 0;
    }
}

/**
 * Evaluate a fate formula with conditional ranges.
 *
 * @param {string} formula - The fate formula (e.g., "(1-5|=2),(6-10|=3)")
 * @returns {number} Evaluated fate threshold value
 */
export function evaluateFateFormula(formula: string): number {
    if (!formula || typeof formula !== 'string') {
        return 0;
    }

    // Trim whitespace
    const trimmedFormula = formula.trim();
    if (trimmedFormula === '') return 0;

    try {
        // Parse the conditional format: (range|=value),(range|=value),...
        // Example: "(1-5|=2),(6-10|=3)"

        const conditions: FateCondition[] = [];
        const conditionRegex = /\((\d+)-(\d+)\|=(\d+)\)/g;
        let match: RegExpExecArray | null;

        while ((match = conditionRegex.exec(trimmedFormula)) !== null) {
            conditions.push({
                min: parseInt(match[1] ?? '0', 10),
                max: parseInt(match[2] ?? '0', 10),
                value: parseInt(match[3] ?? '0', 10),
            });
        }

        if (conditions.length === 0) {
            console.warn(`Invalid fate formula format: "${trimmedFormula}"`);
            return 0;
        }

        // Roll 1d10 to determine which condition applies
        const roll = new Roll('1d10').evaluateSync();
        const result = typeof roll.total === 'number' ? roll.total : 0;

        // Find matching condition
        for (const condition of conditions) {
            if (result >= condition.min && result <= condition.max) {
                return condition.value;
            }
        }

        // Fallback to first condition value if no match (shouldn't happen)
        return conditions[0]?.value ?? 0;
    } catch (err) {
        console.error(`Failed to evaluate fate formula "${trimmedFormula}":`, err);
        return 0;
    }
}

/**
 * Parse a TB multiplier from a formula (for preview purposes).
 *
 * @param {string} formula - The wounds formula
 * @returns {number} The multiplier (e.g., "2xTB" returns 2)
 */
export function parseTBMultiplier(formula: string): number {
    if (!formula || typeof formula !== 'string') {
        return 0;
    }

    const match = formula.match(/(\d+)xTB/i);
    return match ? parseInt(match[1] ?? '0', 10) : formula.match(/TB/i) ? 1 : 0;
}

/**
 * Parse dice notation from a formula (for preview purposes).
 *
 * @param {string} formula - The formula containing dice notation
 * @returns {string|null} The dice notation (e.g., "1d5+2") or null
 */
export function parseDiceRoll(formula: string): string | null {
    if (!formula || typeof formula !== 'string') {
        return null;
    }

    const match = formula.match(/(\d+d\d+(?:[+-]\d+)*)/i);
    return match ? match[1] : null;
}

/**
 * Get a human-readable description of a wounds formula.
 *
 * @param {string} formula - The wounds formula
 * @returns {string} Description (e.g., "2×TB + 1d5+2")
 */
export function describeWoundsFormula(formula: string): string {
    if (!formula || typeof formula !== 'string') {
        return 'None';
    }

    // Make it more readable with proper symbols
    return formula.replace(/x/gi, '×').replace(/\+/g, ' + ').replace(/-/g, ' − ').replace(/\s+/g, ' ').trim();
}

/**
 * Get a human-readable description of a fate formula.
 *
 * @param {string} formula - The fate formula
 * @returns {string} Description (e.g., "1d10: 1-5=2, 6-10=3")
 */
export function describeFateFormula(formula: string): string {
    if (!formula || typeof formula !== 'string') {
        return 'None';
    }

    const conditions: string[] = [];
    const conditionRegex = /\((\d+)-(\d+)\|=(\d+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = conditionRegex.exec(formula)) !== null) {
        conditions.push(`${match[1]}-${match[2]}=${match[3]}`);
    }

    if (conditions.length === 0) {
        return formula;
    }

    return `1d10: ${conditions.join(', ')}`;
}
