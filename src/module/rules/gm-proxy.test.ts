import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gmProxyActorUpdate, registerGMProxy } from './gm-proxy';

describe('gm-proxy (#562)', () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const mockEmit = vi.fn();

    function fakeActor(id: string, isOwner: boolean): { id: string; isOwner: boolean; update: typeof mockUpdate } {
        return { id, isOwner, update: mockUpdate };
    }

    beforeEach(() => {
        vi.resetAllMocks();
        const actors = new Map([
            ['actor1', fakeActor('actor1', false)],
            ['owned1', fakeActor('owned1', true)],
        ]);
        Object.assign(globalThis, {
            game: {
                user: { isGM: false },
                actors: { get: (id: string) => actors.get(id) },
                socket: { emit: mockEmit, on: vi.fn() },
            },
        });
    });

    it('updates directly when user owns the actor', async () => {
        await gmProxyActorUpdate('owned1', { 'system.wounds.value': 5 });
        expect(mockUpdate).toHaveBeenCalledWith({ 'system.wounds.value': 5 });
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it('emits via socket when user does not own the actor', async () => {
        await gmProxyActorUpdate('actor1', { 'system.wounds.value': 5 });
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockEmit).toHaveBeenCalledWith('system.wh40k-rpg', {
            type: 'updateActor',
            actorId: 'actor1',
            data: { 'system.wounds.value': 5 },
        });
    });

    it('is a no-op for unknown actor ids', async () => {
        await gmProxyActorUpdate('nonexistent', { 'system.wounds.value': 5 });
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
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
            game: {
                user: { isGM: true },
                actors: { get },
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
