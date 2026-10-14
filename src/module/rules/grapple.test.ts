import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SYSTEM_ID } from '../constants.ts';
import { MELEE_SPECIAL_OPTIONS } from './attack-options';
import { allCombatActions } from './combat-actions.ts';
import {
    asGrappleParticipant,
    degreesOfSuccess,
    GRAPPLE_ACTION_LABEL_KEYS,
    GRAPPLE_ATTEMPT_ACTION,
    GRAPPLE_FLAG,
    grappleEndWrites,
    grappleFlagValue,
    grappleStartWrites,
    readGrappleOpponentUuid,
    readGrappleState,
    readGrappleWrites,
    resolveBreakGrapple,
    resolveDamageOpponent,
    resolveMoveWhileGrappling,
    resolveStandUpInGrapple,
    resolveThrowDownOpponent,
} from './grapple';

/**
 * Grapple state-machine resolver pins (#120 — core.md L10155-10180).
 *
 * The five exported resolvers all share the same opposed-Strength engine,
 * so the tests pin: (a) the DoS math, (b) the action-tag round-trip, and
 * (c) the win/loss semantics at the boundary cases (actor passes /
 * opponent fails, both pass with different DoS, both fail, tie). The
 * resolvers differ only by the `action` tag echoed back — that tag drives
 * downstream chat rendering, so it MUST round-trip unchanged.
 */
describe('grapple — degrees of success', () => {
    it('returns 0 when the roll exceeds the target', () => {
        expect(degreesOfSuccess(75, 40)).toBe(0);
    });

    it('returns 1 for a bare pass (roll exactly equals target)', () => {
        expect(degreesOfSuccess(40, 40)).toBe(1);
    });

    it('returns 1 per full 10 points the roll beats the target by', () => {
        expect(degreesOfSuccess(30, 40)).toBe(2);
        expect(degreesOfSuccess(11, 40)).toBe(3);
        expect(degreesOfSuccess(1, 40)).toBe(4);
    });
});

describe('grapple — resolveDamageOpponent', () => {
    it('controller wins when controller passes and target fails', () => {
        const r = resolveDamageOpponent({ actorRoll: 30, actorStrength: 50, opponentRoll: 75, opponentStrength: 40 });
        expect(r.success).toBe(true);
        expect(r.actorDoS).toBe(3);
        expect(r.opponentDoS).toBe(0);
        expect(r.netDoS).toBe(3);
        expect(r.action).toBe('damage-opponent');
    });

    it('controller loses when controlled rolls more DoS', () => {
        const r = resolveDamageOpponent({ actorRoll: 35, actorStrength: 40, opponentRoll: 10, opponentStrength: 40 });
        expect(r.success).toBe(false);
        expect(r.actorDoS).toBe(1);
        expect(r.opponentDoS).toBe(4);
        expect(r.netDoS).toBe(-3);
    });
});

describe('grapple — resolveThrowDownOpponent', () => {
    it('passes the action tag through unchanged for the chat layer', () => {
        const r = resolveThrowDownOpponent({ actorRoll: 20, actorStrength: 45, opponentRoll: 50, opponentStrength: 45 });
        expect(r.action).toBe('throw-down-opponent');
        expect(r.success).toBe(true);
    });
});

describe('grapple — resolveBreakGrapple', () => {
    it('controlled side wins when it passes and controller fails', () => {
        const r = resolveBreakGrapple({ actorRoll: 20, actorStrength: 45, opponentRoll: 90, opponentStrength: 50 });
        expect(r.success).toBe(true);
        expect(r.action).toBe('break-free');
    });

    it('controlled side fails when controller scores more DoS', () => {
        const r = resolveBreakGrapple({ actorRoll: 30, actorStrength: 40, opponentRoll: 5, opponentStrength: 45 });
        expect(r.success).toBe(false);
        expect(r.actorDoS).toBe(2);
        expect(r.opponentDoS).toBe(5);
    });
});

describe('grapple — resolveStandUpInGrapple', () => {
    it('a dead heat (same DoS, Strength bonus and roll) is a stalemate: the actor does not stand (DH2 p. 24)', () => {
        const r = resolveStandUpInGrapple({ actorRoll: 40, actorStrength: 40, opponentRoll: 40, opponentStrength: 40 });
        expect(r.actorDoS).toBe(1);
        expect(r.opponentDoS).toBe(1);
        expect(r.netDoS).toBe(0);
        expect(r.outcome).toBe('stalemate');
        expect(r.success).toBe(false);
        expect(r.action).toBe('stand-up');
    });

    it('a degree tie goes to the higher Strength bonus, then the lower roll (DH2 p. 24)', () => {
        // Both 1 DoS; the actor's SB 5 beats the opponent's SB 4.
        expect(resolveStandUpInGrapple({ actorRoll: 50, actorStrength: 50, opponentRoll: 45, opponentStrength: 45 }).outcome).toBe('won');
        // Both 1 DoS and SB 4; the opponent's lower roll wins.
        expect(resolveStandUpInGrapple({ actorRoll: 44, actorStrength: 45, opponentRoll: 41, opponentStrength: 45 }).outcome).toBe('lost');
    });

    it('returns failure when actor fails and opponent passes', () => {
        const r = resolveStandUpInGrapple({ actorRoll: 80, actorStrength: 30, opponentRoll: 25, opponentStrength: 40 });
        expect(r.success).toBe(false);
        expect(r.actorDoS).toBe(0);
        expect(r.opponentDoS).toBe(2);
    });
});

describe('grapple — resolveMoveWhileGrappling', () => {
    it('both fail → stalemate, nothing happens (DH2 p. 24)', () => {
        const r = resolveMoveWhileGrappling({ actorRoll: 95, actorStrength: 35, opponentRoll: 88, opponentStrength: 35 });
        expect(r.actorDoS).toBe(0);
        expect(r.opponentDoS).toBe(0);
        expect(r.actorDoF).toBe(7);
        expect(r.opponentDoF).toBe(6);
        expect(r.outcome).toBe('stalemate');
        expect(r.success).toBe(false);
        expect(r.action).toBe('move-while-grappling');
    });
});

describe('grapple — size differences (DH2 p. 222)', () => {
    it('the larger combatant scores an extra DoS per Size point on a success', () => {
        // Both pass with 2 DoS; the actor is one Size larger, so it wins 3–2.
        const r = resolveDamageOpponent({ actorRoll: 30, actorStrength: 40, opponentRoll: 30, opponentStrength: 40, actorSize: 5, opponentSize: 4 });
        expect(r.sizeEdge).toBe(1);
        expect(r.actorDoS).toBe(3);
        expect(r.opponentDoS).toBe(2);
        expect(r.outcome).toBe('won');
    });

    it('a larger opponent gains the edge instead, and a failed test gains nothing', () => {
        const r = resolveBreakGrapple({ actorRoll: 30, actorStrength: 40, opponentRoll: 30, opponentStrength: 40, actorSize: 4, opponentSize: 6 });
        expect(r.opponentDoS).toBe(4);
        expect(r.outcome).toBe('lost');
        const failed = resolveBreakGrapple({ actorRoll: 90, actorStrength: 40, opponentRoll: 95, opponentStrength: 40, actorSize: 8, opponentSize: 4 });
        expect(failed.actorDoS).toBe(0);
        expect(failed.outcome).toBe('stalemate');
    });
});

describe('readGrappleOpponentUuid', () => {
    it('reads the other participant recorded on the grapple flag', () => {
        expect(readGrappleOpponentUuid({ [SYSTEM_ID]: { [GRAPPLE_FLAG]: { state: 'grappling', opponentUuid: 'Actor.abc' } } }, SYSTEM_ID)).toBe('Actor.abc');
    });

    it('is null when none is recorded', () => {
        expect(readGrappleOpponentUuid({ [SYSTEM_ID]: { [GRAPPLE_FLAG]: { state: 'grappling' } } }, SYSTEM_ID)).toBeNull();
        expect(readGrappleOpponentUuid(undefined, SYSTEM_ID)).toBeNull();
    });
});

describe('GRAPPLE_ACTION_LABEL_KEYS', () => {
    it('labels every action with a langpack key the panel buttons use', () => {
        const panel = readFileSync(resolve(__dirname, '../../templates/actor/panel/grapple-controller-panel.hbs'), 'utf8');
        for (const key of Object.values(GRAPPLE_ACTION_LABEL_KEYS)) expect(panel).toContain(`"${key}"`);
    });
});

describe('readGrappleState — reads the flag where the controller writes it (#120)', () => {
    it('reads the state from the system-scoped flag', () => {
        expect(readGrappleState({ [SYSTEM_ID]: { [GRAPPLE_FLAG]: { state: 'controlled' } } }, SYSTEM_ID)).toBe('controlled');
        expect(readGrappleState({ [SYSTEM_ID]: { [GRAPPLE_FLAG]: { state: 'grappling' } } }, SYSTEM_ID)).toBe('grappling');
    });

    it('regression: the legacy `wh40k` scope the sheet used to read is not the flag', () => {
        // The sheet read `flags.wh40k.grapple` while Break Free wrote `flags['wh40k-rpg'].grapple`,
        // so a combatant mid-grapple never got the controller panel.
        expect(readGrappleState({ wh40k: { [GRAPPLE_FLAG]: { state: 'controlled' } } }, SYSTEM_ID)).toBe('none');
    });

    it('anything absent or unrecognised reads as none', () => {
        expect(readGrappleState(undefined, SYSTEM_ID)).toBe('none');
        expect(readGrappleState({}, SYSTEM_ID)).toBe('none');
        expect(readGrappleState({ [SYSTEM_ID]: { [GRAPPLE_FLAG]: { state: 'pinned' } } }, SYSTEM_ID)).toBe('none');
    });
});

describe('character sheet reads the grapple state through readGrappleState (#120 regression)', () => {
    // Source-text guard: the sheet cannot load under happy-dom, so pin that it routes
    // through the shared reader and never re-derives the flag path itself.
    const source = readFileSync(resolve(__dirname, '../applications/actor/character-sheet.ts'), 'utf8');

    it('uses the shared reader and the system scope', () => {
        expect(source).toContain('readGrappleState(this.actor.flags, SYSTEM_ID)');
        expect(source).not.toMatch(/flags[^;\n]*\bwh40k\?\.grapple/);
    });

    it('a won Break Free ends the grapple for both participants through the relay', () => {
        expect(source).toContain('this._rollGrappleOpposed(resolveBreakGrapple, true)');
        expect(source).toContain('grappleEndWrites(grappler.uuid, opponent.uuid)');
    });
});

describe('starting a grapple (#450; DH2 p. 228, RT p. 246, DH1 p. 197)', () => {
    it('a successful attempt makes the attacker the controller and the target held, each naming the other', () => {
        expect(grappleStartWrites('Actor.a', 'Actor.b')).toEqual([
            { uuid: 'Actor.a', state: 'grappling', opponentUuid: 'Actor.b' },
            { uuid: 'Actor.b', state: 'controlled', opponentUuid: 'Actor.a' },
        ]);
    });

    it('the writes are what the readers then find', () => {
        const flags = grappleStartWrites('Actor.a', 'Actor.b').map((write) => ({ [SYSTEM_ID]: { [GRAPPLE_FLAG]: grappleFlagValue(write) } }));
        expect(flags.map((f) => readGrappleState(f, SYSTEM_ID))).toEqual(['grappling', 'controlled']);
        expect(flags.map((f) => readGrappleOpponentUuid(f, SYSTEM_ID))).toEqual(['Actor.b', 'Actor.a']);
    });

    it('ending clears both sides', () => {
        for (const write of grappleEndWrites('Actor.a', 'Actor.b')) {
            expect(write.state).toBe('none');
            expect(write.opponentUuid).toBeNull();
        }
    });

    it('reads only well-formed writes off a chat-message flag', () => {
        const good = grappleStartWrites('Actor.a', 'Actor.b');
        expect(readGrappleWrites(good)).toEqual(good);
        expect(readGrappleWrites(undefined)).toEqual([]);
        expect(readGrappleWrites([{ uuid: '', state: 'grappling', opponentUuid: null }, { uuid: 'Actor.c', state: 'hugging', opponentUuid: null }, 7])).toEqual(
            [],
        );
    });

    it('is offered as a melee special option of the attack, naming the attempt action', () => {
        expect(MELEE_SPECIAL_OPTIONS.find((option) => option.key === 'grapple')?.actionName).toBe(GRAPPLE_ATTEMPT_ACTION);
    });

    it.each(['dh1', 'dh2', 'rt', 'bc', 'dw', 'ow'])('the attempt is a melee attack action of the %s table, so the dialog keeps it', (line) => {
        const action = allCombatActions(line).find((entry) => entry.name === GRAPPLE_ATTEMPT_ACTION);
        expect(action?.subtype).toEqual(expect.arrayContaining(['Attack', 'Melee']));
    });

    it('an attempt deals no damage, keeps its controls and opens an evasion window for its one hit', () => {
        const rollData = readFileSync(resolve(__dirname, '../rolls/roll-data.ts'), 'utf8');
        const actionData = readFileSync(resolve(__dirname, '../rolls/action-data.ts'), 'utf8');
        expect(rollData).toContain('this.isGrappleAttempt = this.action === GRAPPLE_ATTEMPT_ACTION');
        expect(rollData).toMatch(/this\.ignoreDamage = [^;]*this\.isGrappleAttempt/);
        expect(rollData).not.toMatch(/this\.ignoreControls = [^;]*isGrappleAttempt/);
        expect(actionData).toContain('rollData.isGrappleAttempt ? 1 : this.hitsOnDeclaredTarget()');
    });

    it('participants carry their UUID (empty for an unsaved actor)', () => {
        expect(asGrappleParticipant({ name: 'A', uuid: 'Actor.a', system: {} }).uuid).toBe('Actor.a');
        expect(asGrappleParticipant({ name: 'A', uuid: null, system: {} }).uuid).toBe('');
    });
});
