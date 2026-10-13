/**
 * Unit tests for the world-migration runner in wh40k-rpg-migrations.ts.
 *
 * WORLD_VERSION is 4; its one active step (v4, #501) grows the prototype and
 * placed tokens of Hulking-and-larger actors that still sit at 1×1.
 *
 * `game` is stubbed at the global boundary; the runner reaches only the surface
 * modelled here, so no full Foundry runtime is needed.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAndMigrateWorld } from './wh40k-rpg-migrations.ts';

interface Size {
    width: number;
    height: number;
}

interface ActorStub {
    system: { size?: number | string };
    prototypeToken: Size;
    update: ReturnType<typeof vi.fn>;
}

interface TokenStub extends Size {
    id: string;
    actor: { system: { size?: number } } | null;
}

interface SceneStub {
    grid: { distance: number; units: string };
    tokens: TokenStub[];
    updateEmbeddedDocuments: ReturnType<typeof vi.fn>;
}

interface GameStub {
    user: { isGM: boolean };
    settings: { get: () => number; set: ReturnType<typeof vi.fn> };
    actors: ActorStub[];
    scenes: SceneStub[];
}

interface GlobalShim {
    game?: GameStub | undefined;
}
const G = globalThis as GlobalShim;

function makeActor(size: number | string | undefined, proto: Size = { width: 1, height: 1 }): ActorStub {
    return { system: size === undefined ? {} : { size }, prototypeToken: proto, update: vi.fn().mockResolvedValue({}) };
}

function makeToken(id: string, size: number | undefined, wh: Size = { width: 1, height: 1 }): TokenStub {
    return { id, ...wh, actor: { system: size === undefined ? {} : { size } } };
}

function makeScene(tokens: TokenStub[]): SceneStub {
    return { grid: { distance: 1, units: 'm' }, tokens, updateEmbeddedDocuments: vi.fn().mockResolvedValue([]) };
}

/** A stub whose stored version follows `settings.set`, so a second run sees the persisted version. */
function installGame(opts: { isGM: boolean; storedVersion: number; actors: ActorStub[]; scenes: SceneStub[] }): GameStub {
    let stored = opts.storedVersion;
    const stub: GameStub = {
        user: { isGM: opts.isGM },
        settings: {
            get: (): number => stored,
            set: vi.fn((_scope: string, _key: string, value: number): void => {
                stored = value;
            }),
        },
        actors: opts.actors,
        scenes: opts.scenes,
    };
    G.game = stub;
    return stub;
}

afterEach(() => {
    G.game = undefined;
    vi.restoreAllMocks();
});

describe('checkAndMigrateWorld — v4 token footprints (#501)', () => {
    it('grows the 1×1 prototype and placed tokens of size ≥ 5 actors, then records version 4', async () => {
        const primus = makeActor(5);
        const dreadnought = makeActor(6);
        const scene = makeScene([makeToken('primus', 5), makeToken('walker', 6)]);
        const stub = installGame({ isGM: true, storedVersion: 3, actors: [primus, dreadnought], scenes: [scene] });

        await checkAndMigrateWorld();

        expect(primus.update).toHaveBeenCalledWith({ prototypeToken: { width: 2, height: 2 } });
        expect(dreadnought.update).toHaveBeenCalledWith({ prototypeToken: { width: 2, height: 2 } });
        expect(scene.updateEmbeddedDocuments).toHaveBeenCalledWith('Token', [
            { _id: 'primus', width: 2, height: 2 },
            { _id: 'walker', width: 2, height: 2 },
        ]);
        expect(stub.settings.set).toHaveBeenCalledWith('wh40k-rpg', 'world-version', 4);
    });

    it('runs once: a second load at the recorded version changes nothing', async () => {
        const primus = makeActor(5);
        const scene = makeScene([makeToken('primus', 5)]);
        const stub = installGame({ isGM: true, storedVersion: 1, actors: [primus], scenes: [scene] });

        await checkAndMigrateWorld();
        await checkAndMigrateWorld();

        expect(primus.update).toHaveBeenCalledTimes(1);
        expect(scene.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(stub.settings.set).toHaveBeenCalledTimes(1);
    });

    it('never touches a hand-resized token or prototype', async () => {
        const resized = makeActor(5, { width: 3, height: 3 });
        const scene = makeScene([makeToken('big', 5, { width: 3, height: 3 }), makeToken('wide', 6, { width: 2, height: 1 })]);
        installGame({ isGM: true, storedVersion: 3, actors: [resized], scenes: [scene] });

        await checkAndMigrateWorld();

        expect(resized.update).not.toHaveBeenCalled();
        expect(scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('skips actors of size ≤ 4, non-numeric sizes and actorless tokens', async () => {
        const average = makeActor(4);
        const malformed = makeActor('hulking');
        const orphan: TokenStub = { id: 'orphan', width: 1, height: 1, actor: null };
        const scene = makeScene([makeToken('pc', 4), makeToken('tiny', 2), orphan]);
        installGame({ isGM: true, storedVersion: 3, actors: [average, malformed], scenes: [scene] });

        await checkAndMigrateWorld();

        expect(average.update).not.toHaveBeenCalled();
        expect(malformed.update).not.toHaveBeenCalled();
        expect(scene.updateEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('keeps going when one document fails, and still records the version', async () => {
        const failing = makeActor(5);
        failing.update.mockRejectedValue(new Error('boom'));
        const next = makeActor(7);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const stub = installGame({ isGM: true, storedVersion: 3, actors: [failing, next], scenes: [] });

        await checkAndMigrateWorld();

        expect(next.update).toHaveBeenCalledWith({ prototypeToken: { width: 3, height: 3 } });
        expect(stub.settings.set).toHaveBeenCalledWith('wh40k-rpg', 'world-version', 4);
    });

    it('is a no-op for a non-GM', async () => {
        const primus = makeActor(5);
        const stub = installGame({ isGM: false, storedVersion: 1, actors: [primus], scenes: [] });

        await checkAndMigrateWorld();

        expect(primus.update).not.toHaveBeenCalled();
        expect(stub.settings.set).not.toHaveBeenCalled();
    });
});
