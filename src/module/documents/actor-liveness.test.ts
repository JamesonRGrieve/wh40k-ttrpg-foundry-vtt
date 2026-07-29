import { afterEach, describe, expect, it, vi } from 'vitest';
import { isActorWritable, noteActorDeleting, resetActorLivenessForTesting } from './actor-liveness.ts';

/** Install a `game.actors` stub holding exactly the given ids. */
function withWorldActors(ids: readonly string[]): void {
    const present = new Set(ids);
    vi.stubGlobal('game', { actors: { get: (id: string): object | undefined => (present.has(id) ? { _id: id } : undefined) } });
}

afterEach(() => {
    resetActorLivenessForTesting();
    vi.unstubAllGlobals();
});

describe('isActorWritable', () => {
    it('is true for an actor still in the world collection', () => {
        withWorldActors(['aaaaaaaaaaaaaaaa']);
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa' })).toBe(true);
    });

    it('is false once the actor has left the collection', () => {
        withWorldActors([]);
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa' })).toBe(false);
    });

    it('is false as soon as deletion is REQUESTED, before the collection drops it', () => {
        // This is the whole point of the module: between `actor.delete()` and the
        // server broadcasting it back, `game.actors.get` still returns the actor,
        // and a write dispatched in that window is rejected with a red toast.
        withWorldActors(['aaaaaaaaaaaaaaaa']);
        noteActorDeleting('aaaaaaaaaaaaaaaa');
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa' })).toBe(false);
    });

    it('leaves other actors writable when one is deleting', () => {
        withWorldActors(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
        noteActorDeleting('aaaaaaaaaaaaaaaa');
        expect(isActorWritable({ _id: 'bbbbbbbbbbbbbbbb' })).toBe(true);
    });

    it('is true with no id to check — callers behave as they did before the guard', () => {
        withWorldActors([]);
        expect(isActorWritable({})).toBe(true);
        expect(isActorWritable({ _id: null })).toBe(true);
        expect(isActorWritable({ _id: '' })).toBe(true);
    });

    it('is true when there is no game.actors at all (vitest / headless tooling)', () => {
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa' })).toBe(true);
    });

    it('is true for a token-delta actor, which is never in game.actors', () => {
        // Testing a synthetic actor against the world collection would report
        // EVERY unlinked token's actor dead and disable its reactive writes.
        withWorldActors([]);
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa', isToken: true })).toBe(true);
    });

    it('is true for a compendium actor, which is never in game.actors either', () => {
        withWorldActors([]);
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa', pack: 'wh40k-rpg.dh2-core-actors' })).toBe(true);
    });

    it('is still false for a token/compendium actor whose deletion was requested', () => {
        withWorldActors(['aaaaaaaaaaaaaaaa']);
        noteActorDeleting('aaaaaaaaaaaaaaaa');
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa', isToken: true })).toBe(false);
    });
});

describe('noteActorDeleting', () => {
    it('ignores a missing or empty id', () => {
        withWorldActors(['aaaaaaaaaaaaaaaa']);
        noteActorDeleting(null);
        noteActorDeleting(undefined);
        noteActorDeleting('');
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa' })).toBe(true);
    });

    it('is idempotent for the same id', () => {
        withWorldActors(['aaaaaaaaaaaaaaaa']);
        noteActorDeleting('aaaaaaaaaaaaaaaa');
        noteActorDeleting('aaaaaaaaaaaaaaaa');
        expect(isActorWritable({ _id: 'aaaaaaaaaaaaaaaa' })).toBe(false);
    });

    it('bounds its memory, evicting the oldest ids first', () => {
        // 256 is the ring size; the 257th note must evict the 1st.
        withWorldActors(['oldest', 'newest']);
        noteActorDeleting('oldest');
        for (let i = 0; i < 256; i++) noteActorDeleting(`filler-${String(i)}`);
        noteActorDeleting('newest');
        expect(isActorWritable({ _id: 'oldest' })).toBe(true);
        expect(isActorWritable({ _id: 'newest' })).toBe(false);
    });
});
