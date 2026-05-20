/**
 * Only War vehicle movement actions + High-Speed Chase tracker
 * (#156 — core.md §"VEHICLE MOVEMENT", p.12305).
 *
 * Pure functions. The caller (sheet, chat card, prompt dialog, GM
 * macro) owns I/O, actor lookups, and Operate-test resolution; this
 * module owns the action catalogue and the chase distance / danger
 * zone arithmetic.
 *
 * Canonical rules referenced here:
 *   - Five named vehicle movement actions: Evasive Manoeuvring
 *     (Half Action), Floor It! (Full), Hit & Run (Full), Jink
 *     (Reaction), Tactical Manoeuvring (Half).
 *   - High-Speed Chase: opposed Operate tests between the pursuing
 *     driver and the target driver, applied each turn against a
 *     running distance tracker. Pursuer DoS minus target DoS scales
 *     the gap closed (or opened) by the round's effective close rate.
 *     A handling hazard ("danger zone") is flagged when either
 *     driver fails their Operate by 3+ DoF, or when the pursuer's
 *     distance reaches 0 (the pursuer is now on top of the target).
 *
 * No DataModel coupling, no actor lookups, no Foundry imports.
 */

/** Stable identifier for the five named vehicle movement actions. */
export type OwVehicleActionId = 'evasive-manoeuvring' | 'floor-it' | 'hit-and-run' | 'jink' | 'tactical-manoeuvring';

/** Action-economy timing for a vehicle movement action. */
export type VehicleActionTiming = 'full' | 'half' | 'reaction';

/** Catalogue entry for a vehicle movement action. */
export interface OwVehicleAction {
    /** Stable id (used for i18n lookup, persistence, chat-card routing). */
    id: OwVehicleActionId;
    /** Action-economy cost. */
    timing: VehicleActionTiming;
    /** Short rules-text description (English fallback; UI resolves i18n separately). */
    description: string;
}

/**
 * Canonical catalogue of OW vehicle movement actions. Order matches
 * the rulebook §"VEHICLE MOVEMENT" presentation.
 */
export const OW_VEHICLE_ACTIONS: ReadonlyArray<OwVehicleAction> = [
    {
        id: 'evasive-manoeuvring',
        timing: 'half',
        description: "Driver makes an Operate test; on success, attackers suffer a -10 penalty to hit the vehicle until the start of the driver's next turn.",
    },
    {
        id: 'floor-it',
        timing: 'full',
        description:
            'Vehicle moves at maximum tactical speed in a straight line; all ranged attacks against the vehicle suffer a -10 penalty, but the driver may take no other actions this turn.',
    },
    {
        id: 'hit-and-run',
        timing: 'full',
        description:
            'Vehicle moves up to its tactical speed, gunners may fire as a free action during the move, then the vehicle continues to its end position.',
    },
    {
        id: 'jink',
        timing: 'reaction',
        description: 'Reaction: driver attempts an Operate test against an incoming attack; on success the attack suffers a -20 penalty to hit.',
    },
    {
        id: 'tactical-manoeuvring',
        timing: 'half',
        description: 'Vehicle moves at tactical speed and may make a single course change of up to 90 degrees during the move.',
    },
];

/**
 * Lookup helper for the action catalogue. Throws on an unknown id so
 * the caller surfaces a hard error rather than rendering a stale chat
 * card — there are only five entries and they don't change at runtime.
 */
export function getOwVehicleAction(id: OwVehicleActionId): OwVehicleAction {
    const found = OW_VEHICLE_ACTIONS.find((action) => action.id === id);
    if (found === undefined) {
        throw new Error(`Unknown OW vehicle action id: ${String(id)}`);
    }
    return found;
}

/* -------------------------------------------- */
/*  High-Speed Chase                            */
/* -------------------------------------------- */

/**
 * Live state of a single High-Speed Chase encounter. The caller owns
 * persistence; this module produces the next-state value each turn.
 */
export interface ChaseTrackerState {
    /**
     * Distance between pursuer and target, in the caller's units
     * (typically metres). 0 means the pursuer has caught the target;
     * negative values are permitted and mean the pursuer has
     * overshot — the danger zone fires in either case.
     */
    pursuerDistance: number;
    /**
     * True when this turn triggered a handling hazard: a 3+ DoF on
     * either driver's Operate test, or the pursuer reaching the
     * target (distance ≤ 0). Sticky for the turn that produced it;
     * the caller resets it on the next tick.
     */
    dangerZone: boolean;
    /** Number of chase rounds resolved so far (incremented every tick). */
    turnCount: number;
}

/** Input shape for {@link tickHighSpeedChase}. */
export interface ChaseTickInput {
    /** State at the start of the turn. */
    state: ChaseTrackerState;
    /** Pursuing driver's Operate Degrees of Success this turn (≥ 0). */
    pursuerOperateDoS: number;
    /** Pursuing driver's Operate Degrees of Failure this turn (≥ 0). */
    pursuerOperateDoF: number;
    /** Target driver's Operate Degrees of Success this turn (≥ 0). */
    targetOperateDoS: number;
    /** Target driver's Operate Degrees of Failure this turn (≥ 0). */
    targetOperateDoF: number;
    /**
     * Distance units closed per net DoS this turn. Combines the
     * vehicles' top-speed differential and any GM-set scale; the
     * caller is responsible for choosing a sensible value (typically
     * the difference between the pursuer's and target's tactical
     * speeds, in metres).
     */
    closeRate: number;
}

/** DoF threshold at or above which a driver's Operate test triggers a handling hazard. */
export const CHASE_DANGER_ZONE_DOF_THRESHOLD = 3;

/**
 * Resolve one turn of a High-Speed Chase.
 *
 * Net DoS = pursuer DoS − target DoS. The distance shifts by
 * `closeRate * net`:
 *   - Positive net → pursuer gains; `pursuerDistance` decreases.
 *   - Negative net → target opens the gap; `pursuerDistance` increases.
 *   - Zero net → distance unchanged.
 *
 * The danger zone flag is recomputed each tick (it is *not* carried
 * forward from the previous state). It fires when either driver
 * failed their Operate by ≥ {@link CHASE_DANGER_ZONE_DOF_THRESHOLD},
 * or when the new distance is at or below zero (pursuer has caught
 * up). Both conditions can coexist; the flag is a single boolean.
 *
 * `turnCount` increments by 1 each call.
 */
export function tickHighSpeedChase(input: ChaseTickInput): ChaseTrackerState {
    const pursuerDoS = sanitiseNonNegativeInt(input.pursuerOperateDoS);
    const pursuerDoF = sanitiseNonNegativeInt(input.pursuerOperateDoF);
    const targetDoS = sanitiseNonNegativeInt(input.targetOperateDoS);
    const targetDoF = sanitiseNonNegativeInt(input.targetOperateDoF);
    const closeRate = sanitiseFiniteNumber(input.closeRate);

    const previousDistance = sanitiseFiniteNumber(input.state.pursuerDistance);
    const previousTurnCount = sanitiseNonNegativeInt(input.state.turnCount);

    const netDoS = pursuerDoS - targetDoS;
    const nextDistance = previousDistance - closeRate * netDoS;

    const handlingHazard = pursuerDoF >= CHASE_DANGER_ZONE_DOF_THRESHOLD || targetDoF >= CHASE_DANGER_ZONE_DOF_THRESHOLD;
    const caughtUp = nextDistance <= 0;

    return {
        pursuerDistance: nextDistance,
        dangerZone: handlingHazard || caughtUp,
        turnCount: previousTurnCount + 1,
    };
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */

function sanitiseNonNegativeInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const v = Math.trunc(value);
    return v < 0 ? 0 : v;
}

function sanitiseFiniteNumber(value: number): number {
    return Number.isFinite(value) ? value : 0;
}
