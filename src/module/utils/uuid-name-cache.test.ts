import { afterEach, describe, expect, it, vi } from 'vitest';
import { packMetadata } from '../testing/pack-metadata.ts';
import { uuidNameCache } from './uuid-name-cache.ts';

/**
 * The reverse name index the origin-path UUID backfill reads is scoped by each
 * pack's declared line (its manifest flags), never by a prefix of its name.
 */

/** An installed Item pack of `line` whose index holds `names`. */
function pack(name: string, line: string, names: string[], homebrew = false): object {
    return {
        metadata: { ...packMetadata(name, line, 'origins-homeworlds', homebrew), type: 'Item' },
        getIndex: async () => Promise.resolve(names.map((entryName, index) => ({ _id: `${name}${index}`, name: entryName }))),
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('uuidNameCache.findByName', () => {
    it("finds a name in its pack's declared line only, leaving homebrew packs unscoped", async () => {
        vi.stubGlobal('game', {
            packs: {
                contents: [pack('worlds-a', 'dh2', ['Hive World']), pack('rt-looking-name', 'dh1', ['Feral World']), pack('brew', 'dh2', ['Void Born'], true)],
            },
            items: [],
            actors: [],
            journal: [],
            tables: [],
        });
        await uuidNameCache.build();
        expect(uuidNameCache.findByName('dh2', 'Hive World')).toBe('Compendium.wh40k-rpg.worlds-a.Item.worlds-a0');
        expect(uuidNameCache.findByName('dh1', 'feral world')).toBe('Compendium.wh40k-rpg.rt-looking-name.Item.rt-looking-name0');
        expect(uuidNameCache.findByName('rt', 'Feral World')).toBeNull();
        expect(uuidNameCache.findByName('dh2', 'Void Born')).toBeNull();
    });
});
