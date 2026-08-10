/**
 * Unit tests for the world-migration runner in wh40k-rpg-migrations.ts.
 *
 * Pre-release baseline: WORLD_VERSION is 1 with NO active migration steps. The
 * runner is still functional (it bumps a world whose stored version differs
 * from 1 and persists the new version), but `migrateActorData` is a no-op, so
 * no actor data is modified — including the previously-active v189 `gameSystem`
 * normalization, which is now commented out for reference.
 *
 * `game` is stubbed at the global boundary; the runner reaches only the surface
 * modelled here, so no full Foundry runtime is needed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAndMigrateWorld } from './wh40k-rpg-migrations.ts';

interface ActorStub {
    type: string;
    system: { gameSystem?: string };
    update: ReturnType<typeof vi.fn>;
}

interface GameStub {
    user: { isGM: boolean };
    settings: { get: () => number; set: ReturnType<typeof vi.fn> };
    actors: { contents: ActorStub[] };
    items: { contents: ActorStub[] };
}

interface GlobalShim {
    game?: GameStub | undefined;
}
const G = globalThis as GlobalShim;

function makeActor(type: string, gameSystem?: string): ActorStub {
    const system = gameSystem === undefined ? {} : { gameSystem };
    return { type, system, update: vi.fn().mockResolvedValue(undefined) };
}

function installGame(opts: { isGM: boolean; storedVersion: number; actors: ActorStub[] }): {
    set: ReturnType<typeof vi.fn>;
} {
    const set = vi.fn().mockResolvedValue(undefined);
    G.game = {
        user: { isGM: opts.isGM },
        settings: { get: (): number => opts.storedVersion, set },
        actors: { contents: opts.actors },
        items: { contents: [] },
    };
    return { set };
}

afterEach(() => {
    G.game = undefined;
    vi.restoreAllMocks();
});

describe('checkAndMigrateWorld — all migrations commented out', () => {
    it('is a no-op regardless of version (all steps commented out)', async () => {
        const actor = makeActor('dh2-character', 'rt');
        const { set } = installGame({ isGM: true, storedVersion: 1, actors: [actor] });

        await checkAndMigrateWorld();

        expect(set).not.toHaveBeenCalled();
        expect(actor.update).not.toHaveBeenCalled();
    });

    it('is a no-op for non-GM', async () => {
        const actor = makeActor('dh2-character', 'rt');
        const { set } = installGame({ isGM: false, storedVersion: 1, actors: [actor] });

        await checkAndMigrateWorld();

        expect(set).not.toHaveBeenCalled();
        expect(actor.update).not.toHaveBeenCalled();
    });
});
