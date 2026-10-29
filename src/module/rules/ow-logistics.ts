/**
 * Only War · Squad Logistics Rating + Logistics Test engine (#154, #192).
 *
 * The Logistics Test is a d100 against the squad's Logistics Rating. Its
 * modifier adds four front-condition parts (the item's Availability against the
 * troops deployed, time spent at the front, how active the front is, and the war
 * conditions), a bonus for gear that is a deployed regiment's standard kit, and
 * the item's craftsmanship.
 *
 * Every value lives on the OW game-system config
 * (`OW_LOGISTICS_FRONT_CONDITIONS`, `OW_ACQUISITION_LADDER`); this module holds
 * only the composition: it names no items, regiments or talents.
 *
 * Two Logistics-table cells carry no number. "Automatic" resolves the test as passed
 * with no roll — the same reading every other line's ladder gives the word
 * (`acquisition-ladder.ts`). "GM's Discretion" (Unique, Company or Less) cannot
 * be rolled at all: the GM rules on it.
 *
 * RNG-free and actor-decoupled; no I/O, no Foundry Document reads.
 */

import { OW_ACQUISITION_LADDER, OW_LOGISTICS_FRONT_CONDITIONS } from '../config/game-systems/ow-config.ts';
import { degreesOfFailure, degreesOfSuccess, isD100Success } from './_dice.ts';
import { type AvailabilityKey, availabilityCell, type CraftsmanshipKey } from './acquisition-ladder.ts';

/* -------------------------------------------------------------------- */
/*  Base rating + flat bonuses                                          */
/* -------------------------------------------------------------------- */

/** Default starting Logistics Rating for a freshly-founded squad (OW core rules). */
export const OW_DEFAULT_LOGISTICS_RATING = 10;

/** Munitorum Influence Talent bonus to Squad Logistics Rating (OW core rules). */
export const OW_MUNITORUM_INFLUENCE_BONUS = 5;

/* -------------------------------------------------------------------- */
/*  Logistics-table axes                                                */
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

/**
 * The battlefront the squad is "currently operating in": the four
 * Logistics-table conditions that are standing campaign state rather than
 * per-request input. Persisted on the OW actor so every Logistics path — the
 * test dialog and the armoury requisition — prices against the same front.
 */
export interface LogisticsFront {
    readonly troopCount: TroopCount;
    readonly timeInFront: TimeInFront;
    readonly frontActive: FrontActive;
    readonly warCondition: WarCondition;
}

/**
 * The front a squad starts on before the GM sets one. The book prints no
 * default: Company or Less is the smallest deployment (and the line ladder's
 * own column); 3–6 Months is the time row printed Challenging (+0); War
 * Conditions has no +0 row, so Violent Impasse — the contested front of the
 * printed worked example — is used (#496).
 */
export const OW_DEFAULT_FRONT: LogisticsFront = {
    troopCount: 'company',
    timeInFront: 'months3to6',
    frontActive: 'months3to6',
    warCondition: 'violentImpasse',
};

function pick<T extends string>(keys: readonly T[], raw: string | undefined, fallback: T): T {
    return keys.find((key) => key === raw) ?? fallback;
}

/** A stored front as the actor schema holds it (plain strings, possibly absent on legacy data). */
export type StoredLogisticsFront = Partial<Record<keyof LogisticsFront, string>>;

/** Read a stored front, falling back to {@link OW_DEFAULT_FRONT} for any absent or unknown row. */
export function logisticsFrontFrom(stored: StoredLogisticsFront | undefined): LogisticsFront {
    return {
        troopCount: pick(TROOP_COUNT_KEYS, stored?.troopCount, OW_DEFAULT_FRONT.troopCount),
        timeInFront: pick(FRONT_TIME_KEYS, stored?.timeInFront, OW_DEFAULT_FRONT.timeInFront),
        frontActive: pick(FRONT_TIME_KEYS, stored?.frontActive, OW_DEFAULT_FRONT.frontActive),
        warCondition: pick(WAR_CONDITION_KEYS, stored?.warCondition, OW_DEFAULT_FRONT.warCondition),
    };
}

/** The squad's persisted Logistics standing, as the OW actor schema stores it. */
export interface StoredLogisticsStanding {
    readonly logisticsRating?: number | undefined;
    readonly munitorum?: boolean | undefined;
    readonly situational?: number | undefined;
    readonly logisticsFront?: StoredLogisticsFront | undefined;
}

/** The squad's standing state: everything in a Logistics Test that is not the request. */
export interface LogisticsStanding {
    readonly rating: number;
    readonly munitorum: boolean;
    readonly situational: number;
    readonly front: LogisticsFront;
}

/** Read the squad's standing off the actor's system data, defaulting what is absent. */
export function logisticsStandingFrom(stored: StoredLogisticsStanding): LogisticsStanding {
    return {
        rating: Math.trunc(stored.logisticsRating ?? OW_DEFAULT_LOGISTICS_RATING),
        munitorum: stored.munitorum === true,
        situational: Math.trunc(stored.situational ?? 0),
        front: logisticsFrontFrom(stored.logisticsFront),
    };
}

/** One Logistics request: the item and whether it is in a deployed regiment's standard kit. */
export interface LogisticsRequest {
    readonly availability: AvailabilityKey;
    readonly craftsmanship: Craftsmanship;
    readonly standardKit: boolean;
}

/** The full Logistics Test context for a request made from a standing. */
export function logisticsContextFor(standing: LogisticsStanding, request: LogisticsRequest): LogisticsContext {
    return {
        rating: standing.rating,
        munitorum: standing.munitorum,
        situational: standing.situational,
        ...standing.front,
        ...request,
    };
}

/* -------------------------------------------------------------------- */
/*  Composition                                                         */
/* -------------------------------------------------------------------- */

/**
 * Inputs to the Logistics Test difficulty. All fields are required — callers
 * default omitted axes (an unrated item to `common`, etc.) before invoking.
 */
export interface LogisticsContext extends LogisticsFront {
    /** Base Squad Logistics Rating (default 10 per `OW_DEFAULT_LOGISTICS_RATING`). */
    readonly rating: number;
    /** True if any squad member has Munitorum Influence (+5 to rating). */
    readonly munitorum: boolean;
    /** GM situational adjustment, in points. */
    readonly situational: number;
    /** The requested item's Availability. */
    readonly availability: AvailabilityKey;
    /** True if the requested gear is in any deployed regiment's standard kit (+20). */
    readonly standardKit: boolean;
    readonly craftsmanship: Craftsmanship;
}

/**
 * Per-component values summed into the final target. `availability` is the
 * Logistics-table cell for the item's Availability in the deployed troop column.
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
    /** The breakdown's sum before the clamp, so the derivation shows it (#701). */
    readonly rawSum: number;
    /** True when the sum fell below 0 and the clamp set the target to 0. */
    readonly clamped: boolean;
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
    const cell = availabilityCell(fc.availabilityByTroops[ctx.troopCount], ctx.availability);
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
    return { kind: 'test', target: Math.max(0, sum), rawSum: sum, clamped: sum < 0, breakdown };
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
