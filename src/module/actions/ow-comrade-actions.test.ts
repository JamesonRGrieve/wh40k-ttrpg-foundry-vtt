import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RollHelpers from '../rolls/roll-helpers.ts';
import type { ComradeRecord } from '../rules/ow-comrade.ts';
import { installApplicationV2Stub } from '../testing/app-v2-stub.ts';

/**
 * The Comrade's sheet actions and GM relays (#152; OW): a recovery
 * Order clears Fear and Pinning; Insanity and Corruption kill the Comrade at 10 in
 * one Round; a hit that struck it instead moves its state track; the end of combat
 * ends its Fear. The chat card and the actor writes are stubbed at the Foundry
 * boundary; what is written and said is asserted.
 */

/** What the actions hand the chat card, as far as these tests read it. */
interface CardData {
    comradeName?: string;
    event?: { kind: string; [key: string]: string | number | boolean };
}
const cards: CardData[] = [];
vi.mock('../rolls/roll-helpers.ts', async (importOriginal) => ({
    ...(await importOriginal<typeof RollHelpers>()),
    emitChatFromTemplate: async (_template: string, data: CardData): Promise<void> => {
        cards.push(data);
        return Promise.resolve();
    },
}));

installApplicationV2Stub();
const actions = await import('./ow-comrade-actions.ts');

const COMRADE: ComradeRecord = {
    name: 'Comrade Jaeger',
    state: 'unharmed',
    distanceM: 2,
    hasVisualLine: true,
    fleeing: false,
    pinned: false,
    fearImmune: false,
    pinningImmune: false,
    turn: { combatId: '', round: 0, halvesSpent: 0 },
    mental: { combatId: '', round: 0, insanity: 0, corruption: 0 },
};

/** The sheet the actions are bound to. */
type SheetHost = ThisParameterType<typeof actions.owComradeRecover>;

/** An Only War PC's sheet with its Comrade, and the spy on its actor's update. */
function host(comrade: Partial<ComradeRecord> = {}): { host: SheetHost; update: ReturnType<typeof vi.fn> } {
    const update = vi.fn(async () => Promise.resolve());
    const actor = {
        name: 'Trooper Halden',
        update,
        system: { gameSystem: 'ow', comrade: { ...COMRADE, ...comrade }, refitAvailable: false, comradeRecoveryDays: 0 },
    };
    // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for the sheet's actor (a Foundry Actor cannot be built under happy-dom)
    return { host: { actor } as unknown as SheetHost, update };
}

/** The actors of an ended combat: structural stand-ins with the update spy. */
type CombatActors = Parameters<typeof actions.clearComradeFearAtCombatEnd>[0];

/** The panel button, inside the panel with the amount input. */
function mentalButton(kind: string, amount: string): HTMLElement {
    const panel = document.createElement('section');
    panel.dataset['wh40kHook'] = 'ow-comrade-panel';
    panel.innerHTML = `<input data-comrade-mental-amount value="${amount}"><button data-mental-kind="${kind}"></button>`;
    document.body.replaceChildren(panel);
    const button = panel.querySelector('button');
    if (button === null) throw new Error('no button');
    return button;
}

describe('the Comrade actions (#152)', () => {
    let isGM = true;

    beforeEach(() => {
        cards.length = 0;
        isGM = true;
        vi.stubGlobal('game', {
            i18n: { localize: (key: string) => key, format: (key: string) => key },
            combat: { id: 'c1', started: true, round: 2 },
            users: {
                get activeGM() {
                    return { isSelf: isGM };
                },
            },
        });
        vi.stubGlobal('ChatMessage', { getSpeaker: () => ({}) });
    });
    afterEach(() => vi.unstubAllGlobals());

    const event = new Event('click');

    it('a recovery Order clears Fear and Pinning, and says so', async () => {
        const { host: sheet, update } = host({ fleeing: true, pinned: true });
        await actions.owComradeRecover.call(sheet, event, document.createElement('button'));
        expect(update).toHaveBeenCalledExactlyOnceWith({ 'system.comrade.fleeing': false, 'system.comrade.pinned': false });
        expect(cards.at(0)?.event).toMatchObject({ kind: 'recover', wasFleeing: true, wasPinned: true });
    });

    it('a recovery Order with nothing to clear does nothing', async () => {
        const { host: sheet, update } = host();
        await actions.owComradeRecover.call(sheet, event, document.createElement('button'));
        expect(update).not.toHaveBeenCalled();
        expect(cards).toHaveLength(0);
    });

    it('Insanity under 10 this Round is tallied; the Comrade lives', async () => {
        const { host: sheet, update } = host({ mental: { combatId: 'c1', round: 2, insanity: 4, corruption: 0 } });
        await actions.owComradeMental.call(sheet, event, mentalButton('insanity', '5'));
        expect(update).toHaveBeenCalledExactlyOnceWith({ 'system.comrade.mental': { combatId: 'c1', round: 2, insanity: 9, corruption: 0 } });
        expect(cards.at(0)?.event).toMatchObject({ kind: 'mental', amount: 5, total: 9, threshold: 10, dies: false });
    });

    it('Corruption reaching 10 in one Round kills the Comrade', async () => {
        const { host: sheet, update } = host({ mental: { combatId: 'c1', round: 2, insanity: 0, corruption: 6 } });
        await actions.owComradeMental.call(sheet, event, mentalButton('corruption', '4'));
        expect(update).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ 'system.comrade.mental': { combatId: 'c1', round: 2, insanity: 0, corruption: 10 }, 'system.comrade.state': 'dead' }),
        );
        expect(cards.at(0)?.event).toMatchObject({ kind: 'mental', dies: true });
    });

    it('a damage card carrying a Comrade hit: the active GM wounds the Comrade once and states it', async () => {
        class FakeActor {
            name = 'Trooper Halden';
            system = { comrade: COMRADE, comradeRecoveryDays: 0 };
            update = vi.fn(async () => Promise.resolve());
        }
        const pcActor = new FakeActor();
        vi.stubGlobal('Actor', FakeActor);
        vi.stubGlobal(
            'fromUuid',
            vi.fn(async () => Promise.resolve(pcActor)),
        );
        const message = {
            getFlag: (_scope: string, key: string) => (key === 'comradeHit' ? { actorUuid: 'Actor.pc', comradeName: 'Comrade Jaeger' } : undefined),
        };
        // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-in for a created chat message (only its flag is read)
        const chatMessage = message as unknown as ChatMessage;
        actions.applyComradeHitFromMessage(chatMessage);
        await vi.waitFor(() => {
            expect(cards).toHaveLength(1);
        });
        expect(pcActor.update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ 'system.comrade.state': 'wounded' }));
        expect(cards.at(0)?.event).toMatchObject({ kind: 'hit-transfer', reason: 'doubles', previousState: 'unharmed', newState: 'wounded' });

        // Another client (not the active GM) applies nothing.
        isGM = false;
        actions.applyComradeHitFromMessage(chatMessage);
        expect(pcActor.update).toHaveBeenCalledOnce();
    });

    it('the end of combat ends a Comrade’s Fear, not its Pinning, on the active GM only', async () => {
        const fled = { system: { comrade: { ...COMRADE, fleeing: true } }, update: vi.fn(async () => Promise.resolve()) };
        const pinned = { system: { comrade: { ...COMRADE, pinned: true } }, update: vi.fn(async () => Promise.resolve()) };
        // eslint-disable-next-line no-restricted-syntax -- test: minimal structural stand-ins for the combat's actors (Foundry Actors cannot be built under happy-dom)
        const ended = [fled, pinned, null] as unknown as CombatActors;
        await actions.clearComradeFearAtCombatEnd(ended);
        expect(fled.update).toHaveBeenCalledExactlyOnceWith({ 'system.comrade.fleeing': false });
        expect(pinned.update).not.toHaveBeenCalled();
        isGM = false;
        fled.update.mockClear();
        await actions.clearComradeFearAtCombatEnd(ended);
        expect(fled.update).not.toHaveBeenCalled();
    });
});
