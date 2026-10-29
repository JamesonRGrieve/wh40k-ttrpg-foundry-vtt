import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packMetadata } from '../testing/pack-metadata.ts';
import {
    findItemUuidByIdentifier,
    type LinkCandidate,
    pickLineEntry,
    pickUniqueLinkCandidate,
    queryItemIndex,
    recoverOwnedItemLink,
    resolvePack,
} from './compendium-query.ts';
import type { PackMetadataLike } from './line-packs.ts';

/**
 * Coverage for the shared compendium pack-resolution helpers (#289) that #307's
 * pack-scan dedup builds on. `game.packs` is a framework global, stubbed here.
 * Pins resolvePack's get-then-find fallback order and queryItemIndex's
 * system/itemsOnly filtering, field-passing, per-pack flatten, and undefined-skip.
 */

interface IndexEntry {
    _id: string;
    name: string;
    type?: string;
    uuid?: string;
    system?: { identifier?: string };
}
interface FakePack {
    metadata: { id: string; name: string; system: string; label: string; flags?: PackMetadataLike['flags'] };
    documentName: string;
    getIndex: (options: { fields: string[] }) => Promise<IndexEntry[]>;
}
interface PacksStub {
    get: (id: string) => FakePack | undefined;
    find: (predicate: (pack: FakePack) => boolean) => FakePack | undefined;
    filter: (predicate: (pack: FakePack) => boolean) => FakePack[];
}
interface GameStub {
    packs: PacksStub;
}
interface GlobalShim {
    game?: GameStub | undefined;
}

const G = globalThis as GlobalShim;
const ORIGINAL_GAME = G.game;

function pack(opts: { id: string; name: string; line?: string; systemId?: string; documentName?: string; entries?: IndexEntry[] }): FakePack {
    const entries = opts.entries ?? [];
    const flags = opts.line === undefined ? {} : { flags: packMetadata(opts.name, opts.line, 'talents').flags };
    return {
        metadata: { id: opts.id, name: opts.name, system: opts.systemId ?? 'wh40k-rpg', label: opts.name, ...flags },
        documentName: opts.documentName ?? 'Item',
        getIndex: vi.fn().mockResolvedValue(entries),
    };
}

/** Install a list of packs backed by a simple array, mirroring game.packs' get/find/filter. */
function setPacks(packs: FakePack[]): void {
    G.game = {
        packs: {
            get: (id) => packs.find((p) => p.metadata.id === id),
            find: (predicate) => packs.find(predicate),
            filter: (predicate) => packs.filter(predicate),
        },
    };
}

afterEach(() => {
    G.game = ORIGINAL_GAME;
});

describe('resolvePack', () => {
    beforeEach(() => {
        setPacks([pack({ id: 'wh40k-rpg.dh2-core', name: 'dh2-core' }), pack({ id: 'wh40k-rpg.dh2-talents', name: 'dh2-talents' })]);
    });

    it('resolves by the fully-qualified id first', () => {
        expect(resolvePack('dh2-core')?.metadata.id).toBe('wh40k-rpg.dh2-core');
    });

    it('falls back to a metadata.name match when the qualified id misses', () => {
        // 'dh2-talents' is not literally an id key here unless qualified — name match carries it
        setPacks([pack({ id: 'world.custom-pack', name: 'dh2-talents' })]);
        expect(resolvePack('dh2-talents')?.metadata.id).toBe('world.custom-pack');
    });

    it('falls back to a metadata.id === wh40k-rpg.<name> match', () => {
        setPacks([pack({ id: 'wh40k-rpg.dh2-core', name: 'Core Rulebook' })]);
        expect(resolvePack('dh2-core')?.metadata.id).toBe('wh40k-rpg.dh2-core');
    });

    it('returns undefined when nothing matches', () => {
        expect(resolvePack('does-not-exist')).toBeUndefined();
    });
});

describe('queryItemIndex', () => {
    it('collects across system packs, passing fields and flattening per-pack results', async () => {
        const corePack = pack({ id: 'wh40k-rpg.dh2-core', name: 'core', entries: [{ _id: 'a', name: 'Dodge' }] });
        const talentPack = pack({
            id: 'wh40k-rpg.dh2-talents',
            name: 'talents',
            entries: [
                { _id: 'b', name: 'Hardy' },
                { _id: 'c', name: 'Catfall' },
            ],
        });
        setPacks([corePack, talentPack]);

        const names = await queryItemIndex(['name'], (entry) => (entry as IndexEntry).name);

        expect(names).toEqual(['Dodge', 'Hardy', 'Catfall']);
        expect(corePack.getIndex).toHaveBeenCalledWith({ fields: ['name'] });
    });

    it('skips entries where collect returns undefined', async () => {
        setPacks([
            pack({
                id: 'wh40k-rpg.x',
                name: 'x',
                entries: [
                    { _id: 'a', name: 'keep' },
                    { _id: 'b', name: 'drop' },
                ],
            }),
        ]);

        const kept = await queryItemIndex(['name'], (entry) => {
            const name = (entry as IndexEntry).name;
            return name === 'drop' ? undefined : name;
        });

        expect(kept).toEqual(['keep']);
    });

    it('excludes packs from other systems', async () => {
        setPacks([
            pack({ id: 'wh40k-rpg.mine', name: 'mine', entries: [{ _id: 'a', name: 'mine-entry' }] }),
            pack({ id: 'dnd5e.theirs', name: 'theirs', systemId: 'dnd5e', entries: [{ _id: 'z', name: 'their-entry' }] }),
        ]);

        const names = await queryItemIndex(['name'], (entry) => (entry as IndexEntry).name);

        expect(names).toEqual(['mine-entry']);
    });

    it('itemsOnly restricts to Item-document packs', async () => {
        setPacks([
            pack({ id: 'wh40k-rpg.items', name: 'items', documentName: 'Item', entries: [{ _id: 'a', name: 'an-item' }] }),
            pack({ id: 'wh40k-rpg.actors', name: 'actors', documentName: 'Actor', entries: [{ _id: 'b', name: 'an-actor' }] }),
        ]);

        const all = await queryItemIndex(['name'], (entry) => (entry as IndexEntry).name, false);
        const itemsOnly = await queryItemIndex(['name'], (entry) => (entry as IndexEntry).name, true);

        expect(all.sort()).toEqual(['an-actor', 'an-item']);
        expect(itemsOnly).toEqual(['an-item']);
    });

    it('packFilter restricts to the packs it accepts and leaves the rest unloaded', async () => {
        const kept = pack({ id: 'wh40k-rpg.dh2-x', name: 'dh2-x', entries: [{ _id: 'a', name: 'kept' }] });
        const skipped = pack({ id: 'wh40k-rpg.rt-x', name: 'rt-x', entries: [{ _id: 'b', name: 'skipped' }] });
        setPacks([kept, skipped]);

        const names = await queryItemIndex(
            ['name'],
            (entry) => (entry as IndexEntry).name,
            true,
            (metadata) => metadata.id === 'wh40k-rpg.dh2-x',
        );

        expect(names).toEqual(['kept']);
        expect(skipped.getIndex).not.toHaveBeenCalled();
    });
});

describe('pickLineEntry', () => {
    const dh1 = { uuid: 'Compendium.wh40k-rpg.dh1-talents.Item.a', pack: packMetadata('dh1-talents', 'dh1', 'talents') };
    const dh2 = { uuid: 'Compendium.wh40k-rpg.dh2-talents.Item.b', pack: packMetadata('dh2-talents', 'dh2', 'talents') };

    it("prefers the entry from the given line's packs", () => {
        expect(pickLineEntry([dh1, dh2], 'dh2')).toBe(dh2);
    });

    it("reads the line from the pack's flags, not its name", () => {
        const named = { uuid: 'x', pack: packMetadata('dh2-misc', 'dh1', 'gear') };
        expect(pickLineEntry([named, dh2], 'dh2')).toBe(dh2);
    });

    it("prefers a book pack over the line's homebrew pack", () => {
        const brew = { uuid: 'y', pack: packMetadata('brew', 'dh2', 'talents', true) };
        expect(pickLineEntry([brew, dh2], 'dh2')).toBe(dh2);
    });

    it('falls back to the first match from any line, and to null when there is none', () => {
        expect(pickLineEntry([dh1], 'rt')).toBe(dh1);
        expect(pickLineEntry([], 'dh2')).toBeNull();
    });
});

describe('findItemUuidByIdentifier', () => {
    it('finds the Item of the right type and identifier, on the requested line', async () => {
        setPacks([
            pack({
                id: 'wh40k-rpg.dh1-talents',
                name: 'dh1-talents',
                line: 'dh1',
                entries: [{ _id: 'a', name: 'Hatred', type: 'talent', uuid: 'Compendium.dh1.a', system: { identifier: 'hatred' } }],
            }),
            pack({
                id: 'wh40k-rpg.dh2-talents',
                name: 'dh2-talents',
                line: 'dh2',
                entries: [
                    { _id: 'b', name: 'Hatred', type: 'trait', uuid: 'Compendium.dh2.trait', system: { identifier: 'hatred' } },
                    { _id: 'c', name: 'Renamed Hatred', type: 'talent', uuid: 'Compendium.dh2.c', system: { identifier: 'hatred' } },
                ],
            }),
        ]);
        expect(await findItemUuidByIdentifier('talent', 'hatred', 'dh2')).toBe('Compendium.dh2.c');
    });

    it("searches only the requested line's packs when they hold the Item, never loading another line's index", async () => {
        const dh1Pack = pack({
            id: 'wh40k-rpg.dh1-talents',
            name: 'dh1-talents',
            line: 'dh1',
            entries: [{ _id: 'a', name: 'Hatred', type: 'talent', uuid: 'Compendium.dh1.a', system: { identifier: 'hatred' } }],
        });
        const dh2Pack = pack({
            id: 'wh40k-rpg.dh2-talents',
            name: 'dh2-talents',
            line: 'dh2',
            entries: [{ _id: 'b', name: 'Hatred', type: 'talent', uuid: 'Compendium.dh2.b', system: { identifier: 'hatred' } }],
        });
        setPacks([dh1Pack, dh2Pack]);
        expect(await findItemUuidByIdentifier('talent', 'hatred', 'dh2')).toBe('Compendium.dh2.b');
        expect(dh1Pack.getIndex).not.toHaveBeenCalled();
    });

    it("falls back to any line's packs when the requested line has no match", async () => {
        setPacks([
            pack({
                id: 'wh40k-rpg.dh1-talents',
                name: 'dh1-talents',
                line: 'dh1',
                entries: [{ _id: 'a', name: 'Hatred', type: 'talent', uuid: 'Compendium.dh1.a', system: { identifier: 'hatred' } }],
            }),
            pack({ id: 'wh40k-rpg.dh2-talents', name: 'dh2-talents', line: 'dh2' }),
        ]);
        expect(await findItemUuidByIdentifier('talent', 'hatred', 'dh2')).toBe('Compendium.dh1.a');
    });

    it('returns null when no Item carries the identifier', async () => {
        setPacks([pack({ id: 'wh40k-rpg.dh2-x', name: 'x', entries: [{ _id: 'a', name: 'Hatred', type: 'talent', uuid: 'u' }] })]);
        expect(await findItemUuidByIdentifier('talent', 'hatred', 'dh2')).toBeNull();
    });
});

/**
 * #484: an owned item stored with no compendium link is matched to its canonical
 * deterministically — on the owner's line only, by identifier (else exact name),
 * and only when exactly one candidate matches. A wrong link would graft another
 * document's body onto the item, so every non-unique case returns null.
 */
describe('pickUniqueLinkCandidate', () => {
    const candidate = (from: PackMetadataLike, uuid: string, name: string, identifier: string, type = 'talent'): LinkCandidate => ({
        uuid,
        pack: from,
        type,
        name,
        identifier,
    });
    const DH2_TALENTS = packMetadata('dh2-talents', 'dh2', 'talents');
    const DH2_MORE_TALENTS = packMetadata('dh2-more-talents', 'dh2', 'talents');
    const dh2 = candidate(DH2_TALENTS, 'Compendium.dh2.sc', 'Superior Chirurgeon', 'superiorChirurgeon');
    const dh1 = candidate(packMetadata('dh1-talents', 'dh1', 'talents'), 'Compendium.dh1.sc', 'Superior Chirurgeon', 'superiorChirurgeon');
    const query = { type: 'talent', identifier: 'superiorChirurgeon', name: 'Superior Chirurgeon', linePrefix: 'dh2' };

    it("matches by identifier on the owner's line, ignoring the same talent on another line", () => {
        expect(pickUniqueLinkCandidate([dh1, dh2], query)).toBe('Compendium.dh2.sc');
    });

    it("includes the owner line's homebrew packs", () => {
        const hb = candidate(packMetadata('dh2-homebrew-talents', 'dh2', 'talents', true), 'Compendium.hb.sc', 'Superior Chirurgeon', 'superiorChirurgeon');
        expect(pickUniqueLinkCandidate([dh1, hb], query)).toBe('Compendium.hb.sc');
    });

    it('returns null when two candidates on the line share the identifier', () => {
        const dup = candidate(DH2_MORE_TALENTS, 'Compendium.dh2.dup', 'Superior Chirurgeon', 'superiorChirurgeon');
        expect(pickUniqueLinkCandidate([dh2, dup], query)).toBeNull();
    });

    it('returns null when only another line holds the item', () => {
        expect(pickUniqueLinkCandidate([dh1], query)).toBeNull();
    });

    it('never matches a candidate of another item type', () => {
        expect(pickUniqueLinkCandidate([{ ...dh2, type: 'trait' }], query)).toBeNull();
    });

    it('falls back to an exact name match only when the item has no identifier', () => {
        const renamed = candidate(DH2_TALENTS, 'Compendium.dh2.other', 'Superior Chirurgeon', 'somethingElse');
        expect(pickUniqueLinkCandidate([renamed], { ...query, identifier: '' })).toBe('Compendium.dh2.other');
        // With an identifier, a same-named candidate under another identifier is not a match.
        expect(pickUniqueLinkCandidate([renamed], query)).toBeNull();
    });

    it('returns null for an exact name shared by two candidates, and for no identifier and no name', () => {
        const twin = candidate(DH2_MORE_TALENTS, 'Compendium.dh2.twin', 'Superior Chirurgeon', 'x');
        expect(pickUniqueLinkCandidate([dh2, twin], { ...query, identifier: '' })).toBeNull();
        expect(pickUniqueLinkCandidate([dh2], { ...query, identifier: '', name: '' })).toBeNull();
    });
});

describe('recoverOwnedItemLink', () => {
    it("loads only the owner line's (and its homebrew) indexes and returns the unique match", async () => {
        const dh1Pack = pack({
            id: 'wh40k-rpg.dh1-talents',
            name: 'dh1-talents',
            line: 'dh1',
            entries: [{ _id: 'a', name: 'Superior Chirurgeon', type: 'talent', uuid: 'Compendium.dh1.a', system: { identifier: 'superiorChirurgeon' } }],
        });
        const dh2Pack = pack({
            id: 'wh40k-rpg.dh2-talents',
            name: 'dh2-talents',
            line: 'dh2',
            entries: [{ _id: 'b', name: 'Superior Chirurgeon', type: 'talent', uuid: 'Compendium.dh2.b', system: { identifier: 'superiorChirurgeon' } }],
        });
        setPacks([dh1Pack, dh2Pack]);
        await expect(recoverOwnedItemLink({ type: 'talent', identifier: 'superiorChirurgeon', name: 'Superior Chirurgeon', linePrefix: 'dh2' })).resolves.toBe(
            'Compendium.dh2.b',
        );
        expect(dh1Pack.getIndex).not.toHaveBeenCalled();
        expect(dh2Pack.getIndex).toHaveBeenCalledWith({ fields: ['system.identifier'] });
    });
});
