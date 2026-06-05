import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryItemIndex, resolvePack } from './compendium-query.ts';

/**
 * Coverage for the shared compendium pack-resolution helpers (#289) that #307's
 * pack-scan dedup builds on. `game.packs` is a framework global, stubbed here.
 * Pins resolvePack's get-then-find fallback order and queryItemIndex's
 * system/itemsOnly filtering, field-passing, per-pack flatten, and undefined-skip.
 */

interface IndexEntry {
    _id: string;
    name: string;
}
interface FakePack {
    metadata: { id: string; name: string; system: string; label: string };
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

function pack(opts: { id: string; name: string; systemId?: string; documentName?: string; entries?: IndexEntry[] }): FakePack {
    const entries = opts.entries ?? [];
    return {
        metadata: { id: opts.id, name: opts.name, system: opts.systemId ?? 'wh40k-rpg', label: opts.name },
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
});
