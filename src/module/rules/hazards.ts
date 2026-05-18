/**
 * Environmental hazard resolvers (#118 — core.md L11155-11188).
 *
 * Falling, drowning, and suffocation per RAW. Sister to
 * `vehicle-hazards.ts`. Pure helpers — the engine consumer (combat
 * tracker, scene hooks, on-zone-enter listeners) drives them.
 */

/* -------------------------------------------- */
/*  Falling damage (core.md L11155-11166)       */
/* -------------------------------------------- */

/** Damage per 2 metres fallen. RAW: 1d10. */
export const FALLING_DAMAGE_DICE_PER_2M = '1d10';

/**
 * Number of 1d10 damage dice for a fall of N metres. A 1m fall does
 * no damage (rounded down). 2m → 1d10, 4m → 2d10, etc.
 */
export function getFallingDiceCount(metres: number): number {
    const m = Math.max(0, Math.trunc(Number.isFinite(metres) ? metres : 0));
    return Math.floor(m / 2);
}

/**
 * Convenience: build the dice formula for a fall. Returns '' for falls
 * that deal no damage (the caller can skip the roll entirely).
 */
export function getFallingDamageFormula(metres: number): string {
    const dice = getFallingDiceCount(metres);
    return dice === 0 ? '' : `${dice}d10`;
}

/* -------------------------------------------- */
/*  Drowning (core.md L11170-11180)             */
/* -------------------------------------------- */

/** Damage per round once the actor begins to drown. */
export const DROWNING_DAMAGE_PER_ROUND = 1;

export interface DrowningRoundInput {
    /** Actor's full Toughness characteristic total. */
    toughnessTotal: number;
    /** Rounds the actor has been submerged so far (≥ 1). */
    roundsSubmerged: number;
}

/**
 * Compose the per-round Toughness test target. RAW: target = TB total,
 * with a −10 modifier per additional round beyond the first
 * (cumulative). Floored at 0.
 */
export function resolveDrowningTest(input: DrowningRoundInput): { target: number } {
    const tgh = Math.max(0, Math.trunc(input.toughnessTotal));
    const rounds = Math.max(1, Math.trunc(input.roundsSubmerged));
    const cumulativePenalty = (rounds - 1) * 10;
    return { target: Math.max(0, tgh - cumulativePenalty) };
}

/* -------------------------------------------- */
/*  Suffocation (core.md L11180-11188)          */
/* -------------------------------------------- */

export interface SuffocationInput {
    /** Actor's Toughness bonus (tens digit). */
    toughnessBonus: number;
    /** Actor's Willpower bonus (tens digit). */
    willpowerBonus: number;
}

/**
 * Seconds the actor can hold breath = TB + WPB. After this point the
 * actor takes damage and risks death per RAW. Floored at 0.
 */
export function getBreathHoldSeconds(input: SuffocationInput): number {
    const tb = Math.max(0, Math.trunc(input.toughnessBonus));
    const wpb = Math.max(0, Math.trunc(input.willpowerBonus));
    return tb + wpb;
}

/**
 * Whether the actor is past their breath-hold ceiling. Seconds elapsed
 * compared to the TB+WPB ceiling — returns true once seconds > ceiling.
 */
export function isPastBreathCeiling(input: SuffocationInput & { secondsElapsed: number }): boolean {
    const ceiling = getBreathHoldSeconds(input);
    const elapsed = Math.max(0, Math.trunc(Number.isFinite(input.secondsElapsed) ? input.secondsElapsed : 0));
    return elapsed > ceiling;
}
