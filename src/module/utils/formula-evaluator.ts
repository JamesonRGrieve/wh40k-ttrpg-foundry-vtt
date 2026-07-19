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

/**
 * Minimal actor surface {@link evaluateWoundsFormula} reads — a structural view
 * of the actor Document, so the calculation is testable without a full Document.
 */
export interface WoundsActorView {
    system: { characteristics: Record<string, { bonus?: number } | undefined> };
}

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
 * A synchronous source of a single die result in `[1, faces]`. Injectable so the
 * pure formula evaluators are deterministic under test and never depend on
 * Foundry's asynchronous `Roll`.
 *
 * Foundry's `Roll#evaluateSync` CANNOT roll a non-deterministic die
 * synchronously: with `strict: true` (the default) it throws
 * "This Roll contains terms that cannot be synchronously evaluated", and with
 * `strict: false` it silently rolls nothing and yields a total of 0
 * (see `DiceTerm#_evaluateSync` — the non-deterministic branch just `continue`s).
 * Either way a `1d10`/`1d5` origin-path formula produced 0 instead of a roll, so
 * these evaluators own their dice via this seam instead.
 */
export type DieRoller = (faces: number) => number;

/** Default die roller: a uniform draw over `[1, faces]`. */
const defaultDieRoller: DieRoller = (faces) => Math.floor(Math.random() * faces) + 1;

/**
 * Evaluate a simple additive dice expression — a sum of signed integer and
 * `NdM` terms (e.g. `"8+1d5+2"`, `"4+3"`, `"3xTB"` after substitution). Rolls
 * each die term through the injected {@link DieRoller}. Throws on any segment
 * that is not a run of `[+-]?(\d*d\d+|\d+)` terms, so a malformed formula is
 * caught by the caller's try/catch rather than silently mis-summed.
 */
function evaluateDiceExpression(expression: string, rollDie: DieRoller): number {
    const cleaned = expression.replace(/\s+/g, '');
    if (cleaned === '') throw new Error('empty dice expression');

    // Give the leading term an explicit sign so a single term regex covers all.
    const normalized = cleaned.startsWith('+') || cleaned.startsWith('-') ? cleaned : `+${cleaned}`;
    const termRegex = /([+-])(\d*d\d+|\d+)/gi;

    let total = 0;
    let cursor = 0;
    let match: RegExpExecArray | null = termRegex.exec(normalized);
    while (match !== null) {
        // Terms must be contiguous — a gap means an unparseable segment.
        if (match.index !== cursor) throw new Error(`Unparseable segment in "${expression}"`);
        cursor = termRegex.lastIndex;

        const sign = match[1] === '-' ? -1 : 1;
        // `String(...)` yields a definite string under `noUncheckedIndexedAccess`
        // (tsconfig.strict.json), and `Number(...)` accepts `any` so no per-group
        // undefined guard is needed — the term regex already guaranteed the match.
        const body = String(match[2]);
        const dice = /^(\d*)d(\d+)$/i.exec(body);
        if (dice) {
            const countStr = dice[1];
            const count = countStr === '' ? 1 : Number(countStr);
            const faces = Number(dice[2]);
            let sum = 0;
            for (let i = 0; i < count; i++) sum += rollDie(faces);
            total += sign * sum;
        } else {
            total += sign * Number(body);
        }
        match = termRegex.exec(normalized);
    }

    if (cursor !== normalized.length) throw new Error(`Trailing garbage in "${expression}"`);
    return total;
}

/**
 * Evaluate a wounds formula with characteristic bonus references.
 *
 * @param {string} formula - The wounds formula (e.g., "2xTB+1d5+2")
 * @param {Actor} actor - The actor to evaluate for (provides characteristic bonuses)
 * @param {DieRoller} rollDie - Injectable die source (defaults to a uniform roll)
 * @returns {number} Evaluated wounds value
 */
export function evaluateWoundsFormula(formula: string, actor: WoundsActorView, rollDie: DieRoller = defaultDieRoller): number {
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

        // Replace each characteristic bonus reference. Iterate longest-first
        // so multi-letter abbrs (`WSB`, `BSB`, `InfB`) substitute before
        // shorter overlapping ones (`SB`, `IB`, `FB`) — otherwise `WSB` gets
        // clobbered to `W<SB-value>`.
        const sortedEntries = Object.entries(charMap).sort(([a], [b]) => b.length - a.length);
        for (const [abbr, charName] of sortedEntries) {
            // Match patterns like "2xTB" or "TB" (with or without multiplier)
            const regex = new RegExp(`(\\d+)x${abbr}|${abbr}`, 'gi');
            evaluated = evaluated.replace(regex, (_match: string, multiplier?: string) => {
                const bonus = actor.system.characteristics[charName]?.bonus ?? 0;
                const mult = multiplier !== undefined && multiplier !== '' ? parseInt(multiplier, 10) : 1;
                return (bonus * mult).toString();
            });
        }

        // Evaluate the substituted dice notation via the injectable seam (see
        // DieRoller — Foundry's Roll#evaluateSync cannot roll a die synchronously).
        const total = evaluateDiceExpression(evaluated, rollDie);
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
 * @param {DieRoller} rollDie - Injectable die source (defaults to a uniform roll)
 * @returns {number} Evaluated fate threshold value
 */
export function evaluateFateFormula(formula: string, rollDie: DieRoller = defaultDieRoller): number {
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
        let match: RegExpExecArray | null = conditionRegex.exec(trimmedFormula);

        while (match !== null) {
            const g1 = (match[1] as string | undefined) ?? '0';
            const g2 = (match[2] as string | undefined) ?? '0';
            const g3 = (match[3] as string | undefined) ?? '0';
            conditions.push({
                min: parseInt(g1, 10),
                max: parseInt(g2, 10),
                value: parseInt(g3, 10),
            });
            match = conditionRegex.exec(trimmedFormula);
        }

        if (conditions.length === 0) {
            console.warn(`Invalid fate formula format: "${trimmedFormula}"`);
            return 0;
        }

        // Roll 1d10 to determine which condition applies (via the injectable
        // seam — Foundry's Roll#evaluateSync cannot roll a die synchronously).
        const result = rollDie(10);

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard for strict tsconfig
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
    return match?.[1] ?? null;
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
    let match: RegExpExecArray | null = conditionRegex.exec(formula);

    while (match !== null) {
        conditions.push(`${match[1]}-${match[2]}=${match[3]}`);
        match = conditionRegex.exec(formula);
    }

    if (conditions.length === 0) {
        return formula;
    }

    return `1d10: ${conditions.join(', ')}`;
}
