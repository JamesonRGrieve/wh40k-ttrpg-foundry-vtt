import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { grappleRulesFor } from '../config/game-systems/index.ts';
import { SYSTEM_ID } from '../constants.ts';
import { MELEE_SPECIAL_OPTIONS } from './attack-options';
import { allCombatActions, combatActionAttackModifier } from './combat-actions.ts';
import {
    asGrappleParticipant,
    buildGrappleCard,
    degreesOfSuccess,
    GRAPPLE_ACTION_LABEL_KEYS,
    GRAPPLE_EFFECT_KEYS,
    canAttemptGrapple,
    GRAPPLE_START_ACTIONS,
    GRAPPLE_FLAG,
    grappleEndWrites,
    grappleFlagValue,
    type GrappleOptionId,
    grappleOptionsFor,
    grappleOptionWrites,
    grapplePanelSections,
    grappleRoleOf,
    type GrappleRole,
    type GrappleRules,
    grappleSideModifiers,
    grappleSideTarget,
    grappleSkill,
    grappleStartWrites,
    type OpposedStrengthInput,
    readGrappleOpponentUuid,
    readGrappleState,
    readGrappleThrownDown,
    readGrappleWrites,
    resolveGrappleOpposed,
} from './grapple';

const resolveDamageOpponent = (input: OpposedStrengthInput): ReturnType<typeof resolveGrappleOpposed> => resolveGrappleOpposed(input, 'damage-opponent');
const resolveThrowDownOpponent = (input: OpposedStrengthInput): ReturnType<typeof resolveGrappleOpposed> => resolveGrappleOpposed(input, 'throw-down-opponent');
const resolveBreakGrapple = (input: OpposedStrengthInput): ReturnType<typeof resolveGrappleOpposed> => resolveGrappleOpposed(input, 'break-free');
const resolveStand = (input: OpposedStrengthInput): ReturnType<typeof resolveGrappleOpposed> => resolveGrappleOpposed(input, 'stand');
const resolvePush = (input: OpposedStrengthInput): ReturnType<typeof resolveGrappleOpposed> => resolveGrappleOpposed(input, 'push-opponent');

/** A line's rules, which every line in these tests prints. */
function rulesOf(line: string): GrappleRules {
    const rules = grappleRulesFor(line);
    if (rules === null) throw new Error(`no grapple rules for ${line}`);
    return rules;
}

const ids = (rules: GrappleRules, role: GrappleRole): GrappleOptionId[] => grappleOptionsFor(rules, role).map((option) => option.id);

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

describe('grapple — Stand (controller, opposed Strength)', () => {
    it('a dead heat (same DoS, Strength bonus and roll) is a stalemate: nobody stands (DH2 p. 24)', () => {
        const r = resolveStand({ actorRoll: 40, actorStrength: 40, opponentRoll: 40, opponentStrength: 40 });
        expect(r.actorDoS).toBe(1);
        expect(r.opponentDoS).toBe(1);
        expect(r.netDoS).toBe(0);
        expect(r.outcome).toBe('stalemate');
        expect(r.success).toBe(false);
        expect(r.action).toBe('stand');
    });

    it('a degree tie goes to the higher Strength bonus, then the lower roll (DH2 p. 24)', () => {
        // Both 1 DoS; the actor's SB 5 beats the opponent's SB 4.
        expect(resolveStand({ actorRoll: 50, actorStrength: 50, opponentRoll: 45, opponentStrength: 45 }).outcome).toBe('won');
        // Both 1 DoS and SB 4; the opponent's lower roll wins.
        expect(resolveStand({ actorRoll: 44, actorStrength: 45, opponentRoll: 41, opponentStrength: 45 }).outcome).toBe('lost');
    });

    it('the tie-break reads the characteristic bonus given, not a modified target', () => {
        // Both 1 DoS against 50 / 45; the actor's +10 thrown-down bonus is in its target, but its Strength is 40 (SB 4).
        expect(resolveStand({ actorRoll: 44, actorStrength: 50, opponentRoll: 41, opponentStrength: 45, actorBonus: 4, opponentBonus: 4 }).outcome).toBe(
            'lost',
        );
    });
});

describe('grapple — Push Opponent', () => {
    it('both fail → stalemate, nothing happens (DH2 p. 24)', () => {
        const r = resolvePush({ actorRoll: 95, actorStrength: 35, opponentRoll: 88, opponentStrength: 35 });
        expect(r.actorDoS).toBe(0);
        expect(r.opponentDoS).toBe(0);
        expect(r.actorDoF).toBe(7);
        expect(r.opponentDoF).toBe(6);
        expect(r.outcome).toBe('stalemate');
        expect(r.success).toBe(false);
        expect(r.action).toBe('push-opponent');
    });
});

describe('per-line grapple options (#120)', () => {
    const FULL_CONTROLLER: GrappleOptionId[] = ['damage-opponent', 'throw-down-opponent', 'push-opponent', 'ready', 'stand', 'use-item'];
    const FULL_TARGET: GrappleOptionId[] = ['break-free', 'slip-free', 'take-control'];

    it.each(['dh2', 'rt', 'bc', 'dw', 'ow'])('%s prints the controller and target options of the Grapple action', (line) => {
        const rules = rulesOf(line);
        expect(ids(rules, 'controller')).toEqual(FULL_CONTROLLER);
        expect(ids(rules, 'target')).toEqual(FULL_TARGET);
    });

    it('DH1 prints one controller option (injure) and three ways out for the target', () => {
        const rules = rulesOf('dh1');
        expect(ids(rules, 'controller')).toEqual(['damage-opponent']);
        expect(ids(rules, 'target')).toEqual(['break-free', 'slip-free', 'take-control']);
        // Escape Grapple: "a Contortionist Test opposed by the grappler's Strength Test".
        expect(rules.options.find((option) => option.id === 'slip-free')?.test).toEqual({ kind: 'opposed-skill', skill: 'contortionist' });
    });

    it.each([
        ['dh2', 'acrobatics'],
        ['ow', 'acrobatics'],
        ['bc', 'acrobatics'],
        ['rt', 'contortionist'],
        ['dw', 'contortionist'],
    ])('%s Slip Free is a Challenging (+0) %s test', (line, skill) => {
        expect(rulesOf(line).options.find((option) => option.id === 'slip-free')?.test).toEqual({ kind: 'skill', skill, modifier: 0 });
    });

    it.each(['dh2', 'rt', 'bc', 'dw', 'ow'])('%s: Ready and Use Item need no test; the rest are Opposed Strength', (line) => {
        for (const option of rulesOf(line).options) {
            const expected = option.id === 'ready' || option.id === 'use-item' ? 'declare' : option.id === 'slip-free' ? 'skill' : 'opposed-strength';
            expect(option.test.kind).toBe(expected);
        }
    });

    it.each([
        ['dh2', 10],
        ['ow', 10],
        ['rt', 0],
        ['bc', 0],
        ['dw', 0],
        ['dh1', 0],
    ])('%s thrown-down bonus is %i', (line, bonus) => {
        expect(rulesOf(line).thrownDownBonus).toBe(bonus);
    });

    it('IM is not modelled by the option panel', () => {
        expect(grappleRulesFor('im')).toBeNull();
    });

    it('labels and effect text exist for every option', () => {
        // The generated key union lists every langpack string (i18n:gen).
        const keys = readFileSync(resolve(__dirname, '../types/i18n-keys.d.ts'), 'utf8');
        const missing = [...Object.values(GRAPPLE_ACTION_LABEL_KEYS), ...Object.values(GRAPPLE_EFFECT_KEYS)].filter((key) => !keys.includes(`'${key}'`));
        expect(missing).toEqual([]);
    });
});

describe('role gating (#120)', () => {
    const dh2 = rulesOf('dh2');

    it('the grapple state gives the role', () => {
        expect(grappleRoleOf('grappling')).toBe('controller');
        expect(grappleRoleOf('controlled')).toBe('target');
        expect(grappleRoleOf('none')).toBeNull();
    });

    it('a controller sees only the controller options', () => {
        const sections = grapplePanelSections(dh2, 'grappling', false);
        expect(sections.map((section) => section.role)).toEqual(['controller']);
        expect(sections.at(0)?.options.map((option) => option.id)).toEqual(ids(dh2, 'controller'));
    });

    it('a grappled target sees only the target options', () => {
        const sections = grapplePanelSections(dh2, 'controlled', false);
        expect(sections.map((section) => section.role)).toEqual(['target']);
        expect(sections.at(0)?.options.map((option) => option.id)).toEqual(['break-free', 'slip-free', 'take-control']);
    });

    it('the GM sees both roles, its own first, the other marked as not its own', () => {
        const sections = grapplePanelSections(dh2, 'controlled', true);
        expect(sections.map((section) => [section.role, section.own])).toEqual([
            ['target', true],
            ['controller', false],
        ]);
    });

    it('outside a grapple, or with no line rules, nothing is offered', () => {
        expect(grapplePanelSections(dh2, 'none', true)).toEqual([]);
        expect(grapplePanelSections(null, 'grappling', true)).toEqual([]);
    });

    it('each button names its test, with the skill a Slip Free rolls', () => {
        const target = grapplePanelSections(dh2, 'controlled', false, (skill) => (skill === 'acrobatics' ? 'Acrobatics' : skill)).at(0);
        const slip = target?.options.find((option) => option.id === 'slip-free');
        expect(slip).toMatchObject({ testKind: 'skill', skill: 'acrobatics', skillLabel: 'Acrobatics', testHintKey: 'WH40K.Grapple.Test.Skill' });
        expect(target?.options.find((option) => option.id === 'break-free')?.testHintKey).toBe('WH40K.Grapple.Test.OpposedStrength');
    });
});

describe('what a won option does to the grapple (#120)', () => {
    const dh2 = rulesOf('dh2');
    const rt = rulesOf('rt');
    const controller = { uuid: 'Actor.c', role: 'controller' as const };
    const target = { uuid: 'Actor.t', role: 'target' as const };

    it('Break Free and Slip Free end the grapple for both', () => {
        for (const id of ['break-free', 'slip-free'] as const)
            expect(grappleOptionWrites(id, true, target, 'Actor.c', false, dh2)).toEqual(grappleEndWrites('Actor.t', 'Actor.c'));
    });

    it('Take Control swaps the roles: the taker controls, the old controller is held', () => {
        expect(grappleOptionWrites('take-control', true, target, 'Actor.c', true, dh2)).toEqual([
            { uuid: 'Actor.t', state: 'grappling', opponentUuid: 'Actor.c', thrownDown: false },
            { uuid: 'Actor.c', state: 'controlled', opponentUuid: 'Actor.t', thrownDown: false },
        ]);
    });

    it('Throw Down marks the opponent thrown down where the line prints a bonus, and not where it does not', () => {
        expect(grappleOptionWrites('throw-down-opponent', true, controller, 'Actor.t', false, dh2)).toEqual(grappleStartWrites('Actor.c', 'Actor.t', true));
        expect(grappleOptionWrites('throw-down-opponent', true, controller, 'Actor.t', false, rt)).toBeNull();
    });

    it('Stand puts both back up, which ends the thrown-down bonus', () => {
        expect(grappleOptionWrites('stand', true, controller, 'Actor.t', true, dh2)).toEqual(grappleStartWrites('Actor.c', 'Actor.t', false));
        expect(grappleOptionWrites('stand', true, controller, 'Actor.t', false, dh2)).toBeNull();
    });

    it('Damage, Push, Ready and Use Item change no grapple state, and a lost option changes nothing', () => {
        for (const id of ['damage-opponent', 'push-opponent', 'ready', 'use-item'] as const)
            expect(grappleOptionWrites(id, true, controller, 'Actor.t', false, dh2)).toBeNull();
        for (const id of ['break-free', 'take-control', 'throw-down-opponent'] as const)
            expect(grappleOptionWrites(id, false, target, 'Actor.c', false, dh2)).toBeNull();
    });
});

describe('the thrown-down bonus on the card (#120; DH2 core p. 221)', () => {
    const dh2 = rulesOf('dh2');

    it('the controller gains +10 on every further Opposed test, whichever side acts', () => {
        expect(grappleSideModifiers('controller', true, dh2)).toEqual([
            { key: 'grapple-thrown-down', labelKey: 'WH40K.Grapple.Modifier.ThrownDown', value: 10, sourceKey: 'WH40K.Grapple.ThrowDownOpponent' },
        ]);
        expect(grappleSideModifiers('target', true, dh2)).toEqual([]);
        expect(grappleSideModifiers('controller', false, dh2)).toEqual([]);
        expect(grappleSideModifiers('controller', true, rulesOf('rt'))).toEqual([]);
    });

    it('the card folds each side’s modifiers into its target and states a won option’s effect', () => {
        const actor = {
            name: 'C',
            base: 40,
            baseLabel: 'Strength',
            modifiers: [{ label: 'Opponent thrown down', value: 10, source: 'Throw Down Opponent' }],
            roll: 45,
        };
        const opponent = { name: 'T', base: 35, baseLabel: 'Strength', modifiers: [], roll: 70 };
        expect(grappleSideTarget(actor)).toBe(50);
        const resolution = resolveGrappleOpposed({ actorRoll: 45, actorStrength: 50, opponentRoll: 70, opponentStrength: 35 }, 'push-opponent');
        const card = buildGrappleCard(resolution, actor, opponent);
        expect(card.actor.target).toBe(50);
        expect(card.actor.modifiers).toHaveLength(1);
        expect(card.outcome).toBe('won');
        expect(card.effectKey).toBe('WH40K.Grapple.Effect.PushOpponent');
        expect(
            buildGrappleCard(
                resolveGrappleOpposed({ actorRoll: 90, actorStrength: 40, opponentRoll: 10, opponentStrength: 40 }, 'push-opponent'),
                actor,
                opponent,
            ).effectKey,
        ).toBe('');
    });

    it('reads the thrown-down mark off the grapple flag', () => {
        expect(readGrappleThrownDown({ [SYSTEM_ID]: { [GRAPPLE_FLAG]: { state: 'grappling', thrownDown: true } } }, SYSTEM_ID)).toBe(true);
        expect(readGrappleThrownDown({ [SYSTEM_ID]: { [GRAPPLE_FLAG]: { state: 'grappling' } } }, SYSTEM_ID)).toBe(false);
        expect(readGrappleThrownDown(undefined, SYSTEM_ID)).toBe(false);
    });
});

describe('opposed-skill sides (DH1 Escape Grapple)', () => {
    it('reads the skill total off the participant', () => {
        const participant = asGrappleParticipant({ name: 'A', uuid: 'Actor.a', system: { skills: { contortionist: { current: 42 } } } });
        expect(grappleSkill(participant, 'contortionist')).toBe(42);
        expect(grappleSkill(participant, 'acrobatics')).toBe(0);
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

describe('the grapple panel renders its options from the context (#120)', () => {
    it('one button per option, sending the option and its role', () => {
        const panel = readFileSync(resolve(__dirname, '../../templates/actor/panel/grapple-controller-panel.hbs'), 'utf8');
        expect(panel).toContain('{{#each grappleSections as |section|}}');
        expect(panel).toContain('data-action="grappleOption"');
        expect(panel).toContain('data-grapple-option="{{option.id}}"');
        expect(panel).toContain('data-grapple-role="{{option.role}}"');
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

    it('offers the line’s options for the actor’s role, and only the GM takes the other role’s', () => {
        expect(source).toContain('grapplePanelSections(');
        expect(source).toContain('grappleRulesFor(this._resolveGameSystemId() ?? undefined)');
        expect(source).toContain('if (actsForOpponent && !game.user.isGM) return;');
        expect(source).toContain('await performGrappleOption({');
    });
});

describe('starting a grapple (#450; DH1 p. 197, DH2 p. 228, RT p. 246, BC p. 243, DW p. 246, OW p. 251)', () => {
    it('a successful attempt makes the attacker the controller and the target held, each naming the other', () => {
        expect(grappleStartWrites('Actor.a', 'Actor.b')).toEqual([
            { uuid: 'Actor.a', state: 'grappling', opponentUuid: 'Actor.b', thrownDown: false },
            { uuid: 'Actor.b', state: 'controlled', opponentUuid: 'Actor.a', thrownDown: false },
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

    it('is made with a Standard Attack or a Charge, and only unarmed (every line: "Instead of inflicting Damage with an unarmed attack")', () => {
        expect(GRAPPLE_START_ACTIONS).toEqual(['Standard Attack', 'Charge']);
        expect(canAttemptGrapple('Standard Attack', true)).toBe(true);
        expect(canAttemptGrapple('Charge', true)).toBe(true);
        expect(canAttemptGrapple('Standard Attack', false)).toBe(false);
        expect(canAttemptGrapple('Charge', false)).toBe(false);
        for (const other of ['All Out Attack', 'Guarded Action', 'Lightning Attack', 'Stun', 'Grapple']) expect(canAttemptGrapple(other, true)).toBe(false);
    });

    it('is a toggle on the attack, not an attack mode of its own', () => {
        expect(MELEE_SPECIAL_OPTIONS.some((option) => option.key === 'grapple')).toBe(false);
    });

    it.each(['dh1', 'dh2', 'rt', 'bc', 'dw', 'ow'])(
        "in %s both start actions are melee attacks of the line's table, so the dialog keeps them and a Charge keeps its bonus",
        (line) => {
            for (const name of GRAPPLE_START_ACTIONS) {
                expect(allCombatActions(line).find((entry) => entry.name === name)?.subtype).toEqual(expect.arrayContaining(['Attack', 'Melee']));
            }
            expect(combatActionAttackModifier('Charge', line)).toBeGreaterThan(0);
        },
    );

    it('a weapon is unarmed only by its content-declared flag, which defaults off', () => {
        const weapon = readFileSync(resolve(__dirname, '../data/item/weapon.ts'), 'utf8');
        expect(weapon).toContain('unarmed: new fields.BooleanField({ required: false, initial: false })');
    });

    const unarmedSource = resolve(__dirname, '../../packs-private/imperium-maledictum/im-core-items-weapons/_source/unarmed.json');
    it.skipIf(!existsSync(unarmedSource))('the Unarmed strike every creature is granted declares itself unarmed', () => {
        expect(JSON.parse(readFileSync(unarmedSource, 'utf8'))).toMatchObject({
            name: 'Unarmed',
            type: 'weapon',
            system: { grantedByDefault: true, unarmed: true },
        });
    });

    it("the table's own Grapple action, used only inside a grapple, never starts one", () => {
        expect(GRAPPLE_START_ACTIONS).not.toContain('Grapple');
    });

    it('an attempt deals no damage, keeps its controls and opens an evasion window for its one hit', () => {
        const rollData = readFileSync(resolve(__dirname, '../rolls/roll-data.ts'), 'utf8');
        const actionData = readFileSync(resolve(__dirname, '../rolls/action-data.ts'), 'utf8');
        expect(rollData).toContain('this.isGrappleAttempt = this.grappleAttempt && this.canGrapple');
        expect(rollData).toContain('return canAttemptGrapple(this.action, this.isUnarmedAttack)');
        expect(rollData).toContain('return (this.weapon.system as { unarmed?: boolean }).unarmed === true');
        expect(rollData).toMatch(/this\.ignoreDamage = [^;]*this\.isGrappleAttempt/);
        expect(rollData).not.toMatch(/this\.ignoreControls = [^;]*isGrappleAttempt/);
        expect(actionData).toContain('rollData.isGrappleAttempt ? 1 : this.hitsOnDeclaredTarget()');
    });

    it('participants carry their UUID (empty for an unsaved actor)', () => {
        expect(asGrappleParticipant({ name: 'A', uuid: 'Actor.a', system: {} }).uuid).toBe('Actor.a');
        expect(asGrappleParticipant({ name: 'A', uuid: null, system: {} }).uuid).toBe('');
    });
});
