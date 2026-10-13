/**
 * Burn Fate from the character sheet (#42).
 *
 * `spendFate` with `data-fate-action="burn"` confirms, then writes the burn
 * through `rules/fate.ts` (the total drops by 1 and the points are cut to it).
 * Regression: after the Status tab was folded into Overview (#263) and the
 * Burn Threshold line was retired (#63), no template carried a burn control, so
 * the handler was unreachable and a player could not burn Fate from the sheet.
 * The Overview vitals Fate row now carries it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

const confirm = vi.fn<(options: object) => Promise<boolean>>();
vi.mock('../src/module/applications/dialogs/confirmation-dialog.ts', () => ({ default: { confirm } }));

interface GameStub {
    i18n: { localize: (key: string) => string; format: (key: string) => string };
}
interface ChatMessageStub {
    create: (data: object) => Promise<object>;
    getSpeaker: () => object;
}
interface Stubs {
    game?: GameStub | undefined;
    ChatMessage?: ChatMessageStub | undefined;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: bridging globalThis to the stub shape; `declare global` cannot augment globalThis from a test file without leaking into global scope.
const stubs = globalThis as unknown as Stubs;
const ORIGINAL = { game: stubs.game, ChatMessage: stubs.ChatMessage };
const chatCreate = vi.fn<(data: object) => Promise<object>>();
stubs.game = { i18n: { localize: (key: string): string => key, format: (key: string): string => key } };
stubs.ChatMessage = { create: chatCreate, getSpeaker: (): object => ({}) };

const { spendFate } = await import('../src/module/applications/api/stat-adjustment-actions.ts');

afterAll(() => {
    stubs.game = ORIGINAL.game;
    stubs.ChatMessage = ORIGINAL.ChatMessage;
});

interface HostFate {
    max: number;
    value: number;
}

type Host = ThisParameterType<typeof spendFate>;
type UpdateFn = (data: object) => Promise<object>;
type NotifyFn = (type: string, message: string, options?: object) => void;

function makeHost(fate: HostFate): { host: Host; update: Mock<UpdateFn>; notify: Mock<NotifyFn> } {
    const update = vi.fn<UpdateFn>().mockResolvedValue({});
    const notify = vi.fn<NotifyFn>();
    const host: Host = {
        actor: { id: 'a1', name: 'Acolyte', system: { fate }, update },
        _throttle: async (_key, _wait, fn, ctx, args) => Promise.resolve(fn.apply(ctx, args)),
        _notify: notify,
        _updateSystemField: async (): Promise<void> => Promise.resolve(),
    };
    return { host, update, notify };
}

function burnButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.dataset['action'] = 'spendFate';
    button.dataset['fateAction'] = 'burn';
    return button;
}

describe('Burn Fate from the sheet (#42)', () => {
    beforeEach(() => {
        confirm.mockReset();
        chatCreate.mockReset().mockResolvedValue({});
    });

    it('confirmed: drops the total by one, cuts the points to it, and announces it', async () => {
        confirm.mockResolvedValue(true);
        const { host, update } = makeHost({ max: 3, value: 3 });
        await spendFate.call(host, new Event('click'), burnButton());
        expect(update).toHaveBeenCalledWith({ 'system.fate.max': 2, 'system.fate.value': 2 });
        expect(chatCreate).toHaveBeenCalledTimes(1);
    });

    it('burns with no points left (RAW), keeping the spent pool at 0', async () => {
        confirm.mockResolvedValue(true);
        const { host, update } = makeHost({ max: 2, value: 0 });
        await spendFate.call(host, new Event('click'), burnButton());
        expect(update).toHaveBeenCalledWith({ 'system.fate.max': 1, 'system.fate.value': 0 });
    });

    it('declined: writes nothing and posts nothing', async () => {
        confirm.mockResolvedValue(false);
        const { host, update } = makeHost({ max: 3, value: 1 });
        await spendFate.call(host, new Event('click'), burnButton());
        expect(update).not.toHaveBeenCalled();
        expect(chatCreate).not.toHaveBeenCalled();
    });

    it('no Fate total: warns without asking', async () => {
        const { host, update, notify } = makeHost({ max: 0, value: 0 });
        await spendFate.call(host, new Event('click'), burnButton());
        expect(confirm).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('warning', 'WH40K.Notify.Stat.NoFateAvailable', expect.anything());
    });
});

describe('the Burn Fate control is reachable (#42 regression)', () => {
    const vitals = readFileSync(resolve(__dirname, '../src/templates/actor/panel/overview-vitals-panel.hbs'), 'utf8');
    const sheet = readFileSync(resolve(__dirname, '../src/module/applications/actor/character-sheet.ts'), 'utf8');

    it('the Overview vitals Fate row carries a spendFate burn button', () => {
        expect(vitals).toMatch(/<button[^>]*data-action="spendFate"[^>]*data-fate-action="burn"/);
    });

    it('the character sheet wires spendFate to the shared handler', () => {
        expect(sheet).toContain("'spendFate': StatActions.spendFate");
    });
});
