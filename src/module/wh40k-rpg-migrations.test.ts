/**
 * Unit tests for the world-migration runner in wh40k-rpg-migrations.ts.
 *
 * WORLD_VERSION is 5. v4 (#501) grows the prototype and placed tokens of
 * Hulking-and-larger actors that still sit at 1×1; v5 (#574) loads the empty
 * magazines of compendium-linked weapons on world actors and unlinked tokens.
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

interface ItemStub {
    id: string | null;
    name: string;
    _source: object;
}

interface ActorStub {
    name: string;
    system: { size?: number | string };
    prototypeToken: Size;
    items: ItemStub[];
    update: ReturnType<typeof vi.fn>;
    updateEmbeddedDocuments: ReturnType<typeof vi.fn>;
}

interface TokenStub extends Size {
    id: string;
    actorLink: boolean;
    actor: { name: string; system: { size?: number }; items: ItemStub[]; updateEmbeddedDocuments: ReturnType<typeof vi.fn> } | null;
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

function makeActor(size: number | string | undefined, proto: Size = { width: 1, height: 1 }, items: ItemStub[] = []): ActorStub {
    return {
        name: 'actor',
        system: size === undefined ? {} : { size },
        prototypeToken: proto,
        items,
        update: vi.fn().mockResolvedValue({}),
        updateEmbeddedDocuments: vi.fn().mockResolvedValue([]),
    };
}

function makeToken(id: string, size: number | undefined, wh: Size = { width: 1, height: 1 }, items: ItemStub[] = [], actorLink = false): TokenStub {
    return {
        id,
        ...wh,
        actorLink,
        actor: { name: `token ${id}`, system: size === undefined ? {} : { size }, items, updateEmbeddedDocuments: vi.fn().mockResolvedValue([]) },
    };
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
    it('grows the 1×1 prototype and placed tokens of size ≥ 5 actors, then records version 5', async () => {
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
        expect(stub.settings.set).toHaveBeenCalledWith('wh40k-rpg', 'world-version', 5);
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
        const orphan: TokenStub = { id: 'orphan', width: 1, height: 1, actorLink: false, actor: null };
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
        expect(stub.settings.set).toHaveBeenCalledWith('wh40k-rpg', 'world-version', 5);
    });

    it('is a no-op for a non-GM', async () => {
        const primus = makeActor(5);
        const stub = installGame({ isGM: false, storedVersion: 1, actors: [primus], scenes: [] });

        await checkAndMigrateWorld();

        expect(primus.update).not.toHaveBeenCalled();
        expect(stub.settings.set).not.toHaveBeenCalled();
    });
});

const AUTOGUN = 'Compendium.wh40k-rpg.dh2-weapons.Item.autogun0000000';
const SWORD = 'Compendium.wh40k-rpg.dh2-weapons.Item.sword00000000000';

/** Canonical clip sizes the stubbed `fromUuid` hands back. */
const CANONICAL_CLIP: Record<string, number> = { [AUTOGUN]: 30, [SWORD]: 0 };

interface FromUuidShim {
    fromUuid?: ((uuid: string) => Promise<object | null>) | undefined;
}
const F = globalThis as FromUuidShim;

/** A lean compendium stub: its cleaned source holds the schema initial `clip.value` 0. */
function leanWeapon(id: string, source: string, clip: { value: number; max?: number; magazine?: object[] } = { value: 0 }): ItemStub {
    return { id, name: id, _source: { type: 'weapon', system: { clip: { max: 0, magazine: [], ...clip } }, _stats: { compendiumSource: source } } };
}

describe('checkAndMigrateWorld — v5 empty compendium magazines (#574)', () => {
    afterEach(() => {
        F.fromUuid = undefined;
    });

    function stubCompendium(): void {
        F.fromUuid = vi.fn(async (uuid: string) => Promise.resolve({ documentName: 'Item', system: { clip: { max: CANONICAL_CLIP[uuid] ?? 0 } } }));
    }

    it('loads empty compendium weapons on world actors and unlinked tokens, logs them, and records version 5', async () => {
        stubCompendium();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const npc = makeActor(4, undefined, [leanWeapon('autogun', AUTOGUN)]);
        const mook = makeToken('mook', 4, undefined, [leanWeapon('autogun', AUTOGUN)]);
        const stub = installGame({ isGM: true, storedVersion: 4, actors: [npc], scenes: [makeScene([mook])] });

        await checkAndMigrateWorld();

        expect(npc.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [{ '_id': 'autogun', 'system.clip.value': 30 }]);
        expect(mook.actor?.updateEmbeddedDocuments).toHaveBeenCalledWith('Item', [{ '_id': 'autogun', 'system.clip.value': 30 }]);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('autogun (30)'));
        expect(stub.settings.set).toHaveBeenCalledWith('wh40k-rpg', 'world-version', 5);
    });

    it('skips a weapon whose clip size is 0 (melee)', async () => {
        stubCompendium();
        const npc = makeActor(4, undefined, [leanWeapon('sword', SWORD)]);
        installGame({ isGM: true, storedVersion: 4, actors: [npc], scenes: [] });

        await checkAndMigrateWorld();

        expect(npc.updateEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('skips an already-loaded weapon, a loaded special-ammo magazine, and a weapon with no compendium source', async () => {
        stubCompendium();
        const unlinked: ItemStub = { id: 'homebrew', name: 'homebrew', _source: { type: 'weapon', system: { clip: { value: 0, max: 12 } } } };
        const npc = makeActor(4, undefined, [
            leanWeapon('half', AUTOGUN, { value: 7 }),
            leanWeapon('special', AUTOGUN, { value: 0, magazine: [{ count: 5 }] }),
            unlinked,
        ]);
        installGame({ isGM: true, storedVersion: 4, actors: [npc], scenes: [] });

        await checkAndMigrateWorld();

        expect(npc.updateEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('leaves a linked token to its world actor', async () => {
        stubCompendium();
        const linked = makeToken('pc', 4, undefined, [leanWeapon('autogun', AUTOGUN)], true);
        installGame({ isGM: true, storedVersion: 4, actors: [], scenes: [makeScene([linked])] });

        await checkAndMigrateWorld();

        expect(linked.actor?.updateEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('applies once: a world already at version 5 is not migrated again', async () => {
        stubCompendium();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const npc = makeActor(4, undefined, [leanWeapon('autogun', AUTOGUN)]);
        const stub = installGame({ isGM: true, storedVersion: 4, actors: [npc], scenes: [] });

        await checkAndMigrateWorld();
        await checkAndMigrateWorld();

        expect(npc.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(stub.settings.set).toHaveBeenCalledTimes(1);
    });

    it('does not run the magazine step for a world that already recorded version 5', async () => {
        stubCompendium();
        const npc = makeActor(4, undefined, [leanWeapon('autogun', AUTOGUN)]);
        installGame({ isGM: true, storedVersion: 5, actors: [npc], scenes: [] });

        await checkAndMigrateWorld();

        expect(npc.updateEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('keeps going when one actor’s write fails', async () => {
        stubCompendium();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const failing = makeActor(4, undefined, [leanWeapon('autogun', AUTOGUN)]);
        failing.updateEmbeddedDocuments.mockRejectedValue(new Error('boom'));
        const next = makeActor(4, undefined, [leanWeapon('autogun', AUTOGUN)]);
        installGame({ isGM: true, storedVersion: 4, actors: [failing, next], scenes: [] });

        await checkAndMigrateWorld();

        expect(error).toHaveBeenCalled();
        expect(next.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
    });
});
