/**
 * Deathwatch Kill-team Cohesion RAW resolver (#162 — core.md §"COHESION", p.9351).
 *
 * Pure functions over a kill-team's Cohesion pool. The caller (sheet,
 * chat card, AssignDamageData horde branch, GM macro) owns I/O and
 * actor lookups; this module owns the table arithmetic, threshold
 * gating, and per-turn caps.
 *
 * Canonical rules referenced here:
 *   - Kill-team Cohesion = squad-leader Fellowship Bonus + Table 7-8
 *     (Rank/Command) value.
 *   - Cohesion damage: when a DW horde/squad takes ≥ 10 damage *pre-soak*
 *     from a weapon with Accurate (basic), Blast, or Devastating, the
 *     squad loses 1 Cohesion. Capped at 1 lost per turn. A successful
 *     Challenging (+0) Command (or Fellowship) test as a Free Action —
 *     "rally" — negates the loss.
 *   - Cohesion Challenge: GM-prompted. Roll 1d10; success on ≤ current
 *     Cohesion. Failure means the squad fragments for the scene.
 *   - Recovery: +1 on objective completion, Fate-point spend, or GM
 *     ruling, never above the kill-team's calculated maximum.
 *
 * No DataModel coupling, no actor lookups, no Foundry imports. The
 * pool value is plain function input; the future squad-actor schema
 * slot is out of scope this round.
 */

/** Pre-soak damage threshold at which a qualifying weapon may strip Cohesion. */
export const COHESION_DAMAGE_THRESHOLD = 10;

/** RAW cap: at most one Cohesion lost per turn regardless of hit count. */
export const COHESION_DAMAGE_PER_TURN_CAP = 1;

/** Die size for the Cohesion Challenge test. */
export const COHESION_CHALLENGE_DIE_SIZE = 10;

/**
 * Weapon qualities that trigger Cohesion damage on a ≥10-pre-soak hit.
 * "Accurate" is the Basic-class form; the trigger only applies when
 * the weapon is `accurate` *and* `basic`. The caller assembles the
 * boolean from the weapon document.
 */
export type CohesionDamagingWeaponQuality = 'accurate-basic' | 'blast' | 'devastating';

/** RNG hook — same shape used by `dw-horde-magnitude` callers: returns 1..size inclusive. */
export type CohesionRng = (size: number) => number;

/** Source label for a recovery event (drives the chat card / i18n lookup). */
export type CohesionRecoverySource = 'objective' | 'fate' | 'gm';

/** Reason a `applyCohesionDamage` call returned a loss / no-loss. */
export type CohesionLossReason = 'below-threshold' | 'unqualified-weapon' | 'rallied' | 'cap-reached' | 'already-empty' | 'lost';

/* -------------------------------------------- */
/*  Maximum Cohesion                            */
/* -------------------------------------------- */

/**
 * Kill-team Cohesion pool maximum.
 *
 * RAW: leader's Fellowship Bonus (i.e. Fel ÷ 10) plus the Rank/Command
 * row value from Table 7-8. Both inputs are clamped to non-negative
 * integers; the caller is responsible for resolving the leader's
 * Fellowship Bonus (`floor(Fel / 10)`) and the table lookup.
 *
 * @param leaderFellowshipBonus Squad leader's Fellowship Bonus (Fel ÷ 10).
 * @param rankCommandValue Row value from Table 7-8 (Rank/Command).
 * @returns The kill-team's maximum Cohesion (always ≥ 0).
 */
export function maxCohesion(leaderFellowshipBonus: number, rankCommandValue: number): number {
    const fb = sanitiseNonNegativeInt(leaderFellowshipBonus);
    const rc = sanitiseNonNegativeInt(rankCommandValue);
    return fb + rc;
}

/* -------------------------------------------- */
/*  Cohesion damage                             */
/* -------------------------------------------- */

/** Input shape for {@link applyCohesionDamage}. */
export interface ApplyCohesionDamageArgs {
    /** Pre-soak damage from the single resolved hit (or hit cluster). */
    damage: number;
    /** Qualifying weapon trigger, or `null` if the weapon does not qualify. */
    weapon: CohesionDamagingWeaponQuality | null;
    /** Current Cohesion pool value before this hit resolves. */
    currentCohesion: number;
    /** Cohesion already lost this turn (so the per-turn cap can be enforced). */
    alreadyLostThisTurn: number;
    /** Whether the squad has successfully rallied (Free-Action Command test) this turn. */
    rallied: boolean;
}

/** Result shape returned by {@link applyCohesionDamage}. */
export interface ApplyCohesionDamageResult {
    /** Cohesion pool value after this resolution. */
    newCohesion: number;
    /** Amount removed by this resolution (0 or 1; RAW cap). */
    cohesionLost: number;
    /** Diagnostic / chat-card reason code. */
    reason: CohesionLossReason;
}

/**
 * Resolve whether a single pre-soak damage event strips a point of
 * Cohesion. The caller decides what counts as a "turn" — they pass
 * `alreadyLostThisTurn` so the per-turn cap stays honest across
 * multiple hits.
 *
 * Order of gates (each terminates the call):
 *   1. Squad already at 0 → `already-empty`.
 *   2. Squad has rallied this turn → `rallied`.
 *   3. Pool's per-turn cap already met → `cap-reached`.
 *   4. Weapon does not qualify → `unqualified-weapon`.
 *   5. Damage below threshold → `below-threshold`.
 *   6. Otherwise → `lost`, removes 1.
 */
export function applyCohesionDamage(args: ApplyCohesionDamageArgs): ApplyCohesionDamageResult {
    const current = sanitiseNonNegativeInt(args.currentCohesion);
    const alreadyLost = sanitiseNonNegativeInt(args.alreadyLostThisTurn);

    if (current <= 0) {
        return { newCohesion: 0, cohesionLost: 0, reason: 'already-empty' };
    }
    if (args.rallied) {
        return { newCohesion: current, cohesionLost: 0, reason: 'rallied' };
    }
    if (alreadyLost >= COHESION_DAMAGE_PER_TURN_CAP) {
        return { newCohesion: current, cohesionLost: 0, reason: 'cap-reached' };
    }
    if (args.weapon === null) {
        return { newCohesion: current, cohesionLost: 0, reason: 'unqualified-weapon' };
    }
    if (!Number.isFinite(args.damage) || args.damage < COHESION_DAMAGE_THRESHOLD) {
        return { newCohesion: current, cohesionLost: 0, reason: 'below-threshold' };
    }
    return { newCohesion: current - 1, cohesionLost: 1, reason: 'lost' };
}

/* -------------------------------------------- */
/*  Cohesion Challenge                          */
/* -------------------------------------------- */

/** Result shape returned by {@link cohesionChallenge}. */
export interface CohesionChallengeResult {
    /** The d10 value rolled by the RNG (1..10). */
    rolled: number;
    /** Whether the test succeeded: `rolled ≤ currentCohesion`. */
    success: boolean;
}

/**
 * GM-prompted Cohesion Challenge: the squad must roll 1d10 and score
 * at or below their current Cohesion to remain coherent. A Cohesion
 * of 0 is an automatic failure (no d10 can roll ≤ 0). RNG is
 * injectable so tests / chat-card replays stay deterministic.
 *
 * @param currentCohesion Current Cohesion pool value.
 * @param rng RNG returning an integer in `[1, size]`.
 */
export function cohesionChallenge(args: { currentCohesion: number; rng: CohesionRng }): CohesionChallengeResult {
    const current = sanitiseNonNegativeInt(args.currentCohesion);
    const raw = args.rng(COHESION_CHALLENGE_DIE_SIZE);
    const rolled = clampDie(raw, COHESION_CHALLENGE_DIE_SIZE);
    return { rolled, success: rolled <= current && current > 0 };
}

/* -------------------------------------------- */
/*  Recovery                                    */
/* -------------------------------------------- */

/** Result shape returned by {@link recoverCohesion}. */
export interface RecoverCohesionResult {
    /** Cohesion value after recovery (clamped to `max`). */
    newCohesion: number;
    /** Amount actually gained (0 if already at max). */
    gained: number;
}

/**
 * Recover 1 point of Cohesion. RAW allows this on objective
 * completion, Fate-point spend, or GM ruling — the `source` argument
 * is passed through for chat-card / log display rather than gating
 * the recovery amount.
 *
 * Negative `currentCohesion` is clamped to 0 before adding; the result
 * never exceeds `max`. If `max` is non-positive the recovery is a
 * no-op (a zero-max pool can't gain).
 */
export function recoverCohesion(currentCohesion: number, max: number, _source: CohesionRecoverySource): RecoverCohesionResult {
    const current = sanitiseNonNegativeInt(currentCohesion);
    const ceiling = sanitiseNonNegativeInt(max);
    if (ceiling <= 0) {
        return { newCohesion: 0, gained: 0 };
    }
    if (current >= ceiling) {
        return { newCohesion: ceiling, gained: 0 };
    }
    return { newCohesion: current + 1, gained: 1 };
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */

function sanitiseNonNegativeInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const v = Math.trunc(value);
    return v < 0 ? 0 : v;
}

function clampDie(value: number, size: number): number {
    if (!Number.isFinite(value)) return 1;
    const v = Math.trunc(value);
    if (v < 1) return 1;
    if (v > size) return size;
    return v;
}
