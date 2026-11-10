import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWorldWriter } from './world-writer.ts';

/** The slice of `game.users` the helper reads. */
interface UsersStub {
    activeGM: { isSelf: boolean } | null;
}

function stubUsers(users: UsersStub): void {
    vi.stubGlobal('game', { users });
}

describe('isWorldWriter (#713)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is true on the active GM’s own client', () => {
        stubUsers({ activeGM: { isSelf: true } });
        expect(isWorldWriter()).toBe(true);
    });

    it('is false when the active GM is another user: a player, or a second GM', () => {
        stubUsers({ activeGM: { isSelf: false } });
        expect(isWorldWriter()).toBe(false);
    });

    it('is false when no GM is connected, so nothing writes the world', () => {
        stubUsers({ activeGM: null });
        expect(isWorldWriter()).toBe(false);
    });
});
