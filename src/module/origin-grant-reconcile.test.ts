import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Characterization tests for the boot-time origin-grant reconcile pass (#306
 * will extract its per-origin reconcile/materialization helper). Pins the gating
 * (GM-only + setting-gated), the per-actor origin filtering, the resilience
 * contract (one failing origin must not abort the pass), and that every origin
 * is re-applied with `{ silent: true }`.
 *
 * `game` is a framework global, stubbed here; the actor/item shapes are the loose
 * ReconcileActorLike surface the function narrows to internally, so no
 * Document-type casts are needed. The module reads `game` at call time, so it is
 * refreshed per test.
 */

interface FakeOrigin {
    name: string;
    isOriginPath: boolean;
    applyOriginToActor: ReturnType<typeof vi.fn>;
}
interface FakeActor {
    name: string;
    items: { contents: FakeOrigin[] };
}
interface GameStub {
    user: { isGM: boolean };
    settings: { get: (scope: string, key: string) => boolean | undefined };
    actors: { contents: FakeActor[] };
}
interface GlobalShim {
    game?: GameStub | undefined;
}

const G = globalThis as GlobalShim;
const ORIGINAL_GAME = G.game;

function origin(name: string, opts: { isOriginPath?: boolean; rejects?: boolean } = {}): FakeOrigin {
    return {
        name,
        isOriginPath: opts.isOriginPath ?? true,
        applyOriginToActor: opts.rejects === true ? vi.fn().mockRejectedValue(new Error(`boom: ${name}`)) : vi.fn().mockResolvedValue(undefined),
    };
}

function setGame(opts: { isGM?: boolean; enabled?: boolean | undefined; actors?: FakeActor[] }): void {
    G.game = {
        user: { isGM: opts.isGM ?? true },
        settings: { get: (): boolean | undefined => opts.enabled },
        actors: { contents: opts.actors ?? [] },
    };
}

const { reconcileWorldOriginGrants } = await import('./origin-grant-reconcile.ts');

beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

afterAll(() => {
    G.game = ORIGINAL_GAME;
});

describe('reconcileWorldOriginGrants', () => {
    it('is a no-op for a non-GM user', async () => {
        const o = origin('Hive World');
        setGame({ isGM: false, enabled: true, actors: [{ name: 'PC', items: { contents: [o] } }] });

        await reconcileWorldOriginGrants();

        expect(o.applyOriginToActor).not.toHaveBeenCalled();
    });

    it('is a no-op when the setting is explicitly disabled', async () => {
        const o = origin('Hive World');
        setGame({ isGM: true, enabled: false, actors: [{ name: 'PC', items: { contents: [o] } }] });

        await reconcileWorldOriginGrants();

        expect(o.applyOriginToActor).not.toHaveBeenCalled();
    });

    it('runs when the setting is undefined (only an explicit false disables)', async () => {
        const o = origin('Hive World');
        setGame({ isGM: true, enabled: undefined, actors: [{ name: 'PC', items: { contents: [o] } }] });

        await reconcileWorldOriginGrants();

        expect(o.applyOriginToActor).toHaveBeenCalledTimes(1);
    });

    it('re-applies every origin-path item silently and skips non-origin items', async () => {
        const homeWorld = origin('Hive World');
        const background = origin('Scavenger');
        const notAnOrigin = origin('Bolt Pistol', { isOriginPath: false });
        const actor: FakeActor = { name: 'PC', items: { contents: [homeWorld, notAnOrigin, background] } };
        setGame({ isGM: true, enabled: true, actors: [actor] });

        await reconcileWorldOriginGrants();

        expect(homeWorld.applyOriginToActor).toHaveBeenCalledWith(actor, { silent: true });
        expect(background.applyOriginToActor).toHaveBeenCalledWith(actor, { silent: true });
        expect(notAnOrigin.applyOriginToActor).not.toHaveBeenCalled();
    });

    it('continues past an origin whose apply throws (one bad origin does not abort the pass)', async () => {
        const bad = origin('Corrupt Origin', { rejects: true });
        const good = origin('Hive World');
        const actor: FakeActor = { name: 'PC', items: { contents: [bad, good] } };
        setGame({ isGM: true, enabled: true, actors: [actor] });

        await expect(reconcileWorldOriginGrants()).resolves.toBeUndefined();

        expect(bad.applyOriginToActor).toHaveBeenCalledTimes(1);
        expect(good.applyOriginToActor).toHaveBeenCalledTimes(1);
    });

    it('skips actors with no origin-path items', async () => {
        const lone = origin('Bolt Pistol', { isOriginPath: false });
        const withOrigin = origin('Hive World');
        setGame({
            isGM: true,
            enabled: true,
            actors: [
                { name: 'Gear Only', items: { contents: [lone] } },
                { name: 'PC', items: { contents: [withOrigin] } },
            ],
        });

        await reconcileWorldOriginGrants();

        expect(lone.applyOriginToActor).not.toHaveBeenCalled();
        expect(withOrigin.applyOriginToActor).toHaveBeenCalledTimes(1);
    });
});
