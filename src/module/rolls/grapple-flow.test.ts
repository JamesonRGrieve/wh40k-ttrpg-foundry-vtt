import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrappleOptionId, GrappleOptionRule, GrappleRules } from '../rules/grapple.ts';
import { importModelOrSkip } from '../testing/model-import.ts';
import type * as RollHelpers from './roll-helpers.ts';

/**
 * The grapple option flow (#120): each option is tested the way its line prints it,
 * and a won option's grapple writes ride on the card. Dice and the chat card are
 * stubbed; the flow's choices are what is asserted.
 */

/** What the flow hands the chat card, as far as these tests read it. */
interface CardData {
    outcome?: string;
    declared?: boolean;
    actionLabelKey?: string;
    effectKey?: string;
    opponent?: { target: number; modifiers: Array<{ value: number }> };
}
interface CardOptions {
    flags?: object;
}

const emitted: Array<{ data: CardData; opts: CardOptions }> = [];
vi.mock('./roll-helpers.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof RollHelpers>()),
    emitChatFromTemplate: async (_template: string, data: CardData, opts: CardOptions = {}): Promise<void> => {
        emitted.push({ data, opts });
        return Promise.resolve();
    },
}));

const RULES: GrappleRules = {
    options: [
        { id: 'throw-down-opponent', role: 'controller', test: { kind: 'opposed-strength' } },
        { id: 'ready', role: 'controller', test: { kind: 'declare' } },
        { id: 'slip-free', role: 'target', test: { kind: 'skill', skill: 'acrobatics', modifier: 0 } },
        { id: 'take-control', role: 'target', test: { kind: 'opposed-strength' } },
    ],
    thrownDownBonus: 10,
};

/** The fixture's rule for an option. */
function optionOf(id: GrappleOptionId): GrappleOptionRule {
    const option = RULES.options.find((entry) => entry.id === id);
    if (option === undefined) throw new Error(`fixture has no ${id}`);
    return option;
}

const strength = (total: number): object => ({ characteristics: { strength: { total } }, skills: { acrobatics: { current: 40, label: 'Acrobatics' } } });
const CONTROLLER = { name: 'Controller', uuid: 'Actor.c', system: strength(40), flags: {} };
const TARGET = { name: 'Target', uuid: 'Actor.t', system: strength(30), flags: {} };

/** Fixed d100 rolls, in order. */
function rolls(...totals: number[]): () => Promise<Roll> {
    const queue = [...totals];
    return async () => Promise.resolve({ total: queue.shift() ?? 50 } as Roll);
}

const flow = importModelOrSkip(import('./grapple-flow.ts'));

describe('performGrappleOption', () => {
    beforeEach(() => {
        emitted.length = 0;
        vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}) });
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('an opposed option rolls both sides and carries a won Take Control as a role swap', async () => {
        const mod = await flow;
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the module can't load under happy-dom
        if (mod === undefined) return;
        await mod.performGrappleOption({
            option: optionOf('take-control'),
            actor: TARGET,
            opponent: CONTROLLER,
            actorRole: 'target',
            rules: RULES,
            gameSystem: 'dh2',
            rollSkill: vi.fn(),
            rollD100: rolls(10, 90),
        });
        expect(emitted).toHaveLength(1);
        expect(emitted.at(0)?.data.outcome).toBe('won');
        expect(emitted.at(0)?.opts.flags).toEqual({
            grappleUpdate: [
                { uuid: 'Actor.t', state: 'grappling', opponentUuid: 'Actor.c', thrownDown: false },
                { uuid: 'Actor.c', state: 'controlled', opponentUuid: 'Actor.t', thrownDown: false },
            ],
        });
    });

    it('the thrown-down controller tests with +10 as a sourced row', async () => {
        const mod = await flow;
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the module can't load under happy-dom
        if (mod === undefined) return;
        const thrown = { flags: { 'wh40k-rpg': { grapple: { state: 'grappling', thrownDown: true } } } };
        await mod.performGrappleOption({
            option: optionOf('take-control'),
            actor: TARGET,
            opponent: { ...CONTROLLER, ...thrown },
            actorRole: 'target',
            rules: RULES,
            gameSystem: 'dh2',
            rollSkill: vi.fn(),
            rollD100: rolls(25, 45),
        });
        expect(emitted.at(0)?.data.opponent?.target).toBe(50);
        expect(emitted.at(0)?.data.opponent?.modifiers.map((m) => m.value)).toEqual([10]);
    });

    it('a skill-tested option (Slip Free) opens the actor’s skill test instead of an opposed card', async () => {
        const mod = await flow;
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the module can't load under happy-dom
        if (mod === undefined) return;
        const rollSkill = vi.fn(async () => Promise.resolve());
        await mod.performGrappleOption({
            option: optionOf('slip-free'),
            actor: TARGET,
            opponent: CONTROLLER,
            actorRole: 'target',
            rules: RULES,
            gameSystem: 'dh2',
            rollSkill,
        });
        expect(rollSkill).toHaveBeenCalledTimes(1);
        expect(rollSkill.mock.calls.at(0)?.at(0)).toBe('acrobatics');
        expect(emitted).toHaveLength(0);
    });

    it('a no-test option (Ready) posts a declared card with no roll', async () => {
        const mod = await flow;
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the module can't load under happy-dom
        if (mod === undefined) return;
        await mod.performGrappleOption({
            option: optionOf('ready'),
            actor: CONTROLLER,
            opponent: TARGET,
            actorRole: 'controller',
            rules: RULES,
            gameSystem: 'dh2',
            rollSkill: vi.fn(),
        });
        expect(emitted.at(0)?.data).toMatchObject({ declared: true, actionLabelKey: 'WH40K.Grapple.Ready', effectKey: 'WH40K.Grapple.Effect.Ready' });
    });
});
