import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrappleItemChoice, GrappleOptionId, GrappleOptionRule, GrappleRole, GrappleRules } from '../rules/grapple.ts';
import { installApplicationV2Stub } from '../testing/app-v2-stub.ts';
import type { GrappleActorDoc, GrappleOptionRequest } from './grapple-flow.ts';
import type * as RollHelpers from './roll-helpers.ts';

/**
 * The grapple option flow (#120, #665): each option is tested the way its line
 * prints it; a won option's grapple writes ride on the card; a won Damage
 * Opponent hands its line's damage rule and the controller's test roll to the
 * damage path; a won Push Opponent prints its distance; Ready and Use Item name
 * the item picked. Dice and the chat card are stubbed; the flow's choices are what
 * is asserted.
 */

/** What the flow hands the chat card, as far as these tests read it. */
interface CardData {
    outcome?: string;
    declared?: boolean;
    actionLabelKey?: string;
    effectKey?: string;
    item?: GrappleItemChoice;
    push?: { metres: number; degrees: number; capped: boolean; halfMove: number | null; targetUuid: string; controllerUuid: string } | null;
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
        { id: 'damage-opponent', role: 'controller', test: { kind: 'opposed-strength' } },
        { id: 'throw-down-opponent', role: 'controller', test: { kind: 'opposed-strength' } },
        { id: 'push-opponent', role: 'controller', test: { kind: 'opposed-strength' } },
        { id: 'ready', role: 'controller', test: { kind: 'declare' } },
        { id: 'use-item', role: 'controller', test: { kind: 'declare' } },
        { id: 'slip-free', role: 'target', test: { kind: 'skill', skill: 'acrobatics', modifier: 0 } },
        { id: 'take-control', role: 'target', test: { kind: 'opposed-strength' } },
    ],
    thrownDownBonus: 10,
    damage: { location: 'body', fatigue: 1 },
    push: { baseMetres: 1, metresPerDegree: 1, capAtHalfMove: true },
};

/** The fixture's rule for an option. */
function optionOf(id: GrappleOptionId): GrappleOptionRule {
    const option = RULES.options.find((entry) => entry.id === id);
    if (option === undefined) throw new Error(`fixture has no ${id}`);
    return option;
}

const participant = (strength: number, halfMove: number): object => ({
    characteristics: { strength: { total: strength } },
    skills: { acrobatics: { current: 40, label: 'Acrobatics' } },
    movement: { half: halfMove },
});
const CONTROLLER: GrappleActorDoc = { name: 'Controller', uuid: 'Actor.c', system: participant(40, 4), flags: {} };
const TARGET: GrappleActorDoc = { name: 'Target', uuid: 'Actor.t', system: participant(30, 3), flags: {} };

/** Fixed d100 rolls, in order. */
function rolls(...totals: number[]): () => Promise<Roll> {
    const queue = [...totals];
    return async () => Promise.resolve({ total: queue.shift() ?? 50 } as Roll);
}

/** A request for `id`, the controller acting unless `role` says otherwise; `overrides` replace any part. */
function request(id: GrappleOptionId, overrides: Partial<GrappleOptionRequest> = {}): GrappleOptionRequest {
    const role: GrappleRole = optionOf(id).role;
    return {
        option: optionOf(id),
        actor: role === 'controller' ? CONTROLLER : TARGET,
        opponent: role === 'controller' ? TARGET : CONTROLLER,
        actorRole: role,
        rules: RULES,
        gameSystem: 'dh2',
        rollSkill: vi.fn(),
        dealDamage: vi.fn(async () => Promise.resolve()),
        pickItem: vi.fn(async () => Promise.resolve(null)),
        ...overrides,
    };
}

// The flow's import chain builds dialog classes on `foundry.applications.api` at load.
installApplicationV2Stub();
const mod = await import('./grapple-flow.ts');

describe('performGrappleOption', () => {
    beforeEach(() => {
        emitted.length = 0;
        vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}) });
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('an opposed option rolls both sides and carries a won Take Control as a role swap', async () => {
        await mod.performGrappleOption(request('take-control', { rollD100: rolls(10, 90) }));
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
        const thrown = { flags: { 'wh40k-rpg': { grapple: { state: 'grappling', thrownDown: true } } } };
        await mod.performGrappleOption(request('take-control', { opponent: { ...CONTROLLER, ...thrown }, rollD100: rolls(25, 45) }));
        expect(emitted.at(0)?.data.opponent?.target).toBe(50);
        expect(emitted.at(0)?.data.opponent?.modifiers.map((m) => m.value)).toEqual([10]);
    });

    it('a skill-tested option (Slip Free) opens the actor’s skill test instead of an opposed card', async () => {
        const rollSkill = vi.fn(async () => Promise.resolve());
        await mod.performGrappleOption(request('slip-free', { rollSkill }));
        expect(rollSkill).toHaveBeenCalledTimes(1);
        expect(rollSkill.mock.calls.at(0)?.at(0)).toBe('acrobatics');
        expect(emitted).toHaveLength(0);
    });

    describe('Damage Opponent (#665)', () => {
        it('a won test hands the line’s damage rule and the controller’s roll to the damage path, after the card', async () => {
            const dealDamage = vi.fn(async () => Promise.resolve());
            await mod.performGrappleOption(request('damage-opponent', { dealDamage, rollD100: rolls(12, 95) }));
            expect(emitted.at(0)?.data.outcome).toBe('won');
            expect(dealDamage).toHaveBeenCalledExactlyOnceWith({ location: 'body', fatigue: 1 }, 12);
        });

        it('a lost test deals nothing', async () => {
            const dealDamage = vi.fn(async () => Promise.resolve());
            await mod.performGrappleOption(request('damage-opponent', { dealDamage, rollD100: rolls(95, 12) }));
            expect(emitted.at(0)?.data.outcome).toBe('lost');
            expect(dealDamage).not.toHaveBeenCalled();
        });
    });

    describe('Push Opponent (#665)', () => {
        it('a won test prints 1 m plus 1 m per degree of success, and who moves', async () => {
            // 25 against 40: 2 DoS (DH2: 1 + (40-25)/10 rounded down) → 1 + 2 = 3 m, under the 4 m Half Move.
            await mod.performGrappleOption(request('push-opponent', { rollD100: rolls(25, 95) }));
            expect(emitted.at(0)?.data.push).toMatchObject({
                metres: 3,
                degrees: 2,
                capped: false,
                halfMove: 4,
                targetUuid: 'Actor.t',
                controllerUuid: 'Actor.c',
            });
        });

        it('the push is capped at the controller’s Half Move', async () => {
            // 1 against 40: 4 DoS → 5 m, capped at the 4 m Half Move.
            await mod.performGrappleOption(request('push-opponent', { rollD100: rolls(1, 95) }));
            expect(emitted.at(0)?.data.push).toMatchObject({ metres: 4, degrees: 4, capped: true });
        });

        it('a lost push, or any other option, offers no push', async () => {
            await mod.performGrappleOption(request('push-opponent', { rollD100: rolls(95, 12) }));
            await mod.performGrappleOption(request('throw-down-opponent', { rollD100: rolls(12, 95) }));
            expect(emitted.map((card) => card.data.push)).toEqual([null, null]);
        });
    });

    describe('Ready / Use Item (#665)', () => {
        it('posts a declared card naming the picked item, with no roll', async () => {
            const pickItem = vi.fn(async () => Promise.resolve({ uuid: 'Actor.c.Item.k', name: 'Knife' }));
            await mod.performGrappleOption(request('use-item', { pickItem }));
            expect(pickItem).toHaveBeenCalledExactlyOnceWith('use-item');
            expect(emitted.at(0)?.data).toMatchObject({
                declared: true,
                actionLabelKey: 'WH40K.Grapple.UseItem',
                effectKey: 'WH40K.Grapple.Effect.UseItem',
                item: { uuid: 'Actor.c.Item.k', name: 'Knife' },
            });
        });

        it('posts nothing when no item is picked', async () => {
            await mod.performGrappleOption(request('ready'));
            expect(emitted).toHaveLength(0);
        });
    });
});
