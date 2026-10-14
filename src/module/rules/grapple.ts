/**
 * Grapple state machine (#120 — core.md L10155-10180).
 *
 * Grappling is a multi-step engagement initiated by a successful WS test on
 * a Charge or Standard Attack and then resolved round-by-round through
 * opposed Strength tests. Each combatant in a grapple is in one of three
 * states — `none` (not in a grapple), `grappling` (the controller of the
 * grapple), and `controlled` (the grappled victim). The controller may
 * spend their round on a Damage / Throw Down / etc. action; the controlled
 * side may attempt a Break Free / Stand Up / Move.
 *
 * Every action below resolves through an opposed Strength test against the
 * other participant (DH2 core p. 221–222): the actor rolls 1d100 against
 * `actorStrength` and the opponent rolls 1d100 against `opponentStrength`,
 * decided by the RAW Opposed-test ladder (p. 24) with the grapple's Size edge.
 *
 * The helpers here are pure: they take pre-rolled `1d100` values + the
 * relevant Strength totals and return a `GrappleResolution` describing the
 * outcome. The UI layer (character sheet → grapple controller panel) is
 * responsible for prompting the rolls and emitting chat cards.
 */

import { degreesOfFailure, degreesOfSuccess, isD100Success } from './_dice.ts';
import { type OpposedSide, resolveOpposed } from './opposed.ts';

/** Re-exported from the shared dice primitives for callers/tests importing it from this module. */
export { degreesOfSuccess };

/** Three legal states for a combatant with respect to a grapple. */
export type GrappleState = 'none' | 'grappling' | 'controlled';

/** The actor flag (under the system scope) a combatant's grapple state is stored in. */
export const GRAPPLE_FLAG = 'grapple';

const GRAPPLE_STATES: ReadonlySet<string> = new Set<GrappleState>(['none', 'grappling', 'controlled']);

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor flags are an untyped JSON bag; narrowed field by field below
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/**
 * A combatant's grapple state, read from its flags — the single reader for the
 * value the grapple controller writes at `flags[SYSTEM_ID][GRAPPLE_FLAG].state`.
 * Anything absent or unrecognised reads as `none`.
 * @param {object | undefined} flags  The actor's `flags` bag.
 * @param {string} scope  The system flag scope (`SYSTEM_ID`).
 * @returns {GrappleState}  The grapple state.
 */
export function readGrappleState(flags: object | undefined, scope: string): GrappleState {
    const scoped = isRecord(flags) ? flags[scope] : undefined;
    const grapple = isRecord(scoped) ? scoped[GRAPPLE_FLAG] : undefined;
    const state = isRecord(grapple) ? grapple['state'] : undefined;
    return typeof state === 'string' && GRAPPLE_STATES.has(state) ? (state as GrappleState) : 'none';
}

/**
 * The other participant of a grapple, as recorded on a combatant's grapple flag
 * (`flags[SYSTEM_ID][GRAPPLE_FLAG].opponentUuid`), or null when none is recorded.
 * Every grapple action is an Opposed Strength test against that participant
 * (DH2 core p. 221–222: "an Opposed Strength test with the Grappled opponent",
 * "against the controller of the Grapple").
 */
export function readGrappleOpponentUuid(flags: object | undefined, scope: string): string | null {
    const scoped = isRecord(flags) ? flags[scope] : undefined;
    const grapple = isRecord(scoped) ? scoped[GRAPPLE_FLAG] : undefined;
    const uuid = isRecord(grapple) ? grapple['opponentUuid'] : undefined;
    return typeof uuid === 'string' && uuid !== '' ? uuid : null;
}

/**
 * The attack action that tries to start a grapple. RAW in every line (DH2 core
 * p. 228 "Grappling", RT p. 246, DH1 p. 197): instead of dealing unarmed damage,
 * the attacker makes a Weapon Skill attack; the target may use a Reaction to
 * avoid it; if the attack succeeds the two are grappling, the attacker in control.
 * The lines differ only in that Reaction (DH1: an Agility Test; the others: Dodge
 * or Parry), which the shared evasion window already makes per line.
 *
 * It is the combat-action table's own Grapple attack action, so the attack
 * dialog keeps it (an action the table lacks resets to Standard Attack) and
 * choosing Grapple from the action list starts a grapple too.
 */
export const GRAPPLE_ATTEMPT_ACTION = 'Grapple';

/** The chat-message flag carrying grapple flag writes for the active GM to apply. */
export const GRAPPLE_UPDATE_FLAG = 'grappleUpdate';

/** One combatant's grapple flag, as the active GM writes it. */
export interface GrappleFlagWrite {
    /** The combatant's actor UUID. */
    uuid: string;
    state: GrappleState;
    /** The other participant's actor UUID; null when the grapple is over. */
    opponentUuid: string | null;
}

/** A successful grapple attempt: the attacker controls the grapple, the target is held. Each records the other. */
export function grappleStartWrites(controllerUuid: string, targetUuid: string): GrappleFlagWrite[] {
    return [
        { uuid: controllerUuid, state: 'grappling', opponentUuid: targetUuid },
        { uuid: targetUuid, state: 'controlled', opponentUuid: controllerUuid },
    ];
}

/** The grapple is over for both participants (a successful Break Free). */
export function grappleEndWrites(oneUuid: string, otherUuid: string): GrappleFlagWrite[] {
    return [
        { uuid: oneUuid, state: 'none', opponentUuid: null },
        { uuid: otherUuid, state: 'none', opponentUuid: null },
    ];
}

/** The flag value a write stores at `flags[SYSTEM_ID][GRAPPLE_FLAG]`. */
export function grappleFlagValue(write: GrappleFlagWrite): { state: GrappleState; opponentUuid: string | null } {
    return { state: write.state, opponentUuid: write.opponentUuid };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: a chat-message flag is an untyped JSON bag; validated entry by entry below
export function readGrappleWrites(value: unknown): GrappleFlagWrite[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): GrappleFlagWrite[] => {
        if (!isRecord(entry)) return [];
        const { uuid, state, opponentUuid } = entry;
        if (typeof uuid !== 'string' || uuid === '' || typeof state !== 'string' || !GRAPPLE_STATES.has(state)) return [];
        if (opponentUuid !== null && typeof opponentUuid !== 'string') return [];
        return [{ uuid, state: state as GrappleState, opponentUuid }];
    });
}

/** Enumerated controller / controlled actions, all opposed-Strength resolved. */
export type GrappleAction = 'damage-opponent' | 'throw-down-opponent' | 'break-free' | 'stand-up' | 'move-while-grappling';

/** The langpack label of each grapple action (the panel buttons and the result card share them). */
export const GRAPPLE_ACTION_LABEL_KEYS: Readonly<Record<GrappleAction, string>> = {
    'damage-opponent': 'WH40K.Grapple.DamageOpponent',
    'throw-down-opponent': 'WH40K.Grapple.ThrowDownOpponent',
    'break-free': 'WH40K.Grapple.BreakFree',
    'stand-up': 'WH40K.Grapple.StandUp',
    'move-while-grappling': 'WH40K.Grapple.Move',
};

/** Input shape for every opposed-Strength resolver below. */
export interface OpposedStrengthInput {
    /** Acting combatant's d100 roll (1-100). */
    actorRoll: number;
    /** Acting combatant's Strength characteristic total. */
    actorStrength: number;
    /** Opponent's d100 roll (1-100). */
    opponentRoll: number;
    /** Opponent's Strength characteristic total. */
    opponentStrength: number;
    /** Acting combatant's Size (the Size trait value, 4 = Average). Optional: equal sizes add nothing. */
    actorSize?: number;
    /** Opponent's Size. */
    opponentSize?: number;
}

/** How the opposed test came out for the acting combatant. */
export type GrappleOutcome = 'won' | 'lost' | 'stalemate';

/** Resolution payload returned by every grapple action helper. */
export interface GrappleResolution {
    /** True when the acting combatant wins the opposed test. */
    success: boolean;
    /** Won, lost, or a stalemate (both failed, or a dead heat): nothing happens. */
    outcome: GrappleOutcome;
    /** Degrees of success for the actor (0 when actor failed their roll), Size edge included. */
    actorDoS: number;
    /** Degrees of failure for the actor (0 when the actor passed). */
    actorDoF: number;
    /** Degrees of success for the opponent (0 when opponent failed their roll), Size edge included. */
    opponentDoS: number;
    /** Degrees of failure for the opponent (0 when the opponent passed). */
    opponentDoF: number;
    /** Extra degrees of success the larger combatant scored for its Size (signed: + actor, − opponent). */
    sizeEdge: number;
    /** Net DoS (actorDoS − opponentDoS) for downstream effects like damage scaling. */
    netDoS: number;
    /** The action that was resolved (echoed for chat-card / log convenience). */
    action: GrappleAction;
}

/**
 * Generic opposed Strength resolver, by the RAW Opposed-test ladder (DH2 core
 * p. 24, `rules/opposed.ts`): a success beats a failure; both succeeding, more
 * degrees of success wins; then the higher Strength bonus; then the lower roll.
 * Both failing is a stalemate — "nothing happens" — so the acting side does
 * not get its way (the GM may call for a re-roll instead).
 *
 * Grappling size differences (DH2 core p. 222): the larger combatant scores one
 * extra degree of success on a successful test for each point its Size exceeds
 * the other's.
 */
function resolveOpposedStrength(input: OpposedStrengthInput, action: GrappleAction): GrappleResolution {
    const sizeEdge = (input.actorSize ?? 0) - (input.opponentSize ?? 0);
    const side = (roll: number, strength: number, edge: number): OpposedSide & { dos: number; dof: number } => {
        const success = isD100Success(roll, strength);
        return {
            success,
            dos: success ? Math.max(1, degreesOfSuccess(roll, strength)) + Math.max(0, edge) : 0,
            dof: success ? 0 : Math.max(1, degreesOfFailure(roll, strength)),
            charBonus: Math.floor(strength / 10),
            roll,
        };
    };
    const actor = side(input.actorRoll, input.actorStrength, sizeEdge);
    const opponent = side(input.opponentRoll, input.opponentStrength, -sizeEdge);
    const { winner } = resolveOpposed(actor, opponent);
    const outcome: GrappleOutcome = winner === 'initiator' ? 'won' : winner === 'target' ? 'lost' : 'stalemate';
    return {
        success: outcome === 'won',
        outcome,
        actorDoS: actor.dos,
        actorDoF: actor.dof,
        opponentDoS: opponent.dos,
        opponentDoF: opponent.dof,
        sizeEdge,
        netDoS: actor.dos - opponent.dos,
        action,
    };
}

/**
 * Controller's "Damage" action — opposed Strength test; on win, the
 * controller inflicts SB Impact damage on the controlled side. The
 * resolver returns the contest outcome; the damage roll is computed by
 * the UI layer from `netDoS` and the controller's Strength Bonus.
 */
export function resolveDamageOpponent(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'damage-opponent');
}

/**
 * Controller's "Throw Down" action — opposed Strength test; on win, the
 * controlled side is thrown to the ground (Prone condition) and the
 * grapple state on both combatants resets to `none`.
 */
export function resolveThrowDownOpponent(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'throw-down-opponent');
}

/**
 * Controlled side's "Break Free" action — opposed Strength test; on win,
 * the grapple ends and both combatants transition to `none`. On failure
 * the grapple persists into the next round.
 */
export function resolveBreakGrapple(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'break-free');
}

/**
 * Controlled side's "Stand Up" action — opposed Strength test taken when
 * the controlled side has been knocked prone but is still gripped.
 * Standing inside an active grapple is contested by the controller's
 * Strength; success rises to a standing grapple, failure leaves the
 * controlled side prone.
 */
export function resolveStandUpInGrapple(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'stand-up');
}

/**
 * Controlled side's "Move" action — opposed Strength test to drag the
 * grapple a short distance. On success the pair shifts up to the
 * controlled side's Agility Bonus in metres in the chosen direction; the
 * controller is dragged along.
 */
export function resolveMoveWhileGrappling(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'move-while-grappling');
}

/** What a grapple test reads off a participant actor. */
export interface GrappleParticipant {
    name: string;
    /** The actor's UUID — what the other participant's grapple flag records. */
    uuid: string;
    system: { characteristics?: { strength?: { total?: number } }; size?: number };
}

/**
 * View an actor as a grapple participant. Actor system data is a union over every
 * actor type; the grapple reads only the optional Strength total and Size, which
 * an actor type without them (a vehicle) leaves undefined.
 */
export function asGrappleParticipant(actor: { name: string; uuid: string | null; system: object }): GrappleParticipant {
    // An unsaved actor has no UUID; it cannot be recorded as anyone's opponent.
    return { name: actor.name, uuid: actor.uuid ?? '', system: actor.system };
}

/** A participant's Strength total — the target of its side of every grapple test. */
export function grappleStrength(participant: GrappleParticipant): number {
    return participant.system.characteristics?.strength?.total ?? 0;
}

/** A participant's Size (the Size-trait scale); 0 when the actor type has none, so it adds no edge. */
export function grappleSize(participant: GrappleParticipant): number {
    const { size } = participant.system;
    return size ?? 0;
}

/** One combatant's half of the grapple result card. */
export interface GrappleCardSide {
    name: string;
    /** The Strength total the test was rolled against. */
    strength: number;
    roll: number;
    success: boolean;
    dos: number;
    dof: number;
    /** Extra DoS this side scored for being larger (0 when none). */
    sizeEdge: number;
}

/** Context of `chat/grapple-opposed-chat.hbs`. */
export interface GrappleCardContext {
    actionLabelKey: string;
    outcome: GrappleOutcome;
    actor: GrappleCardSide;
    opponent: GrappleCardSide;
    /** The winner's name; empty on a stalemate. */
    winnerName: string;
}

/** Shape the result card from a resolved grapple action: both sides' full test, and who won. */
export function buildGrappleCard(
    resolution: GrappleResolution,
    actor: { name: string; strength: number; roll: number },
    opponent: { name: string; strength: number; roll: number },
): GrappleCardContext {
    return {
        actionLabelKey: GRAPPLE_ACTION_LABEL_KEYS[resolution.action],
        outcome: resolution.outcome,
        actor: {
            ...actor,
            success: resolution.actorDoS > 0,
            dos: resolution.actorDoS,
            dof: resolution.actorDoF,
            sizeEdge: resolution.actorDoS > 0 ? Math.max(0, resolution.sizeEdge) : 0,
        },
        opponent: {
            ...opponent,
            success: resolution.opponentDoS > 0,
            dos: resolution.opponentDoS,
            dof: resolution.opponentDoF,
            sizeEdge: resolution.opponentDoS > 0 ? Math.max(0, -resolution.sizeEdge) : 0,
        },
        winnerName: resolution.outcome === 'won' ? actor.name : resolution.outcome === 'lost' ? opponent.name : '',
    };
}
