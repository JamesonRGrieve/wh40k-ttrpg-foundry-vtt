/**
 * Only War "Comrades in Combat" (#152; OW Core pp. 269–271, "Losing and
 * Replacing Comrades" p. 110).
 *
 * Pure functions over one PC ↔ Comrade pair. The caller (the character sheet,
 * the roll pipeline, the damage path, a chat card) owns I/O, actor lookups and
 * persistence; this module owns the rules:
 *
 *   - Cohesion: the Comrade is close to its Player Character with no solid
 *     barrier between them. The line's values live on its game-system config
 *     (`comradeRules`).
 *   - The state track: unharmed → wounded → dead; a wounded Comrade can't Run.
 *   - The hit transfer: a successful hit roll
 *     against the PC that comes up doubles strikes a Comrade in Cohesion instead
 *     (one hit of a multi-hit attack); Blast and Spray catch any Comrade in their
 *     area.
 *   - Fear and Pinning: the Comrade passes or fails with its PC, unless it is
 *     immune. A failed Fear test means it flees (the worst band of the Fear table)
 *     until the end of combat or a recovery Order; a failed Pinning test sends it
 *     to cover with no Actions until a recovery Order.
 *   - Insanity and Corruption: a Comrade that would take 10 of either in one
 *     Round dies.
 *   - Replacement: a dead Comrade is replaced at downtime (the
 *     squad back in camp for refitting).
 *
 * The Comrade's Orders and its action budget are `rules/ow-orders.ts`.
 */

import type { CombatRoundStamp } from './counter-attack.ts';

/** A line's printed Comrade rules (OW Core pp. 269–271), on its game-system config. */
export interface ComradeRules {
    /** Cohesion radius in metres ("within 5 metres", p. 269). */
    readonly cohesionRangeM: number;
    /** Half Actions a Comrade has per Turn ("two Half Actions or one Full Action", p. 269). */
    readonly actionBudget: number;
    /** Insanity or Corruption in one Round that kills the Comrade ("10 Insanity or 10 Corruption", p. 271). */
    readonly mentalDeathThreshold: number;
}

/** Health-track state for a Comrade in Combat. */
export type ComradeState = 'unharmed' | 'wounded' | 'dead';

/** Why {@link transfersToComrade} returned `transfers: true`, or `'none'` when it didn't. */
type ComradeHitTransferReason = 'doubles' | 'blast-spray' | 'none';

/* -------------------------------------------- */
/*  Cohesion check                              */
/* -------------------------------------------- */

/** Input shape for {@link inCohesion}. */
export interface InCohesionArgs {
    /** Distance from the PC to the Comrade, in metres. */
    distanceM: number;
    /** Whether no solid barrier separates the PC and the Comrade (RAW Cohesion, p.269). */
    hasVisualLine: boolean;
}

/**
 * Whether a Comrade is "in Cohesion" with its PC (p. 269): within the line's
 * Cohesion radius (inclusive) and not separated by a solid barrier. Either
 * failing breaks it. Negative or non-finite distances read as 0 (same point).
 */
export function inCohesion(args: InCohesionArgs, rules: ComradeRules): boolean {
    if (!args.hasVisualLine) return false;
    return sanitiseNonNegativeDistance(args.distanceM) <= rules.cohesionRangeM;
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
 * One hit on the Comrade's state track: a weapon hit wounds an unharmed Comrade
 * and kills a wounded one. No wound count: one hit is one step.
 */
export function applyComradeHit(state: ComradeState): ComradeStateTransition {
    if (state === 'unharmed') return { newState: 'wounded', transitioned: true };
    if (state === 'wounded') return { newState: 'dead', transitioned: true };
    return { newState: 'dead', transitioned: false };
}

/**
 * Heal the Comrade by one step: a wounded Comrade returns to unharmed. Dead is
 * terminal until a replacement (see {@link replaceComrade}).
 */
export function healComrade(state: ComradeState): ComradeStateTransition {
    if (state === 'wounded') return { newState: 'unharmed', transitioned: true };
    return { newState: state, transitioned: false };
}

/**
 * Replace a dead Comrade with a fresh one: only a dead Comrade, and only when a
 * replacement is available (p. 110: "the Squad will have to wait until they have
 * downtime at an Imperial Guard base"). The new Comrade enters play unharmed.
 */
export function replaceComrade(state: ComradeState, replacementAvailable: boolean): ComradeReplaceResult {
    if (state === 'dead' && replacementAvailable) {
        return { newState: 'unharmed', transitioned: true, replaced: true };
    }
    return { newState: state, transitioned: false, replaced: false };
}

/* -------------------------------------------- */
/*  Panel view                                  */
/* -------------------------------------------- */

/** The Comrade's actions spent in one combat Round (its Turn). */
export interface ComradeTurnRecord {
    combatId: string;
    round: number;
    /** Half Actions spent (a Full Action is two). */
    halvesSpent: number;
}

/** The Insanity and Corruption a Comrade has suffered in one combat Round. */
interface ComradeMentalTally {
    combatId: string;
    round: number;
    insanity: number;
    corruption: number;
}

/** The stored Comrade (`system.comrade`). */
export interface ComradeRecord {
    name: string;
    state: ComradeState;
    distanceM: number;
    /** Whether PC and Comrade are free of a solid barrier between them (RAW Cohesion, p.269). */
    hasVisualLine: boolean;
    /** Failed a Fear test with its PC: flees (Table 9–5, 81–100) until the end of combat or a recovery Order. */
    fleeing: boolean;
    /** Failed a Pinning test with its PC: in cover, no Actions until a recovery Order. */
    pinned: boolean;
    /** Benefits from an ability that makes it immune to Fear. */
    fearImmune: boolean;
    /** Benefits from an ability that makes it immune to Pinning. */
    pinningImmune: boolean;
    turn: ComradeTurnRecord;
    mental: ComradeMentalTally;
}

const COMRADE_STATES: ReadonlySet<string> = new Set<ComradeState>(['unharmed', 'wounded', 'dead']);

/**
 * The Comrade stored on an actor's system data (`system.comrade`), or null when the
 * actor type has none. Every character DataModel carries the slot; this reads it
 * off the actor-type union without a cast.
 */
export function readComradeRecord(system: object): ComradeRecord | null {
    if (!('comrade' in system)) return null;
    const { comrade } = system;
    return isComradeRecord(comrade) ? comrade : null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: the slot is read off an actor-type union; narrowed by this guard
function isComradeRecord(value: unknown): value is ComradeRecord {
    if (typeof value !== 'object' || value === null) return false;
    return 'state' in value && typeof value.state === 'string' && COMRADE_STATES.has(value.state) && 'name' in value && typeof value.name === 'string';
}

/** Langpack label of each Comrade state. */
export const COMRADE_STATE_LABEL_KEYS: Readonly<Record<ComradeState, string>> = {
    unharmed: 'WH40K.OW.Comrade.State.Unharmed',
    wounded: 'WH40K.OW.Comrade.State.Wounded',
    dead: 'WH40K.OW.Comrade.State.Dead',
};

/** Everything the "Comrade in Combat" panel (ow-comrade-panel.hbs) renders (#152). */
export interface ComradePanelView {
    name: string;
    state: ComradeState;
    stateLabelKey: string;
    distanceM: number;
    hasVisualLine: boolean;
    cohesionRangeM: number;
    inCohesion: boolean;
    isUnharmed: boolean;
    isWounded: boolean;
    isDead: boolean;
    /** Wound is available unless the Comrade is already dead. */
    canWound: boolean;
    /** Heal is available only for a wounded Comrade. */
    canHeal: boolean;
    /** Replace is available only for a dead Comrade while the squad is in camp. */
    canReplace: boolean;
    inCamp: boolean;
    fleeing: boolean;
    pinned: boolean;
    fearImmune: boolean;
    pinningImmune: boolean;
    /** A recovery Order has something to clear: the Comrade is fleeing or pinned. */
    canRecover: boolean;
    /** Half Actions left this Turn (the full budget out of combat). */
    actionsLeft: number;
    actionBudget: number;
    /** Whether the Comrade can still suffer Insanity or Corruption (it is alive). */
    canSufferMental: boolean;
}

/**
 * The panel's view of a Comrade (#152): its Cohesion, the state-track gates (each
 * from the same rule its action applies, so a button is enabled exactly when its
 * action changes something), its Fear / Pinning state and its actions left.
 *
 * `inCamp` is the squad back in camp for refitting (p. 110 / p. 271), the actor's
 * `refitAvailable` flag; `now` is the current combat Round, or null out of combat.
 */
export function buildComradePanel(comrade: ComradeRecord, inCamp: boolean, rules: ComradeRules, now: CombatRoundStamp | null): ComradePanelView {
    const { state } = comrade;
    const alive = state !== 'dead';
    return {
        name: comrade.name,
        state,
        stateLabelKey: COMRADE_STATE_LABEL_KEYS[state],
        distanceM: sanitiseNonNegativeDistance(comrade.distanceM),
        hasVisualLine: comrade.hasVisualLine,
        cohesionRangeM: rules.cohesionRangeM,
        inCohesion: inCohesion(comrade, rules),
        isUnharmed: state === 'unharmed',
        isWounded: state === 'wounded',
        isDead: !alive,
        canWound: applyComradeHit(state).transitioned,
        canHeal: healComrade(state).transitioned,
        canReplace: replaceComrade(state, inCamp).replaced,
        inCamp,
        fleeing: alive && comrade.fleeing,
        pinned: alive && comrade.pinned,
        fearImmune: comrade.fearImmune,
        pinningImmune: comrade.pinningImmune,
        canRecover: alive && (comrade.fleeing || comrade.pinned),
        actionsLeft: alive ? comradeActionsLeft(comrade.turn, now, rules) : 0,
        actionBudget: rules.actionBudget,
        canSufferMental: alive,
    };
}

/* -------------------------------------------- */
/*  Action budget                               */
/* -------------------------------------------- */

/** Whether a stored per-Round record belongs to the Round `now`. */
function sameRound(record: { combatId: string; round: number }, now: CombatRoundStamp): boolean {
    return record.combatId === now.combatId && record.round === now.round;
}

/**
 * The Comrade's Half Actions left this Turn (p. 269: "limited to two Half Actions
 * or one Full Action per Turn"). A record from an earlier Round is spent no more.
 * Out of combat there is no Turn to spend, so the whole budget is there.
 */
export function comradeActionsLeft(turn: ComradeTurnRecord, now: CombatRoundStamp | null, rules: ComradeRules): number {
    if (now === null || !sameRound(turn, now)) return rules.actionBudget;
    return Math.max(0, rules.actionBudget - turn.halvesSpent);
}

/** The Turn record after the Comrade spends `halves` Half Actions in the Round `now`. */
export function spendComradeActions(turn: ComradeTurnRecord, now: CombatRoundStamp, halves: number): ComradeTurnRecord {
    const spent = sameRound(turn, now) ? turn.halvesSpent : 0;
    return { combatId: now.combatId, round: now.round, halvesSpent: spent + halves };
}

/* -------------------------------------------- */
/*  Hit transfer                                */
/* -------------------------------------------- */

/** Input shape for {@link transfersToComrade}. */
export interface HitTransferContext {
    /** Whether the attacker's successful hit roll against the PC came up doubles (11, 22, …, 99). */
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
    /** Whether one of the incoming hits strikes the Comrade. */
    transfers: boolean;
    /** Which printed path triggered it (or `'none'`). */
    reason: ComradeHitTransferReason;
}

/**
 * Whether a hit aimed at the PC strikes its Comrade (p. 271, "Comrades Being
 * Attacked"):
 *   - Doubles: "as long as his Comrade is in Cohesion … If a successful to hit roll
 *     against a Player Character also result in doubles … the hit strikes the
 *     Comrade instead." Only one hit of a multi-hit attack.
 *   - Blast and Spray "automatically hit any targets in their area of affect. This
 *     includes Comrades."
 * Whether a hit really can transfer "relies a bit on common sense" (the Comrade
 * behind a metre-thick wall), which stays the GM's call.
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

/** Whether a d100 result is a double: both dice the same (11, 22, …, 99, and 100 as 00). */
export function isDoublesRoll(total: number): boolean {
    if (!Number.isInteger(total) || total < 1 || total > 100) return false;
    return total === 100 || (total >= 11 && total % 11 === 0);
}

/** The defender of a targeted attack, as far as the Comrade hit transfer reads it. */
export interface ComradeHitDefender {
    readonly uuid: string | null;
    readonly system: object;
}

/** A hit that strikes the defender's Comrade instead (p. 271). */
export interface ComradeHitStrike {
    readonly actorUuid: string;
    readonly comradeName: string;
}

/**
 * Whether one of the hits of a targeted attack strikes the defender's Comrade
 * instead (p. 271): the defender's line prints Comrades, its Comrade is alive and in
 * Cohesion, at least one hit lands on the defender, and the successful attack roll
 * came up doubles. A targeted attack is never a Blast or Spray here: those resolve
 * their area through its template, where a Comrade (which has no token) being
 * inside it is the GM's call.
 */
export function comradeHitStrike(
    defender: ComradeHitDefender | null,
    rules: ComradeRules | null,
    attack: { roll: number; hit: boolean; hitsOnDefender: number },
): ComradeHitStrike | null {
    const comrade = defender === null ? null : readComradeRecord(defender.system);
    if (defender?.uuid == null || rules === null || comrade === null || comrade.state === 'dead') return null;
    if (!attack.hit || attack.hitsOnDefender === 0) return null;
    const { transfers } = transfersToComrade({
        pcRollDoubles: isDoublesRoll(attack.roll),
        comradeInCohesion: inCohesion(comrade, rules),
        weaponBlastOrSpray: false,
        comradeInBlastSprayRange: false,
    });
    return transfers ? { actorUuid: defender.uuid, comradeName: comrade.name } : null;
}

/** The hits less the last one on `defenderId` (the hit that strikes the Comrade instead). */
export function withoutOneHitOn<T extends { readonly target: { readonly id: string } }>(hits: readonly T[], defenderId: string): T[] {
    let index = -1;
    hits.forEach((hit, i) => {
        if (hit.target.id === defenderId) index = i;
    });
    return hits.filter((_hit, i) => i !== index);
}

/* -------------------------------------------- */
/*  Fear / Pinning mirror                       */
/* -------------------------------------------- */

/** The two tests a Comrade mirrors. */
export type ComradeMirrorTest = 'fear' | 'pinning';

/** Input shape for {@link comradeMirrorsFearPinning}. */
export interface FearPinningMirrorArgs {
    test: ComradeMirrorTest;
    /** Whether the PC passed the test. */
    pcPassed: boolean;
    /** Whether the Comrade benefits from an ability that makes it immune to this test. */
    comradeImmune: boolean;
    comradeState: ComradeState;
}

/** Result shape for {@link comradeMirrorsFearPinning}. */
export interface FearPinningMirrorResult {
    /** Whether a Comrade is there to mirror the test (it is alive). */
    applies: boolean;
    /** Whether the Comrade fails with its PC. */
    fails: boolean;
    /** Whether immunity kept it from failing with a PC who failed. */
    immune: boolean;
}

/**
 * The Comrade's result on its PC's Fear or Pinning test: it passes or fails with
 * its PC, except that a Comrade immune to the effect never fails. Cohesion plays
 * no part. A dead Comrade has nothing
 * to mirror.
 */
export function comradeMirrorsFearPinning(args: FearPinningMirrorArgs): FearPinningMirrorResult {
    if (args.comradeState === 'dead') return { applies: false, fails: false, immune: false };
    const immune = args.comradeImmune && !args.pcPassed;
    return { applies: true, fails: !args.pcPassed && !args.comradeImmune, immune };
}

/** The `system.comrade` writes a failed mirrored test makes: Fear flees, Pinning pins. */
export function comradeMirrorWrites(test: ComradeMirrorTest): { 'system.comrade.fleeing': true } | { 'system.comrade.pinned': true } {
    return test === 'fear' ? { 'system.comrade.fleeing': true } : { 'system.comrade.pinned': true };
}

/**
 * The `system.comrade` writes of a recovery Order (p. 271): the Comrade recovers
 * from Fear and from Pinning.
 */
export function recoverComrade(): { 'system.comrade.fleeing': false; 'system.comrade.pinned': false } {
    return { 'system.comrade.fleeing': false, 'system.comrade.pinned': false };
}

/** Whether the end of combat changes the Comrade: Fear lasts "until the end of combat"; Pinning does not end with it. */
export function comradeFearEndsWithCombat(comrade: Pick<ComradeRecord, 'fleeing'>): boolean {
    return comrade.fleeing;
}

/* -------------------------------------------- */
/*  Insanity and Corruption                     */
/* -------------------------------------------- */

/** Which mental damage a Comrade suffers. */
type ComradeMentalKind = 'insanity' | 'corruption';

/** Input shape for {@link applyComradeMentalDamage}. */
export interface ComradeMentalDamageArgs {
    tally: ComradeMentalTally;
    /** The current combat Round; null out of combat. */
    now: CombatRoundStamp | null;
    kind: ComradeMentalKind;
    amount: number;
    rules: ComradeRules;
}

/** Result shape for {@link applyComradeMentalDamage}. */
export interface ComradeMentalDamageResult {
    tally: ComradeMentalTally;
    /** The total of this kind the Comrade has suffered this Round. */
    total: number;
    dies: boolean;
}

/**
 * Insanity or Corruption a Comrade suffers (p. 271): "Comrades do not track
 * Insanity or Corruption … unless they would suffer 10 Insanity or 10 Corruption in
 * a single Round. If this occurs, the Comrade dies." The two kinds count separately,
 * and only within one Round; out of combat each amount stands alone. Negative or
 * non-finite amounts count as 0, fractions round down.
 */
export function applyComradeMentalDamage(args: ComradeMentalDamageArgs): ComradeMentalDamageResult {
    const amount = sanitiseNonNegativeInt(args.amount);
    const { now, kind } = args;
    const current: ComradeMentalTally =
        now !== null && sameRound(args.tally, now) ? args.tally : { combatId: now?.combatId ?? '', round: now?.round ?? 0, insanity: 0, corruption: 0 };
    const tally: ComradeMentalTally = { ...current, [kind]: current[kind] + amount };
    const total = tally[kind];
    return { tally, total, dies: total >= args.rules.mentalDeathThreshold };
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
