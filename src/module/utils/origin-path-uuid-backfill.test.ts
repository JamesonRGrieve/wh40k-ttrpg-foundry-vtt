import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
