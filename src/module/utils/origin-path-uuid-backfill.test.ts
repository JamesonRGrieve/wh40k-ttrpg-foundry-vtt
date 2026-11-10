import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packMetadata } from '../testing/pack-metadata.ts';
import { backfillOriginPathUuids } from './origin-path-uuid-backfill.ts';
import { uuidNameCache } from './uuid-name-cache.ts';

const HIVE_WORLD = 'Compendium.wh40k-rpg.dh2-origins.Item.hiveWorld000000';

/** The actor surface the backfill reads and writes. */
interface ActorStub {
    type: string;
    system: { gameSystem: string; originPath: Record<string, string | undefined> };
    update: ReturnType<typeof vi.fn>;
}

/** The slice of `game` the backfill reads. */
interface GameStub {
    users: { activeGM: { isSelf: boolean } | null };
    actors: ActorStub[];
}

/** An actor of `type` on the DH2 line with a Hive World home world stored by name only. */
function namedOrigin(type: string): ActorStub {
    return {
        type,
        system: { gameSystem: 'dh2', originPath: { homeWorld: 'Hive World', homeWorldUuid: '' } },
        update: vi.fn().mockResolvedValue({}),
    };
}

function stubGame(actors: ActorStub[], isWorldWriter = true): void {
    const gameStub: GameStub = { users: { activeGM: { isSelf: isWorldWriter } }, actors };
    vi.stubGlobal('game', gameStub);
}

describe('backfillOriginPathUuids', () => {
    beforeEach(() => {
        vi.spyOn(uuidNameCache, 'isReady').mockReturnValue(true);
        vi.spyOn(uuidNameCache, 'findByName').mockImplementation((prefix, name) => (prefix === 'dh2' && name === 'Hive World' ? HIVE_WORLD : null));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('fills the UUID slot of a line-prefixed dh2-character (#721)', async () => {
        const pc = namedOrigin('dh2-character');
        stubGame([pc]);

        await backfillOriginPathUuids();

        expect(pc.update).toHaveBeenCalledExactlyOnceWith({ 'system.originPath.homeWorldUuid': HIVE_WORLD });
    });

    it('still fills the legacy bare character type', async () => {
        const pc = namedOrigin('character');
        stubGame([pc]);

        await backfillOriginPathUuids();

        expect(pc.update).toHaveBeenCalledExactlyOnceWith({ 'system.originPath.homeWorldUuid': HIVE_WORLD });
    });

    it('skips actors that are not characters', async () => {
        const npc = namedOrigin('dh2-npc');
        stubGame([npc]);

        await backfillOriginPathUuids();

        expect(npc.update).not.toHaveBeenCalled();
    });

    it('does not overwrite a UUID that is already set', async () => {
        const pc = namedOrigin('dh2-character');
        pc.system.originPath['homeWorldUuid'] = 'Compendium.wh40k-rpg.dh2-origins.Item.alreadySet00000';
        stubGame([pc]);

        await backfillOriginPathUuids();

        expect(pc.update).not.toHaveBeenCalled();
    });

    it('attempts no update on a client that is not the world writer: a player, or a second GM (#713)', async () => {
        const pc = namedOrigin('dh2-character');
        stubGame([pc], false);

        await backfillOriginPathUuids();

        expect(pc.update).not.toHaveBeenCalled();
    });
});

/**
 * Regression (#723): a homebrew origin stored by name gets its UUID slot filled.
 *
 * The name index is the real one here, built from stub packs, so the case runs the
 * backfill and the lookup together: a homebrew pack's entries carry no line, and
 * the backfill only ever asked for the actor's line.
 */
describe('backfillOriginPathUuids against the real name index (#723)', () => {
    const BOOK_HIVE_WORLD = 'Compendium.wh40k-rpg.dh2-origins.Item.dh2-origins0';
    const BREW_VOID_BORN = 'Compendium.wh40k-rpg.brew-origins.Item.brew-origins0';
    const BREW_HIVE_WORLD = 'Compendium.wh40k-rpg.brew-origins.Item.brew-origins1';

    /** An installed origin pack of `line` whose index holds `names`. */
    function originPack(name: string, line: string, names: string[], homebrew: boolean): object {
        return {
            metadata: { ...packMetadata(name, line, 'origins-homeworlds', homebrew), type: 'Item' },
            getIndex: async () => Promise.resolve(names.map((entryName, index) => ({ _id: `${name}${index}`, name: entryName }))),
        };
    }

    /** A character of `line` whose home world is stored by `name` only. */
    function characterFrom(line: string, name: string): ActorStub {
        return {
            type: `${line}-character`,
            system: { gameSystem: line, originPath: { homeWorld: name, homeWorldUuid: '' } },
            update: vi.fn().mockResolvedValue({}),
        };
    }

    /** Install the book and homebrew origin packs beside `actors`, and build the index from them. */
    async function stubWorld(actors: ActorStub[]): Promise<void> {
        vi.stubGlobal('game', {
            users: { activeGM: { isSelf: true } },
            actors,
            items: [],
            journal: [],
            tables: [],
            packs: {
                contents: [originPack('brew-origins', 'dh2', ['Void Born', 'Hive World'], true), originPack('dh2-origins', 'dh2', ['Hive World'], false)],
            },
        });
        await uuidNameCache.build();
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    for (const line of ['dh2', 'dh1', 'bc', 'dw', 'ow', 'rt']) {
        it(`fills the UUID slot of a ${line} character's homebrew origin`, async () => {
            const pc = characterFrom(line, 'Void Born');
            await stubWorld([pc]);

            await backfillOriginPathUuids();

            expect(pc.update).toHaveBeenCalledExactlyOnceWith({ 'system.originPath.homeWorldUuid': BREW_VOID_BORN });
        });
    }

    it("fills the slot from the line's book pack when a homebrew pack holds the same name", async () => {
        const pc = characterFrom('dh2', 'Hive World');
        await stubWorld([pc]);

        await backfillOriginPathUuids();

        expect(pc.update).toHaveBeenCalledExactlyOnceWith({ 'system.originPath.homeWorldUuid': BOOK_HIVE_WORLD });
    });

    it('fills the slot from the homebrew pack for a line whose books do not hold the name', async () => {
        const pc = characterFrom('rt', 'Hive World');
        await stubWorld([pc]);

        await backfillOriginPathUuids();

        expect(pc.update).toHaveBeenCalledExactlyOnceWith({ 'system.originPath.homeWorldUuid': BREW_HIVE_WORLD });
    });

    it('leaves a name no pack holds alone', async () => {
        const pc = characterFrom('dh2', 'Forge World');
        await stubWorld([pc]);

        await backfillOriginPathUuids();

        expect(pc.update).not.toHaveBeenCalled();
    });
});
