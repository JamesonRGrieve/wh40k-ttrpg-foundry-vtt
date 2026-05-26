/**
 * Unit tests for the world-migration runner in wh40k-rpg-migrations.ts.
 *
 * Focus: the v189 actor `gameSystem` normalization step. The migration runs
 * once when the persisted world-version differs from WORLD_VERSION (and the
 * current user is GM), iterates world actors, and rewrites `system.gameSystem`
 * to the canonical key derived from the actor `type` prefix:
 *   - `dh2-*` → 'dh2e'
 *   - `dh1-*` → 'dh1e'
 * Other actor types are left untouched, and an already-canonical value is a
 * no-op (no `actor.update` call).
 *
 * `game` is stubbed at the global boundary; the migration function reaches only
 * the surface modelled here, so no full Foundry runtime is needed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkAndMigrateWorld } from './wh40k-rpg-migrations.ts';

interface ActorStub {
    type: string;
    system: { gameSystem?: string };
    update: ReturnType<typeof vi.fn>;
}

interface SettingsStub {
    get: (system: string, key: string) => unknown;
    set: ReturnType<typeof vi.fn>;
}

interface GameStub {
    user: { isGM: boolean };
    settings: SettingsStub;
    actors: { contents: ActorStub[] };
}

interface GlobalShim {
    game?: GameStub | undefined;
}
const G = globalThis as GlobalShim;

function makeActor(type: string, gameSystem?: string): ActorStub {
    const system = gameSystem === undefined ? {} : { gameSystem };
    return { type, system, update: vi.fn(() => Promise.resolve()) };
}

function installGame(opts: { isGM: boolean; storedVersion: number; actors: ActorStub[] }): {
    set: ReturnType<typeof vi.fn>;
} {
    const set = vi.fn(() => Promise.resolve());
    G.game = {
        user: { isGM: opts.isGM },
        settings: {
            // worldVersion is the only setting read by the migration runner
            get: (_system: string, _key: string): number => opts.storedVersion,
            set,
        },
        actors: { contents: opts.actors },
    };
    return { set };
}

afterEach(() => {
    G.game = undefined;
    vi.restoreAllMocks();
});

describe('checkAndMigrateWorld — v189 gameSystem normalization', () => {
    it('rewrites a dh2- actor with a stale gameSystem to dh2e', async () => {
        const actor = makeActor('dh2-character', 'rt');
        installGame({ isGM: true, storedVersion: 188, actors: [actor] });

        await checkAndMigrateWorld();

        expect(actor.update).toHaveBeenCalledTimes(1);
        expect(actor.update).toHaveBeenCalledWith({ 'system.gameSystem': 'dh2e' });
    });

    it('rewrites a dh1- actor with a stale gameSystem to dh1e', async () => {
        const actor = makeActor('dh1-npc', 'dh2e');
        installGame({ isGM: true, storedVersion: 188, actors: [actor] });

        await checkAndMigrateWorld();

        expect(actor.update).toHaveBeenCalledWith({ 'system.gameSystem': 'dh1e' });
    });

    it('no-ops a dh2- actor already on the canonical key', async () => {
        const actor = makeActor('dh2-vehicle', 'dh2e');
        installGame({ isGM: true, storedVersion: 188, actors: [actor] });

        await checkAndMigrateWorld();

        expect(actor.update).not.toHaveBeenCalled();
    });

    it('leaves non-dh1/dh2 actors untouched (homologation-safe)', async () => {
        const rt = makeActor('rt-character', 'rt');
        const im = makeActor('im-character', 'im');
        const ow = makeActor('ow-npc', 'dh2e'); // even a wrong value is left alone for non-dh1/dh2 types
        installGame({ isGM: true, storedVersion: 188, actors: [rt, im, ow] });

        await checkAndMigrateWorld();

        expect(rt.update).not.toHaveBeenCalled();
        expect(im.update).not.toHaveBeenCalled();
        expect(ow.update).not.toHaveBeenCalled();
    });

    it('normalizes a dh2- actor with no gameSystem field set', async () => {
        const actor = makeActor('dh2-character');
        installGame({ isGM: true, storedVersion: 188, actors: [actor] });

        await checkAndMigrateWorld();

        expect(actor.update).toHaveBeenCalledWith({ 'system.gameSystem': 'dh2e' });
    });

    it('persists the new world version after migrating', async () => {
        const actor = makeActor('dh2-character', 'rt');
        const { set } = installGame({ isGM: true, storedVersion: 188, actors: [actor] });

        await checkAndMigrateWorld();

        // Final argument is the bumped WORLD_VERSION (189)
        expect(set).toHaveBeenCalledTimes(1);
        const lastArg = set.mock.calls[0]?.[2];
        expect(lastArg).toBe(189);
    });

    it('does not run when already at the current world version', async () => {
        const actor = makeActor('dh2-character', 'rt');
        const { set } = installGame({ isGM: true, storedVersion: 189, actors: [actor] });

        await checkAndMigrateWorld();

        expect(actor.update).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });

    it('does not run for a non-GM user', async () => {
        const actor = makeActor('dh2-character', 'rt');
        const { set } = installGame({ isGM: false, storedVersion: 188, actors: [actor] });

        await checkAndMigrateWorld();

        expect(actor.update).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });

    it('continues migrating remaining actors when one actor.update throws', async () => {
        const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const bad = makeActor('dh2-character', 'rt');
        bad.update.mockRejectedValueOnce(new Error('boom'));
        const good = makeActor('dh1-character', 'rt');
        installGame({ isGM: true, storedVersion: 188, actors: [bad, good] });

        await checkAndMigrateWorld();

        expect(bad.update).toHaveBeenCalledWith({ 'system.gameSystem': 'dh2e' });
        expect(good.update).toHaveBeenCalledWith({ 'system.gameSystem': 'dh1e' });
        expect(consoleErr).toHaveBeenCalled();
    });
});
