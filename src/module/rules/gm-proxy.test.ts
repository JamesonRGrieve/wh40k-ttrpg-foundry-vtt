import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gmProxyActorUpdate, registerGMProxy } from './gm-proxy';

describe('gm-proxy (#562)', () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const mockEmit = vi.fn();

    function fakeActor(uuid: string, isOwner: boolean): { uuid: string; isOwner: boolean; update: typeof mockUpdate } {
        return { uuid, isOwner, update: mockUpdate };
    }

    beforeEach(() => {
        vi.resetAllMocks();
        Object.assign(globalThis, {
            game: {
                user: { isGM: false },
                socket: { emit: mockEmit, on: vi.fn() },
            },
        });
    });

    it('updates directly when user owns the actor', async () => {
        await gmProxyActorUpdate(fakeActor('Actor.owned1', true), { 'system.wounds.value': 5 });
        expect(mockUpdate).toHaveBeenCalledWith({ 'system.wounds.value': 5 });
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it('asks the GM by UUID when the user does not own the actor (#782)', async () => {
        const tokenActor = 'Scene.s1.Token.t1.Actor.crawler';
        await gmProxyActorUpdate(fakeActor(tokenActor, false), { 'system.wounds.value': 5 });
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockEmit).toHaveBeenCalledWith('system.wh40k-rpg', {
            type: 'updateActor',
            actorUuid: tokenActor,
            data: { 'system.wounds.value': 5 },
        });
    });

    it('the GM updates the actor the UUID names, a token actor included (#782)', async () => {
        let handler: ((payload: object) => void) | undefined;
        const tokenActor = fakeActor('Scene.s1.Token.t1.Actor.crawler', true);
        const resolve = vi.fn(async (uuid: string) => Promise.resolve(uuid === tokenActor.uuid ? tokenActor : null));
        Object.assign(globalThis, {
            fromUuid: resolve,
            game: {
                user: { isGM: true },
                socket: {
                    on: (_name: string, fn: (payload: object) => void): void => {
                        handler = fn;
                    },
                    emit: vi.fn(),
                },
            },
        });
        registerGMProxy();
        handler?.({ type: 'updateActor', actorUuid: tokenActor.uuid, data: { 'system.wounds.value': 8 } });
        await vi.waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith({ 'system.wounds.value': 8 });
        });
        expect(resolve).toHaveBeenCalledWith(tokenActor.uuid);
    });

    it('registerGMProxy registers the socket listener', () => {
        const mockOn = vi.fn();
        Object.assign(globalThis, {
            game: { user: { isGM: true }, socket: { on: mockOn, emit: vi.fn() } },
        });
        registerGMProxy();
        expect(mockOn).toHaveBeenCalledWith('system.wh40k-rpg', expect.any(Function));
    });

    it('ignores the other messages the shared system socket carries (attack cues, #594)', () => {
        let handler: ((payload: { type: string }) => void) | undefined;
        const get = vi.fn();
        Object.assign(globalThis, {
            fromUuid: get,
            game: {
                user: { isGM: true },
                socket: {
                    on: (_name: string, fn: (payload: { type: string }) => void): void => {
                        handler = fn;
                    },
                    emit: vi.fn(),
                },
            },
        });
        registerGMProxy();
        handler?.({ type: 'attackCue' });
        expect(get).not.toHaveBeenCalled();
    });
});
