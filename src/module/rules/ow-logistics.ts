/**
 * Only War · Squad Logistics Rating + Logistics Test engine (#154, #192).
 *
 * OW core p. 162, "The Logistics Test": "This is a 1d100 roll against the
 * Squad's Logistics Rating … modified based on the item's Availability,
 * Craftsmanship, and the conditions of the battlefield". The difficulty is the
 * sum of Table 6-2: Availability by Front Conditions's four cumulative parts —
 * the item's Availability cross-referenced with the number of troops deployed,
 * Time Spent in Front, Front Active, War Conditions — plus the +20 for an item
 * in a deployed regiment's standard kit (p. 163) and Table 6-6: Craftsmanship
 * and Logistics (p. 167).
 *
 * Every printed value lives on the OW game-system config
 * (`OW_LOGISTICS_FRONT_CONDITIONS`, `OW_ACQUISITION_LADDER`); this module holds
 * only the composition: it names no items, regiments or talents.
 *
 * Two Table 6-2 cells carry no number. "Automatic" resolves the test as passed
 * with no roll — the same reading every other line's ladder gives the word
 * (`acquisition-ladder.ts`). "GM's Discretion" (Unique, Company or Less) cannot
 * be rolled at all: the GM rules on it.
 *
 * RNG-free and actor-decoupled; no I/O, no Foundry Document reads.
 */

import { OW_ACQUISITION_LADDER, OW_LOGISTICS_FRONT_CONDITIONS } from '../config/game-systems/ow-config.ts';
import { degreesOfFailure, degreesOfSuccess, isD100Success } from './_dice.ts';
import { type AvailabilityKey, availabilityTerm, type CraftsmanshipKey } from './acquisition-ladder.ts';

/* -------------------------------------------------------------------- */
/*  Base rating + flat bonuses                                          */
/* -------------------------------------------------------------------- */

/** Default starting Logistics Rating for a freshly-founded squad (OW core p. 161). */
export const OW_DEFAULT_LOGISTICS_RATING = 10;

/** Munitorum Influence Talent bonus to Squad Logistics Rating (OW core p. 161, talent p. 149). */
export const OW_MUNITORUM_INFLUENCE_BONUS = 5;

/* -------------------------------------------------------------------- */
/*  Table 6-2 axes                                                      */
/* -------------------------------------------------------------------- */

export type Craftsmanship = CraftsmanshipKey;

/** "Difficulty by Number of Troops" column: Company or Less / Single Regiment / Multiple Regiments. */
export type TroopCount = keyof typeof OW_LOGISTICS_FRONT_CONDITIONS.availabilityByTroops;

/** "Time Spent in Front" row. */
export type TimeInFront = keyof typeof OW_LOGISTICS_FRONT_CONDITIONS.timeInFront;

/** "Front Active" row. */
export type FrontActive = keyof typeof OW_LOGISTICS_FRONT_CONDITIONS.frontActive;

/** "War Conditions" row. */
export type WarCondition = keyof typeof OW_LOGISTICS_FRONT_CONDITIONS.warCondition;

/** The troop columns, in printed order. */
export const TROOP_COUNT_KEYS = ['company', 'regiment', 'regiments'] as const satisfies readonly TroopCount[];

/** The time rows (shared by Time Spent in Front and Front Active), in printed order. */
export const FRONT_TIME_KEYS = ['under3Months', 'months3to6', 'months6to12', 'years1to5', 'years5plus'] as const satisfies readonly FrontActive[];

/** The War Conditions rows, in printed order. */
export const WAR_CONDITION_KEYS = [
    'losingBadly',
    'faltering',
    'violentImpasse',
    'ceasefire',
    'nearVictorious',
    'dominant',
] as const satisfies readonly WarCondition[];

/* -------------------------------------------------------------------- */
/*  Composition                                                         */
/* -------------------------------------------------------------------- */

/**
 * Inputs to the Logistics Test difficulty. All fields are required — callers
 * default omitted axes (an unrated item to `common`, etc.) before invoking.
 */
export interface LogisticsContext {
    /** Base Squad Logistics Rating (default 10 per `OW_DEFAULT_LOGISTICS_RATING`). */
    readonly rating: number;
    /** True if any squad member has Munitorum Influence (+5 to rating). */
    readonly munitorum: boolean;
    /** GM situational adjustment, in points. */
    readonly situational: number;
    /** The requested item's Availability. */
    readonly availability: AvailabilityKey;
    readonly troopCount: TroopCount;
    readonly timeInFront: TimeInFront;
    readonly frontActive: FrontActive;
    readonly warCondition: WarCondition;
    /** True if the requested gear is in any deployed regiment's standard kit (+20). */
    readonly standardKit: boolean;
    readonly craftsmanship: Craftsmanship;
}

/**
 * Per-component values summed into the final target. `availability` is the
 * Table 6-2 cell for the item's Availability in the deployed troop column.
 */
export type LogisticsBreakdown = {
    readonly rating: number;
    readonly munitorum: number;
    readonly situational: number;
    readonly availability: number;
    readonly timeInFront: number;
    readonly frontActive: number;
    readonly warCondition: number;
    readonly standardKit: number;
    readonly craftsmanship: number;
};

/** A rollable Logistics Test. */
export interface LogisticsTestTarget {
    readonly kind: 'test';
    /** Final d100 target — sum of every breakdown entry, clamped to 0. */
    readonly target: number;
    readonly breakdown: LogisticsBreakdown;
}

/** What a Logistics request resolves to before any dice are rolled. */
export type LogisticsTarget = LogisticsTestTarget | { readonly kind: 'automatic' } | { readonly kind: 'discretion' };

/**
 * Compute the Logistics Test for a fully-populated context. A rollable test
 * carries every contributing component so the dialog and chat card can show
 * the full derivation.
 */
export function computeLogisticsTarget(ctx: LogisticsContext): LogisticsTarget {
    const fc = OW_LOGISTICS_FRONT_CONDITIONS;
    const cell = availabilityTerm({ availability: fc.availabilityByTroops[ctx.troopCount], craftsmanship: null }, ctx.availability);
    if (cell.kind !== 'modifier') return { kind: cell.kind };

    const breakdown: LogisticsBreakdown = {
        rating: ctx.rating,
        munitorum: ctx.munitorum ? OW_MUNITORUM_INFLUENCE_BONUS : 0,
        situational: ctx.situational,
        availability: cell.value,
        timeInFront: fc.timeInFront[ctx.timeInFront],
        frontActive: fc.frontActive[ctx.frontActive],
        warCondition: fc.warCondition[ctx.warCondition],
        standardKit: ctx.standardKit ? fc.standardKit : 0,
        craftsmanship: OW_ACQUISITION_LADDER.craftsmanship[ctx.craftsmanship],
    };

    const sum = Object.values(breakdown).reduce((total, value) => total + value, 0);
    return { kind: 'test', target: Math.max(0, sum), breakdown };
}

/* -------------------------------------------------------------------- */
/*  Roll resolution                                                     */
/* -------------------------------------------------------------------- */

export interface LogisticsTestResult {
    readonly success: boolean;
    /** Degrees of Success — `floor((target - roll) / 10)`, clamped >= 0. Zero on a marginal success. */
    readonly degreesOfSuccess: number;
    /** Degrees of Failure — `floor((roll - target) / 10)`, clamped >= 0. Zero on a marginal failure. */
    readonly degreesOfFailure: number;
    readonly target: number;
    readonly breakdown: LogisticsBreakdown;
}

/**
 * Resolve a rolled Logistics Test. A roll equal to the target succeeds
 * (roll-under-or-equal); degrees follow the OW "extra degrees" convention — a
 * bare success scores 0 and each full ten of margin adds one.
 */
export function resolveLogisticsTest(test: LogisticsTestTarget, roll: number): LogisticsTestResult {
    return {
        success: isD100Success(roll, test.target),
        degreesOfSuccess: degreesOfSuccess(roll, test.target, { extra: true }),
        degreesOfFailure: degreesOfFailure(roll, test.target, { extra: true }),
        target: test.target,
        breakdown: test.breakdown,
    };
}
