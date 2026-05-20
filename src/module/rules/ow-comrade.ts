/**
 * Only War "Comrade in Combat" RAW resolver (#152 — core.md
 * §"COMRADES IN COMBAT" p.12137).
 *
 * Pure functions over a single PC ↔ Comrade pair. The caller (character
 * DataModel, sheet action handler, damage-pipeline hook, chat card)
 * owns I/O, actor lookups, and persistent state mutation; this module
 * owns the cohesion check, the state-track transitions, the hit-transfer
 * decision, and the auto-mirror gates for Fear / Pinning / mental death.
 *
 * Canonical rules referenced here:
 *   - Each PC has exactly ONE Comrade. Comrades take no Tests and no
 *     Reactions of their own; they act on the PC's turn.
 *   - Cohesion: the Comrade is "in Cohesion" while within 5 metres of
 *     their PC AND the PC has visual line on them. The "Maintain / Break
 *     Cohesion" action is a Half Action handled by the caller — this
 *     module only resolves the boolean check.
 *   - State track: unharmed → wounded → dead. A Comrade hit advances
 *     one step; a fully healed Comrade reverts wounded → unharmed.
 *     Death is terminal until a replacement is granted.
 *   - Replacement: a dead Comrade can be replaced (e.g. between missions,
 *     by Regiment Resource spend) provided a replacement is actually
 *     available; the replacement enters play unharmed.
 *   - Doubles-on-PC-hit: when a hit roll against the PC comes up
 *     doubles (11, 22, …, 99) and the Comrade is in Cohesion, one of
 *     those hits is transferred to the Comrade.
 *   - Blast / Spray weapons that catch the PC also catch the Comrade
 *     automatically when the Comrade is within the template / spray
 *     footprint (regardless of doubles).
 *   - Fear & Pinning: a Comrade in Cohesion auto-mirrors the PC's
 *     result — if the PC fails a Fear test, so does the Comrade; if
 *     the PC is Pinned, so is the Comrade. Out of Cohesion the Comrade
 *     is unaffected (the GM resolves them separately or hand-waves).
 *   - Mental damage death: 10 or more points of Insanity OR Corruption
 *     suffered by the PC in a single round kills the Comrade outright
 *     (the strain of witnessing it severs the bond).
 *
 * Out of scope this round (DataModel slot, sheet panel, damage-pipeline
 * hook, chat card): the actual `system.ow.comrade` storage, the
 * Maintain/Break Cohesion action button, the AssignDamageData branch
 * that consults `transfersToComrade`, and the Storybook story for the
 * Comrade panel. Those land in follow-ups so this engine stays a pure
 * rules module with no Foundry coupling.
 */

/** Visual-line cohesion radius for a Comrade, in metres (RAW §"COMRADES IN COMBAT" p.12137). */
export const COMRADE_COHESION_RANGE_M = 5;

/** Insanity-in-one-round threshold that kills the Comrade outright (RAW p.12137). */
export const COMRADE_INSANITY_DEATH_THRESHOLD = 10;

/** Corruption-in-one-round threshold that kills the Comrade outright (RAW p.12137). */
export const COMRADE_CORRUPTION_DEATH_THRESHOLD = 10;

/** Health-track state for a Comrade in Combat. */
export type ComradeState = 'unharmed' | 'wounded' | 'dead';

/** Why {@link transfersToComrade} returned `transfers: true`, or `'none'` when it didn't. */
export type ComradeHitTransferReason = 'doubles' | 'blast-spray' | 'none';

/* -------------------------------------------- */
/*  Cohesion check                              */
/* -------------------------------------------- */

/** Input shape for {@link inCohesion}. */
export interface InCohesionArgs {
    /** Distance from the PC to the Comrade, in metres. */
    distanceM: number;
    /** Whether the PC has visual line of sight on the Comrade. */
    hasVisualLine: boolean;
}

/**
 * Resolve whether a Comrade is currently "in Cohesion" with their PC.
 *
 * RAW (p.12137): Cohesion is maintained while the Comrade is within
 * 5 metres of their PC AND the PC has visual line on them. Both
 * conditions must hold; either failing breaks Cohesion.
 *
 * The 5 m threshold is inclusive — a Comrade exactly 5 m away is still
 * in support; 5.0001 m is not. Negative or non-finite distances are
 * coerced to 0 (same point).
 */
export function inCohesion(args: InCohesionArgs): boolean {
    if (!args.hasVisualLine) return false;
    const distance = sanitiseNonNegativeDistance(args.distanceM);
    return distance <= COMRADE_COHESION_RANGE_M;
}

/* -------------------------------------------- */
/*  State-track transitions                     */
/* -------------------------------------------- */

/** Result shape for {@link applyComradeHit}, {@link healComrade}, {@link replaceComrade}. */
export interface ComradeStateTransition {
    /** The Comrade's state after the (attempted) transition. */
    newState: ComradeState;
    /** Whether the state actually changed (false on no-ops). */
    transitioned: boolean;
}

/** Extended result shape for {@link replaceComrade} — also reports whether the replacement fired. */
export interface ComradeReplaceResult extends ComradeStateTransition {
    /** Whether a replacement Comrade entered play (true only on dead → unharmed). */
    replaced: boolean;
}

/**
 * Apply one hit's worth of damage to the Comrade's state track.
 *
 * RAW: unharmed → wounded, wounded → dead, dead → dead. The track has
 * no granular wound count — the Comrade is an NPC abstraction, not a
 * full creature, so one transfer = one step.
 */
export function applyComradeHit(state: ComradeState): ComradeStateTransition {
    if (state === 'unharmed') return { newState: 'wounded', transitioned: true };
    if (state === 'wounded') return { newState: 'dead', transitioned: true };
    return { newState: 'dead', transitioned: false };
}

/**
 * Heal the Comrade by one step.
 *
 * RAW: a wounded Comrade can be patched up between scenes / by Medicae
 * to return to unharmed. Dead is terminal until a replacement is granted
 * (see {@link replaceComrade}); unharmed cannot be healed further.
 */
export function healComrade(state: ComradeState): ComradeStateTransition {
    if (state === 'wounded') return { newState: 'unharmed', transitioned: true };
    return { newState: state, transitioned: false };
}

/**
 * Replace a dead Comrade with a fresh one.
 *
 * RAW: only valid when the existing Comrade is dead AND a replacement
 * is actually available (Regiment ruling, downtime, GM fiat). The new
 * Comrade enters play unharmed. Calling on a living Comrade is a no-op
 * even if a replacement is available — you don't get to swap a wounded
 * Comrade out for a fresh one mid-scene.
 */
export function replaceComrade(state: ComradeState, replacementAvailable: boolean): ComradeReplaceResult {
    if (state === 'dead' && replacementAvailable) {
        return { newState: 'unharmed', transitioned: true, replaced: true };
    }
    return { newState: state, transitioned: false, replaced: false };
}

/* -------------------------------------------- */
/*  Hit transfer                                */
/* -------------------------------------------- */

/** Input shape for {@link transfersToComrade}. */
export interface HitTransferContext {
    /** Whether the attacker's hit roll against the PC came up doubles (11, 22, …, 99). */
    pcRollDoubles: boolean;
    /** Whether the Comrade is currently in Cohesion with the PC. */
    comradeInCohesion: boolean;
    /** Whether the incoming weapon has the Blast or Spray quality. */
    weaponBlastOrSpray: boolean;
    /** Whether the Comrade falls inside the Blast / Spray footprint. */
    comradeInBlastSprayRange: boolean;
}

/** Result shape for {@link transfersToComrade}. */
export interface HitTransferResult {
    /** Whether one of the incoming hits transfers to the Comrade. */
    transfers: boolean;
    /** Which RAW path triggered the transfer (or `'none'` when no transfer). */
    reason: ComradeHitTransferReason;
}

/**
 * Resolve whether a hit on the PC also lands on the Comrade.
 *
 * RAW gates (p.12137):
 *   - Doubles: when the hit roll against the PC is doubles AND the
 *     Comrade is in Cohesion, one hit transfers. Doubles outside
 *     Cohesion does NOT transfer (the Comrade is too far / out of
 *     line to be caught by the spread).
 *   - Blast / Spray: when the incoming weapon is Blast or Spray AND
 *     the Comrade is inside the template / spray footprint, the
 *     Comrade is hit automatically (regardless of doubles and
 *     regardless of the 5 m Cohesion gate — what matters for these
 *     is the area template, not the social bond).
 *
 * The doubles path is checked first because it's the simpler / more
 * common RAW trigger; blast-spray is the catch-all when the area
 * footprint covers the Comrade even when no doubles came up.
 */
export function transfersToComrade(ctx: HitTransferContext): HitTransferResult {
    if (ctx.pcRollDoubles && ctx.comradeInCohesion) {
        return { transfers: true, reason: 'doubles' };
    }
    if (ctx.weaponBlastOrSpray && ctx.comradeInBlastSprayRange) {
        return { transfers: true, reason: 'blast-spray' };
    }
    return { transfers: false, reason: 'none' };
}

/* -------------------------------------------- */
/*  Fear / Pinning auto-mirror                  */
/* -------------------------------------------- */

/** Input shape for {@link comradeMirrorsFearPinning}. */
export interface FearPinningMirrorArgs {
    /** Whether the PC failed their Fear test this beat. */
    pcFailedFear: boolean;
    /** Whether the PC is currently Pinned. */
    pcPinned: boolean;
    /** Whether the Comrade is in Cohesion with the PC. */
    comradeInCohesion: boolean;
}

/** Result shape for {@link comradeMirrorsFearPinning}. */
export interface FearPinningMirrorResult {
    /** Whether the Comrade fails the Fear test in lockstep with the PC. */
    failsFear: boolean;
    /** Whether the Comrade is Pinned in lockstep with the PC. */
    pinned: boolean;
}

/**
 * Resolve the Comrade's Fear / Pinning state by mirroring the PC.
 *
 * RAW: a Comrade in Cohesion takes no Fear / Pinning Tests of their
 * own — they simply share the PC's outcome. Out of Cohesion the
 * Comrade is treated as unaffected by this rule (the GM may still
 * narrate them separately, but the auto-mirror does not fire).
 */
export function comradeMirrorsFearPinning(args: FearPinningMirrorArgs): FearPinningMirrorResult {
    if (!args.comradeInCohesion) {
        return { failsFear: false, pinned: false };
    }
    return { failsFear: args.pcFailedFear, pinned: args.pcPinned };
}

/* -------------------------------------------- */
/*  Mental-damage death                         */
/* -------------------------------------------- */

/** Input shape for {@link comradeDiesFromMentalDamage}. */
export interface ComradeMentalDamageArgs {
    /** Insanity points the PC accrued in the current round. */
    insanityThisRound: number;
    /** Corruption points the PC accrued in the current round. */
    corruptionThisRound: number;
}

/**
 * Resolve whether the Comrade dies outright from the PC's mental damage.
 *
 * RAW (p.12137): a Comrade dies the round their PC takes 10 or more
 * Insanity OR 10 or more Corruption. The thresholds are independent —
 * either crossing it is enough. Per-round; the caller resets the
 * counters at round boundaries.
 *
 * Negative or non-finite inputs are coerced to 0 (the bookkeeping
 * never goes below zero); fractional inputs are floored.
 */
export function comradeDiesFromMentalDamage(args: ComradeMentalDamageArgs): boolean {
    const insanity = sanitiseNonNegativeInt(args.insanityThisRound);
    const corruption = sanitiseNonNegativeInt(args.corruptionThisRound);
    return insanity >= COMRADE_INSANITY_DEATH_THRESHOLD || corruption >= COMRADE_CORRUPTION_DEATH_THRESHOLD;
}

/* -------------------------------------------- */
/*  internals                                   */
/* -------------------------------------------- */

function sanitiseNonNegativeInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const v = Math.trunc(value);
    return v < 0 ? 0 : v;
}

function sanitiseNonNegativeDistance(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return value < 0 ? 0 : value;
}
