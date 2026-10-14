/**
 * Boarding Actions resolver — Rogue Trader (#188 — RT Core p.215
 * §Ramming and Boarding Actions; turret bonus p.220).
 *
 * RAW shape:
 *   1. **Lock on.** A ship that ends its Manoeuvre Action within 1 VU of its
 *      target may give up its Shooting Action to board. The helmsman makes a
 *      **Hard (−20) Pilot (Space Craft) + Manoeuvrability Test**; on a success
 *      the two ships crash together and the boarding action begins.
 *   2. **Boarding round.** Each Strategic Turn while locked, the leader of each
 *      ship's warriors makes an **opposed Command Test**:
 *        • the ship with the larger Crew Population gains +10 per full 10
 *          points of difference;
 *        • the ship with the higher remaining Hull Integrity gains +10 per
 *          full 10 points of difference;
 *        • each point of a ship's Turret Rating adds +10 to its side (p.220);
 *        • a ship that tried and failed to break free this turn suffers −20.
 *   3. **Damage.** For each degree the winner wins by, the winner inflicts ONE
 *      of: 1d5 Crew Population and 1d5 Morale damage, or 1 point of Hull
 *      Integrity damage (which also costs Crew Population and Morale as normal,
 *      p.221).
 *   4. **Morale check.** The loser rolls d100 against its current Morale; an
 *      equal or lower roll fights on, a higher roll routs and surrenders.
 *
 * The printed text grants the higher-Hull ship its bonus "for every full 10
 * points difference in Crew Population" — a copy of the preceding sentence.
 * The bonus is read here as scaling with the Hull Integrity difference, the
 * only reading under which the Hull Integrity clause does anything distinct.
 *
 * Ties in the opposed test resolve for the defender (the boarded ship), which
 * then wins by 0 degrees and inflicts nothing.
 *
 * Pure module: no RNG, no Foundry. The caller rolls the d100s and the d5s.
 */

import {
    deriveTarget,
    HARD_DIFFICULTY_KEY,
    resolveOpposedShipTests,
    situationalComponents,
    type ShipAssaultShip,
    type ShipTestComponent,
    type ShipTestDerivation,
    type ShipTestResult,
    type SituationalModifier,
} from './ship-assault.ts';

/** Tie in the opposed Command test favours the defender. */
export const BOARDING_RESOLUTION_FAVORS_DEFENDER = true;

/** Printed difficulty of the lock-on Pilot (Space Craft) + Manoeuvrability Test — Hard (−20). */
export const BOARDING_LOCK_DIFFICULTY = -20;

/** Penalty to the Command Test of a ship that tried and failed to break free. */
export const BOARDING_FAILED_BREAK_FREE_PENALTY = -20;

/** Crew Population / Hull Integrity difference per bonus step. */
const BOARDING_DIFFERENCE_STEP = 10;

/** Command bonus per full difference step. */
const BOARDING_BONUS_PER_STEP = 10;

/** Command bonus per point of the ship's Turret Rating (p.220). */
export const BOARDING_TURRET_BONUS_PER_POINT = 10;

/** Hull Integrity damage per degree spent on setting charges. */
export const BOARDING_HULL_DAMAGE_PER_DEGREE = 1;

/** Langpack keys for the boarding components. */
export const BOARDING_KEYS = {
    lockDifficulty: HARD_DIFFICULTY_KEY,
    commandSkill: 'WH40K.Voidcraft.Boarding.Component.CommandSkill',
    crewAdvantage: 'WH40K.Voidcraft.Boarding.Component.CrewAdvantage',
    hullAdvantage: 'WH40K.Voidcraft.Boarding.Component.HullAdvantage',
    turrets: 'WH40K.Voidcraft.Boarding.Component.Turrets',
    failedBreakFree: 'WH40K.Voidcraft.Boarding.Component.FailedBreakFree',
} as const;

/**
 * Bonus a side earns for out-numbering its opponent on a stat: +10 per full 10
 * points of difference, and nothing for the side that trails or ties.
 */
export function boardingDifferenceBonus(mine: number, theirs: number): number {
    if (mine <= theirs) return 0;
    return Math.floor((mine - theirs) / BOARDING_DIFFERENCE_STEP) * BOARDING_BONUS_PER_STEP;
}

/** One side's inputs to the opposed Command Test. */
export interface BoardingSideInput {
    /** The ship this side fights for. */
    readonly ship: ShipAssaultShip;
    /** Command skill target of the character leading the ship's warriors. */
    readonly commandSkill: number;
    /** True when this ship tried and failed to break free this turn. */
    readonly failedBreakFree: boolean;
    readonly situational?: SituationalModifier;
}

/** Compose one side's Command target against its opponent's ship. */
export function composeBoardingCommand(side: BoardingSideInput, opponent: ShipAssaultShip): ShipTestDerivation {
    const modifiers: ShipTestComponent[] = [];
    const crew = boardingDifferenceBonus(side.ship.crewPopulation, opponent.crewPopulation);
    if (crew !== 0) {
        modifiers.push({ labelKey: BOARDING_KEYS.crewAdvantage, value: crew, data: { mine: side.ship.crewPopulation, theirs: opponent.crewPopulation } });
    }
    const hull = boardingDifferenceBonus(side.ship.hullIntegrity, opponent.hullIntegrity);
    if (hull !== 0) {
        modifiers.push({ labelKey: BOARDING_KEYS.hullAdvantage, value: hull, data: { mine: side.ship.hullIntegrity, theirs: opponent.hullIntegrity } });
    }
    const turrets = side.ship.turretRating * BOARDING_TURRET_BONUS_PER_POINT;
    if (turrets !== 0) {
        modifiers.push({ labelKey: BOARDING_KEYS.turrets, value: turrets, data: { rating: side.ship.turretRating } });
    }
    if (side.failedBreakFree) {
        modifiers.push({ labelKey: BOARDING_KEYS.failedBreakFree, value: BOARDING_FAILED_BREAK_FREE_PENALTY });
    }
    modifiers.push(...situationalComponents(side.situational));
    return deriveTarget({ labelKey: BOARDING_KEYS.commandSkill, value: side.commandSkill }, modifiers);
}

/** Outcome of a boarding round's opposed Command Test. */
export interface BoardingRoundResolution {
    /** Which ship won the round. Ties go to the defender. */
    readonly winner: 'attacker' | 'defender';
    readonly attackerDoS: number;
    readonly defenderDoS: number;
    /** Degrees the winner won by — each buys one damage option. */
    readonly degrees: number;
}

/**
 * Resolve the opposed Command Test of one boarding round from both rolled
 * tests. A success beats a failure, then the most degrees win, counted the
 * line's way (RT: each full 10 of margin, no base degree).
 */
export function resolveBoardingRound(attacker: ShipTestResult, defender: ShipTestResult): BoardingRoundResolution {
    const { winner, degrees } = resolveOpposedShipTests(attacker, defender);
    return { winner, attackerDoS: attacker.dos, defenderDoS: defender.dos, degrees };
}

/** How the winner spends its degrees. */
export interface BoardingAllocation {
    /** Degrees spent on 1 Hull Integrity damage each. */
    readonly hullDegrees: number;
    /** Degrees spent on 1d5 Crew Population + 1d5 Morale damage each. */
    readonly crewDegrees: number;
}

/**
 * Split the winner's degrees between Hull Integrity and crew damage. The
 * requested Hull share is clamped to `[0, degrees]`; the rest goes to crew.
 */
export function allocateBoardingDegrees(degrees: number, requestedHullDegrees: number): BoardingAllocation {
    const total = Math.max(0, Math.floor(degrees));
    const hullDegrees = Math.min(total, Math.max(0, Math.floor(requestedHullDegrees)));
    return { hullDegrees, crewDegrees: total - hullDegrees };
}

/** Pre-rolled damage dice for a boarding round. */
export interface BoardingDamageInput {
    readonly allocation: BoardingAllocation;
    /** One 1d5 Crew Population roll per crew degree. */
    readonly crewD5s: readonly number[];
    /** One 1d5 Morale roll per crew degree. */
    readonly moraleD5s: readonly number[];
}

/** Damage the loser suffers. Hull damage also costs crew/morale downstream. */
export interface BoardingDamageResolution {
    readonly hullDamage: number;
    readonly crewDamage: number;
    readonly moraleDamage: number;
}

/** Total the loser's damage from the allocation and the rolled d5s. */
export function computeBoardingDamage(input: BoardingDamageInput): BoardingDamageResolution {
    const crewDice = input.crewD5s.slice(0, input.allocation.crewDegrees);
    const moraleDice = input.moraleD5s.slice(0, input.allocation.crewDegrees);
    return {
        hullDamage: input.allocation.hullDegrees * BOARDING_HULL_DAMAGE_PER_DEGREE,
        crewDamage: crewDice.reduce((total, die) => total + die, 0),
        moraleDamage: moraleDice.reduce((total, die) => total + die, 0),
    };
}

/**
 * The loser's morale check: a d100 at or under its current Morale fights on;
 * a higher roll routs and surrenders.
 */
export function resolveBoardingMorale(roll: number, morale: number): { readonly fightsOn: boolean } {
    return { fightsOn: roll <= morale };
}
