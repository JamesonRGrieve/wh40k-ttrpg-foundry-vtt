/**
 * Only War "Healing Comrades" + replacement-on-return-to-camp RAW resolver
 * (#157 — core.md §"Healing Comrades" p.12269; replacement p.12261).
 *
 * Pure functions that complement {@link ../rules/ow-comrade} by handling the
 * out-of-combat recovery clock and the camp-return replacement decision.
 * The caller (character DataModel, sheet action handler, downtime chat
 * card) owns I/O, scheduling, and persistent state mutation; this module
 * owns the day arithmetic, the Difficult(-10) Medicae reduction, and the
 * gating of replacement on death + refit availability.
 *
 * Canonical rules referenced here:
 *   - Auto-recovery: a wounded Comrade automatically recovers after 7
 *     full days of rest. The clock is per-Comrade, not per-PC, and only
 *     ticks while the Comrade is wounded (the caller decides when a day
 *     elapses; this module just subtracts).
 *   - Medicae shortcut: ONE Difficult(-10) Medicae Test per wounded
 *     Comrade reduces the remaining recovery days by the test's
 *     Degrees of Success (DoS). DoS of 0 (a bare success) does
 *     nothing — the rule keys off DoS, not on the boolean pass/fail.
 *     Subtraction clamps at 0; you can't push remaining days negative
 *     to "pre-heal" a future wound.
 *   - Replacement on return to camp: when the squad returns to camp,
 *     a dead Comrade can be replaced provided refit logistics are
 *     actually available (Regiment Resource spend, Munitorum supply,
 *     GM ruling). Replacement only fires on death — a wounded Comrade
 *     stays wounded; a living Comrade is unaffected. The replacement
 *     enters play unharmed.
 *
 * It also owns the actor update every Comrade state change makes
 * ({@link comradeStateChange}) and the healing panel's view
 * ({@link buildComradeHealingPanel}). It stays a pure rules module with no
 * Foundry coupling. Hit-track transitions and Cohesion live
 * in {@link ../rules/ow-comrade}; this module imports the {@link ComradeState}
 * union from there to stay schema-aligned.
 */

import type { ComradeState } from './ow-comrade';

/** RAW auto-recovery clock: a wounded Comrade is back on their feet after 7 days. */
export const OW_COMRADE_AUTO_RECOVERY_DAYS = 7;

/** RAW Medicae shortcut difficulty: Difficult(-10) Medicae Test (p.12269). */
export const OW_COMRADE_MEDICAE_DIFFICULTY_MODIFIER = -10;

/* -------------------------------------------- */
/*  Recovery clock                              */
/* -------------------------------------------- */

/** Input shape for {@link tickComradeRecovery}. */
export interface TickComradeRecoveryArgs {
    /** Days of recovery still owed before the Comrade is back to unharmed. */
    remainingDays: number;
    /** Days of in-fiction rest that have elapsed since the last tick. */
    daysElapsed: number;
}

/** Result shape for {@link tickComradeRecovery}. */
export interface TickComradeRecoveryResult {
    /** Days still owed after the elapsed days were subtracted, clamped at 0. */
    remainingDays: number;
    /** Whether the Comrade has finished recovery (remainingDays reached 0). */
    recovered: boolean;
}

/**
 * Advance the recovery clock by `daysElapsed` whole days.
 *
 * RAW: a wounded Comrade is fully recovered after {@link OW_COMRADE_AUTO_RECOVERY_DAYS}
 * days of rest. The caller starts the clock at 7 when the wound is taken
 * and ticks it down as fictional days pass. Once `remainingDays` reaches
 * 0 the Comrade is recovered — the caller is responsible for flipping the
 * Comrade's {@link ComradeState} from `wounded` back to `unharmed`.
 *
 * Negative or non-finite inputs are coerced to 0; fractional inputs are
 * floored. Subtracting past 0 clamps at 0 (no negative bank of "extra
 * recovery" carrying forward to the next wound).
 */
export function tickComradeRecovery(args: TickComradeRecoveryArgs): TickComradeRecoveryResult {
    const remaining = sanitiseNonNegativeInt(args.remainingDays);
    const elapsed = sanitiseNonNegativeInt(args.daysElapsed);
    const next = remaining - elapsed;
    const clamped = next < 0 ? 0 : next;
    return { remainingDays: clamped, recovered: clamped <= 0 };
}

/* -------------------------------------------- */
/*  Medicae shortcut                            */
/* -------------------------------------------- */

/** Input shape for {@link applyMedicaeAttempt}. */
export interface ApplyMedicaeAttemptArgs {
    /** Days of recovery still owed before the Medicae test. */
    remainingDays: number;
    /**
     * Degrees of Success on the Difficult(-10) Medicae Test. 0 on a bare
     * success (or any failure — the caller should pass 0 there too, since
     * a failed test reduces nothing per RAW). Non-integer / negative
     * inputs are floored / clamped to 0.
     */
    degreesOfSuccess: number;
}

/** Result shape for {@link applyMedicaeAttempt}. */
export interface ApplyMedicaeAttemptResult {
    /** Days still owed after the Medicae reduction, clamped at 0. */
    remainingDays: number;
    /** Days actually shaved off by this attempt (after the 0-floor clamp). */
    reducedBy: number;
}

/**
 * Apply ONE Difficult(-10) Medicae Test result to a wounded Comrade's
 * recovery clock.
 *
 * RAW (p.12269): the test reduces remaining recovery days by its DoS.
 * A bare success (0 DoS) does nothing — the rule keys off Degrees, not
 * pass/fail. The caller is responsible for enforcing the "one attempt
 * per Comrade per wound" gate; this module just does the arithmetic.
 *
 * The clamp at 0 matters: a 4-DoS Medicae on a Comrade with 3 days left
 * reduces to 0 (not -1), and `reducedBy` reports 3 (the actual saving),
 * not 4 (the gross DoS). This keeps reporting honest for chat-card
 * summaries that want to say "Medicae shaved 3 days off recovery".
 */
export function applyMedicaeAttempt(args: ApplyMedicaeAttemptArgs): ApplyMedicaeAttemptResult {
    const remaining = sanitiseNonNegativeInt(args.remainingDays);
    const dos = sanitiseNonNegativeInt(args.degreesOfSuccess);
    const next = remaining - dos;
    const clamped = next < 0 ? 0 : next;
    return { remainingDays: clamped, reducedBy: remaining - clamped };
}

/* -------------------------------------------- */
/*  Replacement on return to camp               */
/* -------------------------------------------- */

/** Reason {@link processReplacement} did not replace the Comrade, when applicable. */
export type ReplacementSkipReason = 'not-dead' | 'no-refit';

/** Input shape for {@link processReplacement}. */
export interface ReplacementRequest {
    /** The Comrade's state at the moment the squad returns to camp. */
    stateAtCamp: ComradeState;
    /** Whether refit logistics actually allow a replacement to be issued. */
    refitAvailable: boolean;
}

/** Result shape for {@link processReplacement}. */
export interface ReplacementResult {
    /** Whether a replacement Comrade entered play (true only on dead + refit). */
    replaced: boolean;
    /** The Comrade's state after the (attempted) replacement. */
    newState: ComradeState;
    /** Why the replacement did not fire, when `replaced` is false. */
    reason?: ReplacementSkipReason;
}

/**
 * Decide whether a dead Comrade is replaced when the squad returns to camp.
 *
 * RAW (p.12261): a dead Comrade can be replaced on return to camp
 * provided refit logistics are available. A living Comrade (unharmed or
 * wounded) is unaffected — wounds are handled by the auto-recovery clock
 * and the Medicae shortcut, not by replacement.
 *
 * The skip reasons are reported explicitly so the caller (downtime chat
 * card, sheet notification) can surface the correct "no replacement
 * because…" message instead of guessing from the state.
 */
export function processReplacement(req: ReplacementRequest): ReplacementResult {
    if (req.stateAtCamp !== 'dead') {
        return { replaced: false, newState: req.stateAtCamp, reason: 'not-dead' };
    }
    if (!req.refitAvailable) {
        return { replaced: false, newState: req.stateAtCamp, reason: 'no-refit' };
    }
    return { replaced: true, newState: 'unharmed' };
}

/* -------------------------------------------- */
/*  State changes and the panel view            */
/* -------------------------------------------- */

/**
 * The actor-system update one Comrade state change makes, keyed by update path.
 * Every action that moves the Comrade's state (Wound, Heal, Replace, a recovery
 * tick or a Medicae test that finishes the clock) writes it in one update so the
 * recovery clock never disagrees with the state.
 */
export interface ComradeStateChange {
    'system.comrade.state': ComradeState;
    'system.comradeRecoveryDays': number;
    'system.comradeMedicaeUsed'?: boolean;
    'system.refitAvailable'?: boolean;
}

/**
 * The update for a Comrade moving from `previous` to `next` (OW Core p.271):
 *   - newly wounded: the seven-day recovery clock starts and the wound gets its
 *     one Medicae attempt;
 *   - still wounded (a no-op hit): the clock keeps running;
 *   - unharmed (healed, recovered or replaced): the clock clears; a dead
 *     Comrade coming back is a replacement, which uses up the camp refit;
 *   - dead: the clock clears.
 */
export function comradeStateChange(previous: ComradeState, next: ComradeState, remainingDays: number): ComradeStateChange {
    if (next === 'wounded') {
        return previous === 'wounded'
            ? { 'system.comrade.state': next, 'system.comradeRecoveryDays': sanitiseNonNegativeInt(remainingDays) }
            : { 'system.comrade.state': next, 'system.comradeRecoveryDays': OW_COMRADE_AUTO_RECOVERY_DAYS, 'system.comradeMedicaeUsed': false };
    }
    if (next === 'unharmed') {
        const change: ComradeStateChange = { 'system.comrade.state': next, 'system.comradeRecoveryDays': 0, 'system.comradeMedicaeUsed': false };
        if (previous === 'dead') change['system.refitAvailable'] = false;
        return change;
    }
    return { 'system.comrade.state': next, 'system.comradeRecoveryDays': 0 };
}

/** The Comrade-healing state the actor persists. */
export interface ComradeHealingRecord {
    state: ComradeState;
    /** Days of recovery still owed (`system.comradeRecoveryDays`). */
    recoveryDays: number;
    /** Back in camp for refitting (`system.refitAvailable`). */
    refitAvailable: boolean;
    /** The wound's one Medicae attempt is spent (`system.comradeMedicaeUsed`). */
    medicaeUsed: boolean;
}

/** The healing panel's status badge. */
export type ComradeHealingStatus = 'recovering' | 'ready' | 'dead';

const HEALING_STATUS_LABEL_KEYS: Record<ComradeHealingStatus, string> = {
    recovering: 'WH40K.OW.ComradeHealing.Status.Recovering',
    ready: 'WH40K.OW.ComradeHealing.Status.Ready',
    dead: 'WH40K.OW.Comrade.State.Dead',
};

/** Every value the "Healing Comrades" panel renders (#157). */
export interface ComradeHealingPanelView {
    comradeState: ComradeState;
    recoveryDays: number;
    autoRecoveryTotal: number;
    refitAvailable: boolean;
    medicaeUsed: boolean;
    medicaeDifficulty: number;
    status: ComradeHealingStatus;
    statusKey: string;
    isRecovering: boolean;
    isReady: boolean;
    isDead: boolean;
    canTick: boolean;
    canMedicae: boolean;
    canReplace: boolean;
}

/**
 * The healing panel's view of the Comrade. The button gates come from the same
 * rules the actions apply: a recovery day and the one Medicae attempt only
 * while a wound is healing, and replacement only for a dead Comrade back in
 * camp ({@link processReplacement}).
 */
export function buildComradeHealingPanel(record: ComradeHealingRecord): ComradeHealingPanelView {
    const recoveryDays = sanitiseNonNegativeInt(record.recoveryDays);
    const isRecovering = record.state === 'wounded';
    const isDead = record.state === 'dead';
    const status: ComradeHealingStatus = isDead ? 'dead' : isRecovering ? 'recovering' : 'ready';
    const healing = isRecovering && recoveryDays > 0;
    return {
        comradeState: record.state,
        recoveryDays,
        autoRecoveryTotal: OW_COMRADE_AUTO_RECOVERY_DAYS,
        refitAvailable: record.refitAvailable,
        medicaeUsed: record.medicaeUsed,
        medicaeDifficulty: OW_COMRADE_MEDICAE_DIFFICULTY_MODIFIER,
        status,
        statusKey: HEALING_STATUS_LABEL_KEYS[status],
        isRecovering,
        isReady: status === 'ready',
        isDead,
        canTick: healing,
        canMedicae: healing && !record.medicaeUsed,
        canReplace: processReplacement({ stateAtCamp: record.state, refitAvailable: record.refitAvailable }).replaced,
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
