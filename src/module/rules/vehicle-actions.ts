/**
 * Vehicle / mount combat-action catalogue
 * (core.md §"Vehicle Combat Actions", p. 251).
 *
 * Parallel registry to `combat-actions.ts` — these actions surface on
 * a vehicle's action bar (driver / pilot) rather than on a personal
 * combatant.
 *
 * The two Aerial Manoeuvres (Lock On, Tight Turn — without.md p. 54,
 * L1614-1626) live here as Flyer-gated entries; their pure resolution
 * logic (degrees of success → outcome, altitude composition with #99's
 * `canChangeAltitude` validator) is in `resolveAerialManoeuvre()` below.
 */

import { type Altitude, ALTITUDE_ORDER, canChangeAltitude } from './altitude.ts';

export interface VehicleAction {
    name: string;
    /** Time cost (Half / Full / Free / Reaction). */
    type: ('Half' | 'Full' | 'Free' | 'Reaction')[];
    /** Category for filtering / icon assignment. */
    subtype: string[];
    description: string;
    /** Optional skill associated with this action (driver test). */
    skill?: string;
    /** Optional flat test modifier when the action is invoked. */
    modifier?: number;
    /** True for Aerial Manoeuvres — only available to Flyer-trait vehicles. */
    flyerOnly?: boolean;
}

export const VEHICLE_ACTIONS: VehicleAction[] = [
    {
        name: 'Manoeuvre',
        type: ['Half'],
        subtype: ['Operate'],
        description: "Adjust the vehicle's heading or position within its movement allowance. No skill test required for routine manoeuvres.",
    },
    {
        name: 'Pull Stunt',
        type: ['Full'],
        subtype: ['Operate', 'Risky'],
        description:
            'Attempt a daring manoeuvre (handbrake turn, jump a ravine, ram a barricade). Operate (matching vehicle class) test at GM-set difficulty; on 3+ DoF the vehicle goes Out of Control.',
        skill: 'operate',
    },
    {
        name: 'Ram',
        type: ['Full'],
        subtype: ['Attack', 'Operate'],
        description:
            'Drive the vehicle bodily into a target. Operate test to land; on success target takes (1d10 + vehicle Size + speed bonus) impact damage and the vehicle takes the same back at its facing armour. Inverse: ramming a vehicle of equal/greater size sends the attacker out of control.',
        skill: 'operate',
    },
    {
        name: 'Disengage',
        type: ['Full'],
        subtype: ['Operate', 'Defensive'],
        description:
            "Break off from a melee or pursuit. Operate test against the pursuer's opposed Operate; on success the vehicle exits engagement with no opportunity attacks.",
        skill: 'operate',
    },
    {
        name: 'Hot-Wire',
        type: ['Full'],
        subtype: ['Operate', 'Miscellaneous'],
        description:
            'Force-start a vehicle without proper authorisation or recover a stalled engine. Tech-Use (matching vehicle class) test; difficulty per vehicle complexity. Failure leaves the engine cold for the round.',
        skill: 'techUse',
    },
    {
        name: 'Suppress Fire (Vehicle)',
        type: ['Full'],
        subtype: ['Attack', 'Vehicle Weapon'],
        description:
            'Use a vehicle-mounted weapon to suppress an area. Functions identically to the personal Suppressing Fire — Full action; gunner makes a BS test at −20 in a 45° arc; affected enemies must pass a Hard (−20) Pinning test.',
        modifier: -20,
    },
    {
        name: 'Lock On',
        type: ['Half'],
        subtype: ['Aerial', 'Movement', 'Operate'],
        description:
            'Manoeuvre behind an enemy craft. Opposed Challenging (+0) Operate test vs. a single enemy craft; on a win, ending movement able to target it, the pilot and all aboard gain +20 BS vs. that craft. On 3+ degrees of success over the foe, pilot-controlled weapons may fire at it immediately as a Free Action. Other enemies gain +10 BS vs. the pilot’s craft until the start of the pilot’s next turn.',
        skill: 'operate',
        modifier: 20,
        flyerOnly: true,
    },
    {
        name: 'Tight Turn',
        type: ['Full'],
        subtype: ['Aerial', 'Concentration', 'Movement', 'Operate'],
        description:
            'Execute a sharp aerial change of heading. The flyer moves its Tactical Speed; on a Challenging (+0) Operate success the pilot may turn 90° (instead of 45°) each time it moves its own length and may raise or lower Altitude by one level. Failure drops the flyer one Altitude tier (or destabilises it at Ground).',
        skill: 'operate',
        flyerOnly: true,
    },
];

/** Return all canonical vehicle-action names. */
export function getVehicleActionNames(): readonly string[] {
    return VEHICLE_ACTIONS.map((a) => a.name);
}

/** Look up a vehicle action by name (case-sensitive, exact match). */
export function getVehicleAction(name: string): VehicleAction | undefined {
    return VEHICLE_ACTIONS.find((a) => a.name === name);
}

/** Vehicle actions that are gated behind the Flyer trait (Aerial Manoeuvres). */
export function getAerialManoeuvres(): readonly VehicleAction[] {
    return VEHICLE_ACTIONS.filter((a) => a.flyerOnly === true);
}

// ---------------------------------------------------------------------------
// Aerial Manoeuvre resolution (without.md p. 54, L1614-1626)
// ---------------------------------------------------------------------------

/** Stable identifiers for the two Without aerial manoeuvres. */
export type AerialManoeuvreId = 'lock-on' | 'tight-turn';

/** Outcome of an Aerial Manoeuvre, derived purely from the Operate test. */
export interface AerialManoeuvreResult {
    manoeuvre: AerialManoeuvreId;
    /** Did the pilot's Operate test succeed? */
    success: boolean;
    /** i18n key suffix under `WH40K.AerialManoeuvre.<key>`. */
    key: string;
    /** Localisation key for the one-line outcome summary. */
    outcomeKey: string;
    /** Sustained Ballistic-Skill bonus the pilot/crew gain (Lock On). */
    pilotBsBonus: number;
    /** Ballistic-Skill bonus *other* enemies gain vs. the pilot (Lock On). */
    enemyBsBonus: number;
    /**
     * When `true`, the pilot scored 3+ DoS over the opponent and may fire
     * pilot-controlled weapons immediately as a Free Action (Lock On only).
     */
    freeAttack: boolean;
    /** Whether the manoeuvre unlocked 90° turns this move (Tight Turn). */
    tightTurnUnlocked: boolean;
    /** Resulting altitude after the manoeuvre resolves. */
    resultingAltitude: Altitude;
    /**
     * `true` when the failure forced the flyer to descend a tier (or, at
     * Ground, destabilise) — composes with #99's `canChangeAltitude`.
     */
    forcedDescent: boolean;
}

/** Lock On grants +20 BS to the pilot and crew vs. the marked craft. */
export const LOCK_ON_PILOT_BS_BONUS = 20;
/** Lock On gives *other* enemies +10 BS vs. the pilot's craft. */
export const LOCK_ON_ENEMY_BS_BONUS = 10;
/** Degrees-of-success margin over the opponent that unlocks the Free Action. */
export const LOCK_ON_FREE_ATTACK_DOS = 3;

/**
 * Resolve the lower altitude after a failed Tight Turn. Reuses #99's
 * `canChangeAltitude` adjacency so the descent target is the validated
 * next-lower tier; at Ground the flyer cannot descend further and instead
 * destabilises (caller routes to the Out-of-Control / Stall handling).
 */
function descendOneTier(from: Altitude): { altitude: Altitude; destabilised: boolean } {
    const idx = ALTITUDE_ORDER.indexOf(from);
    if (idx <= 0) return { altitude: 'ground', destabilised: true };
    const next = ALTITUDE_ORDER[idx - 1] ?? 'ground';
    // Defensive: the tier table is contiguous so this is always true; the
    // check keeps the composition with #99's validator explicit.
    if (!canChangeAltitude(from, next)) return { altitude: from, destabilised: true };
    return { altitude: next, destabilised: false };
}

/**
 * Pure resolver for an Aerial Manoeuvre given the Operate-test outcome.
 *
 * `success` is the pilot's net result (already opposed for Lock On —
 * the caller resolves the opposed test and passes the boolean plus the
 * winning DoS margin). `currentAltitude` defaults to `low`.
 *
 * No Foundry, no RNG, no I/O — deterministic for tests/stories.
 */
export function resolveAerialManoeuvre(
    manoeuvre: AerialManoeuvreId,
    success: boolean,
    opts: { currentAltitude?: Altitude; dosMargin?: number; altitudeDelta?: -1 | 0 | 1 } = {},
): AerialManoeuvreResult {
    const currentAltitude: Altitude = opts.currentAltitude ?? 'low';

    if (manoeuvre === 'lock-on') {
        const dosMargin = opts.dosMargin ?? 0;
        const freeAttack = success && dosMargin >= LOCK_ON_FREE_ATTACK_DOS;
        return {
            manoeuvre,
            success,
            key: 'LockOn',
            outcomeKey: success ? 'WH40K.AerialManoeuvre.LockOn.OutcomeSuccess' : 'WH40K.AerialManoeuvre.LockOn.OutcomeFail',
            pilotBsBonus: success ? LOCK_ON_PILOT_BS_BONUS : 0,
            // The –lock penalty for *other* enemies applies whether or not
            // the pilot wins — the craft committed to the manoeuvre.
            enemyBsBonus: LOCK_ON_ENEMY_BS_BONUS,
            freeAttack,
            tightTurnUnlocked: false,
            resultingAltitude: currentAltitude,
            forcedDescent: false,
        };
    }

    // Tight Turn
    if (success) {
        const delta = opts.altitudeDelta ?? 0;
        const idx = ALTITUDE_ORDER.indexOf(currentAltitude);
        const rawTarget = ALTITUDE_ORDER[Math.min(ALTITUDE_ORDER.length - 1, Math.max(0, idx + delta))] ?? currentAltitude;
        // The ±1 altitude change is only honoured if #99's validator
        // permits the transition; otherwise the flyer holds altitude.
        const resultingAltitude = canChangeAltitude(currentAltitude, rawTarget) ? rawTarget : currentAltitude;
        return {
            manoeuvre,
            success: true,
            key: 'TightTurn',
            outcomeKey: 'WH40K.AerialManoeuvre.TightTurn.OutcomeSuccess',
            pilotBsBonus: 0,
            enemyBsBonus: 0,
            freeAttack: false,
            tightTurnUnlocked: true,
            resultingAltitude,
            forcedDescent: false,
        };
    }

    const { altitude, destabilised } = descendOneTier(currentAltitude);
    return {
        manoeuvre,
        success: false,
        key: 'TightTurn',
        outcomeKey: destabilised ? 'WH40K.AerialManoeuvre.TightTurn.OutcomeDestabilise' : 'WH40K.AerialManoeuvre.TightTurn.OutcomeFail',
        pilotBsBonus: 0,
        enemyBsBonus: 0,
        freeAttack: false,
        tightTurnUnlocked: false,
        resultingAltitude: altitude,
        forcedDescent: true,
    };
}
