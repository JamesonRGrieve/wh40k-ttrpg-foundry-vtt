import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApplicationV2Api, installApplicationV2Stub } from '../testing/app-v2-stub.ts';

/**
 * The prompts a grapple option needs once it resolves (#665): the GM-confirmed
 * token move a won Push Opponent offers, and the item a Ready or Use Item names.
 * The dialog and the scene are stubbed at the Foundry boundary; the choices and
 * the token writes are what is asserted.
 */

const writes: Array<{ uuid: string; state: string }> = [];
vi.mock('./grapple-relay.ts', () => ({
    applyGrappleWrites: async (list: Array<{ uuid: string; state: string }>): Promise<void> => {
        writes.push(...list);
        return Promise.resolve();
    },
}));

installApplicationV2Stub();
const mod = await import('./grapple-controls.ts');

describe('grapplePushCompass', () => {
    it('lays the eight directions out as a compass around the opponent, north pre-selected', () => {
        const cells = mod.grapplePushCompass();
        expect(cells.map((cell) => cell.value)).toEqual(['nw', 'n', 'ne', 'w', '', 'e', 'sw', 's', 'se']);
        expect(cells.filter((cell) => cell.checked).map((cell) => cell.value)).toEqual(['n']);
        expect(cells.at(4)?.labelKey).toBe('');
        expect(cells.at(0)?.labelKey).toBe('WH40K.Grapple.Push.Dir.nw');
    });
});

describe('readGrapplePushButton', () => {
    it('reads the card button, and refuses an incomplete one', () => {
        expect(mod.readGrapplePushButton({ controllerUuid: 'Actor.c', targetUuid: 'Actor.t', targetName: 'T', metres: '3' })).toEqual({
            controllerUuid: 'Actor.c',
            targetUuid: 'Actor.t',
            targetName: 'T',
            metres: 3,
        });
        expect(mod.readGrapplePushButton({ controllerUuid: 'Actor.c', targetUuid: '', metres: '3' })).toBeNull();
        expect(mod.readGrapplePushButton({ controllerUuid: 'Actor.c', targetUuid: 'Actor.t', metres: '0' })).toBeNull();
    });
});

describe('readGrapplePushForm', () => {
    it('reads the direction and whether the controller follows', () => {
        expect(mod.readGrapplePushForm({ direction: 'se', controller: 'follow' })).toEqual({ direction: 'se', follow: true });
        expect(mod.readGrapplePushForm({ direction: 'w', controller: 'let-go' })).toEqual({ direction: 'w', follow: false });
        expect(mod.readGrapplePushForm({ direction: '', controller: 'follow' })).toBeNull();
    });
});

describe('grapplePushTokenUpdates', () => {
    const target = { id: 't', x: 100, y: 100 };
    const controller = { id: 'c', x: 0, y: 100 };

    it('moves the opponent, and the controller with it when it follows', () => {
        expect(mod.grapplePushTokenUpdates(target, controller, { x: 200, y: 0 })).toEqual([
            { id: 't', x: 300, y: 100 },
            { id: 'c', x: 200, y: 100 },
        ]);
        expect(mod.grapplePushTokenUpdates(target, null, { x: 0, y: -100 })).toEqual([{ id: 't', x: 100, y: 0 }]);
    });
});

describe('grappleItemChoices', () => {
    const items = [
        { uuid: 'a', name: 'Knife', img: null, system: { state: { equipped: true } } },
        { uuid: 'b', name: 'Stub Revolver', img: null, system: { state: { equipped: false } } },
        { uuid: 'c', name: 'Unarmed', img: null, system: { state: { equipped: true }, grantedByDefault: true } },
        { uuid: 'd', name: 'Iron Will', img: null, system: {} },
    ];

    it('Ready offers the carried items not yet readied; Use Item the readied ones; never the unarmed strike or a talent', () => {
        expect(mod.grappleItemChoices('ready', items).map((item) => item.name)).toEqual(['Stub Revolver']);
        expect(mod.grappleItemChoices('use-item', items).map((item) => item.name)).toEqual(['Knife']);
    });
});

describe('grapplePushFromCard', () => {
    const updates: object[][] = [];
    let prompt: ReturnType<typeof vi.fn>;

    /** The card's push button for a 3 m push. */
    function pushButton(): HTMLButtonElement {
        const button = document.createElement('button');
        Object.assign(button.dataset, { controllerUuid: 'Actor.c', targetUuid: 'Actor.t', targetName: 'Target', metres: '3' });
        return button;
    }

    function stubFoundry(isGM: boolean, choice: { direction: string; follow: boolean } | null): void {
        prompt = vi.fn(async () => Promise.resolve(choice));
        vi.stubGlobal('game', { user: { isGM }, i18n: { localize: (key: string) => key, format: (key: string) => key } });
        vi.stubGlobal('ui', { notifications: { warn: vi.fn(), info: vi.fn() } });
        vi.stubGlobal('canvas', {
            scene: {
                grid: { size: 100, distance: 1 },
                tokens: [
                    { id: 't', x: 500, y: 500, actor: { uuid: 'Actor.t' } },
                    { id: 'c', x: 400, y: 500, actor: { uuid: 'Actor.c' } },
                ],
                updateEmbeddedDocuments: async (_name: string, list: object[]): Promise<void> => {
                    updates.push(list);
                    return Promise.resolve();
                },
            },
        });
        vi.stubGlobal('foundry', {
            applications: {
                api: { ...buildApplicationV2Api(), DialogV2: { prompt } },
                handlebars: { renderTemplate: async (): Promise<string> => Promise.resolve('') },
            },
        });
    }

    beforeEach(() => {
        updates.length = 0;
        writes.length = 0;
    });
    afterEach(() => vi.unstubAllGlobals());

    it('only the GM moves the tokens', async () => {
        stubFoundry(false, { direction: 'e', follow: true });
        await mod.grapplePushFromCard(pushButton());
        expect(prompt).not.toHaveBeenCalled();
        expect(updates).toEqual([]);
        expect(ui.notifications.warn).toHaveBeenCalledOnce();
    });

    it('the GM confirms the direction, and both tokens move three squares when the controller follows', async () => {
        stubFoundry(true, { direction: 'e', follow: true });
        const button = pushButton();
        await mod.grapplePushFromCard(button);
        expect(prompt).toHaveBeenCalledOnce();
        expect(updates).toEqual([
            [
                { _id: 't', x: 800, y: 500 },
                { _id: 'c', x: 700, y: 500 },
            ],
        ]);
        expect(writes).toEqual([]);
        expect(button.disabled).toBe(true);
    });

    it('letting go moves only the opponent and ends the grapple for both', async () => {
        stubFoundry(true, { direction: 'n', follow: false });
        await mod.grapplePushFromCard(pushButton());
        expect(updates).toEqual([[{ _id: 't', x: 500, y: 200 }]]);
        expect(writes.map((write) => [write.uuid, write.state])).toEqual([
            ['Actor.c', 'none'],
            ['Actor.t', 'none'],
        ]);
    });

    it('a cancelled dialog moves nothing', async () => {
        stubFoundry(true, null);
        await mod.grapplePushFromCard(pushButton());
        expect(updates).toEqual([]);
    });
});
