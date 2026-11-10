import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ARMOURY_FLAG,
    type ArmourySpawnContext,
    armouryActorData,
    armouryPileFlags,
    ensureInquisitionArmoury,
    findArmoury,
    shouldSpawnArmoury,
} from './armoury.ts';

const SYSTEM_ID = 'wh40k-rpg';

/** A context where every gate passes, so each test negates exactly one clause. */
const spawnable: ArmourySpawnContext = { ruleset: 'homebrew', isWorldWriter: true, exists: false, itemPilesActive: true };

describe('shouldSpawnArmoury (#496)', () => {
    it('spawns for the active GM in a homebrew DH2 world with Item Piles active', () => {
        expect(shouldSpawnArmoury(spawnable)).toBe(true);
    });

    it('never spawns on a client that is not the world writer — a player, or a second GM beside the active one (#713)', () => {
        expect(shouldSpawnArmoury({ ...spawnable, isWorldWriter: false })).toBe(false);
    });

    it('does not spawn a second armoury on the next boot', () => {
        expect(shouldSpawnArmoury({ ...spawnable, exists: true })).toBe(false);
    });

    it('does not spawn under the RAW ruleset — homebrew requisition is the operator gate', () => {
        expect(shouldSpawnArmoury({ ...spawnable, ruleset: 'raw' })).toBe(false);
        expect(shouldSpawnArmoury({ ...spawnable, ruleset: undefined })).toBe(false);
    });

    it('does not spawn without Item Piles — a merchant nobody can open is worse than none', () => {
        expect(shouldSpawnArmoury({ ...spawnable, itemPilesActive: false })).toBe(false);
    });
});

describe('armouryPileFlags', () => {
    it('declares an ENABLED merchant, which is what makes Item Piles open it as a shop', () => {
        expect(armouryPileFlags()).toMatchObject({ enabled: true, type: 'merchant' });
    });

    it('is purchase-only — the Inquisition supplies, it does not buy the cell’s looted junk', () => {
        expect(armouryPileFlags()).toMatchObject({ purchaseOnly: true });
    });

    it('is infinite: standard-issue kit does not run out, and scarcity is per-item', () => {
        expect(armouryPileFlags()).toMatchObject({ infiniteQuantity: true });
    });

    it('is always open, so requisition is never blocked by shop hours', () => {
        expect(armouryPileFlags()).toMatchObject({ openTimes: { enabled: false, status: 'open' } });
    });
});

describe('armouryActorData', () => {
    it('creates the pile actor type Item Piles is configured for', () => {
        // Must match ITEM_PILES ACTOR_CLASS_TYPE in integrations/item-piles.ts,
        // or Item Piles builds the merchant with a type our schema rejects.
        expect(armouryActorData('Inquisition Armoury')).toMatchObject({ type: 'loot' });
    });

    it('carries BOTH flags: our identity flag and the Item Piles merchant config', () => {
        expect(armouryActorData('Inquisition Armoury')).toMatchObject({
            flags: {
                [SYSTEM_ID]: { [ARMOURY_FLAG]: true },
                'item-piles': { data: { enabled: true, type: 'merchant' } },
            },
        });
    });

    it('uses the localized name it is handed', () => {
        expect(armouryActorData('Ordo Xenos Requisitions')).toMatchObject({ name: 'Ordo Xenos Requisitions' });
    });
});

describe('findArmoury', () => {
    const armoury = { flags: { [SYSTEM_ID]: { [ARMOURY_FLAG]: true } } };

    it('finds the armoury among ordinary actors', () => {
        expect(findArmoury([{ flags: {} }, armoury, { flags: { [SYSTEM_ID]: {} } }])).toBe(armoury);
    });

    it('matches by FLAG, so a renamed armoury is still found (and not duplicated)', () => {
        // The whole reason identity is a flag: a GM who renames it to
        // "The Quartermaster" must not get a second one on the next boot.
        const renamed = { name: 'The Quartermaster', flags: { [SYSTEM_ID]: { [ARMOURY_FLAG]: true } } };
        expect(findArmoury([renamed])).toBe(renamed);
    });

    it('does not match an actor that merely has system flags', () => {
        expect(findArmoury([{ flags: { [SYSTEM_ID]: { deathLooted: true } } }])).toBeUndefined();
    });

    it('returns undefined for an empty world', () => {
        expect(findArmoury([])).toBeUndefined();
    });
});

/** The `game` surface `ensureInquisitionArmoury` reads, for one client of a homebrew DH2 world with Item Piles on and no armoury yet. */
interface ArmouryGameStub {
    user: { isGM: boolean };
    users: { activeGM: { isSelf: boolean } | null };
    settings: { get: () => string };
    actors: FlaggedActorStub[];
    modules: { get: (id: string) => { active: boolean } | undefined };
    i18n: { localize: (key: string) => string; format: (key: string) => string };
}

interface FlaggedActorStub {
    flags: Record<string, Record<string, boolean>>;
}

describe('ensureInquisitionArmoury on a world with two GMs connected (#713)', () => {
    /** Stub one client's globals; returns the `Actor.create` spy. */
    function stubClient(opts: { isGM: boolean; isWorldWriter: boolean }): ReturnType<typeof vi.fn> {
        const create = vi.fn().mockResolvedValue({});
        const gameStub: ArmouryGameStub = {
            user: { isGM: opts.isGM },
            users: { activeGM: { isSelf: opts.isWorldWriter } },
            settings: { get: () => 'homebrew' },
            actors: [],
            modules: { get: () => ({ active: true }) },
            i18n: { localize: (key) => key, format: (key) => key },
        };
        vi.stubGlobal('game', gameStub);
        vi.stubGlobal('Actor', { create, deleteDocuments: vi.fn().mockResolvedValue([]) });
        vi.stubGlobal('ui', { notifications: { info: vi.fn(), warn: vi.fn() } });
        return create;
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('the active GM spawns the armoury', async () => {
        const create = stubClient({ isGM: true, isWorldWriter: true });
        await ensureInquisitionArmoury();
        expect(create).toHaveBeenCalledOnce();
    });

    it('a second GM who is not the active GM does not spawn one too', async () => {
        const create = stubClient({ isGM: true, isWorldWriter: false });
        await ensureInquisitionArmoury();
        expect(create).not.toHaveBeenCalled();
    });

    it('a player client does not spawn one', async () => {
        const create = stubClient({ isGM: false, isWorldWriter: false });
        await ensureInquisitionArmoury();
        expect(create).not.toHaveBeenCalled();
    });
});
