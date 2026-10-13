/**
 * Pure movement math shared by `CreatureTemplate` (PC path) and `NPCData` (#271).
 * Both derive half/full/charge/run from `agilityBonus + size - 4`; only the NPC
 * minimum floors (1/2/3/6) differed.
 */

/** The four movement rates derived from agility bonus + size. */
export interface MovementRates {
    half: number;
    full: number;
    charge: number;
    run: number;
}

/**
 * Sum the values of collected movement-modifier sources (#409). The total is
 * folded into the base move rate (added to the agility bonus passed to
 * {@link computeMovement}) so a +N movement bonus scales through all four rates
 * and they stay consistent multiples. Pure.
 */
export function sumMovementModifiers(sources: ReadonlyArray<{ value: number }>): number {
    return sources.reduce((total, src) => total + src.value, 0);
}

/**
 * Each rate as a multiple of the base move (`agilityBonus + size - 4`). The NPC
 * minimum floor of a rate is its multiple of a base move of 1.
 */
const RATE_MULTIPLES: Readonly<MovementRates> = { half: 1, full: 2, charge: 3, run: 6 };

const RATE_KEYS = ['half', 'full', 'charge', 'run'] as const;

/**
 * Compute half/full/charge/run from agility bonus + size. When `applyFloors` is
 * true (NPCs) the rates are clamped to the 1/2/3/6 minimums; PCs pass `false`
 * for the raw values.
 */
export function computeMovement(agilityBonus: number, size: number, applyFloors: boolean): MovementRates {
    const baseMove = agilityBonus + size - 4;
    const rates = { half: 0, full: 0, charge: 0, run: 0 };
    for (const key of RATE_KEYS) {
        const rate = baseMove * RATE_MULTIPLES[key];
        rates[key] = applyFloors ? Math.max(RATE_MULTIPLES[key], rate) : rate;
    }
    return rates;
}

/**
 * Shift already-known rates (a printed NPC movement line) by a change to the base
 * move: each rate moves by the change times its multiple, as if the line had
 * been derived from the shifted Agility Bonus. A reduction stops at the NPC
 * 1/2/3/6 floor and never raises a printed rate already below it. Pure.
 */
export function shiftMovementRates(rates: Readonly<MovementRates>, baseShift: number, applyFloors: boolean): MovementRates {
    const shifted = { half: rates.half, full: rates.full, charge: rates.charge, run: rates.run };
    if (baseShift === 0) return shifted;
    for (const key of RATE_KEYS) {
        const rate = rates[key] + baseShift * RATE_MULTIPLES[key];
        shifted[key] = applyFloors && baseShift < 0 ? Math.max(Math.min(rates[key], RATE_MULTIPLES[key]), rate) : rate;
    }
    return shifted;
}
