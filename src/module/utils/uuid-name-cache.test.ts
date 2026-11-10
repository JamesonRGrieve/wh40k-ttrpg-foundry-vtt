import { afterEach, describe, expect, it, vi } from 'vitest';
import { packMetadata } from '../testing/pack-metadata.ts';
import { uuidNameCache } from './uuid-name-cache.ts';

/**
 * The reverse name index the origin-path UUID backfill reads is scoped by each
 * pack's declared line (its manifest flags), never by a prefix of its name. A
 * homebrew pack's entries carry no line, and every line reads them after its own
 * book packs (#723).
 */

/** An installed Item pack of `line` whose index holds `names`. */
function pack(name: string, line: string, names: string[], homebrew = false): object {
    return {
        metadata: { ...packMetadata(name, line, 'origins-homeworlds', homebrew), type: 'Item' },
        getIndex: async () => Promise.resolve(names.map((entryName, index) => ({ _id: `${name}${index}`, name: entryName }))),
    };
}

/** The uuid the cache gives the `index`th entry of the pack named `name`. */
function uuidOf(name: string, index = 0): string {
    return `Compendium.wh40k-rpg.${name}.Item.${name}${index}`;
}

/** Install `packs` as the world's compendiums and rebuild the cache from them. */
async function buildFrom(packs: object[]): Promise<void> {
    vi.stubGlobal('game', { packs: { contents: packs }, items: [], actors: [], journal: [], tables: [] });
    await uuidNameCache.build();
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('uuidNameCache.findByName', () => {
    it("finds a book entry in its pack's declared line only", async () => {
        await buildFrom([pack('worlds-a', 'dh2', ['Hive World']), pack('rt-looking-name', 'dh1', ['Feral World'])]);

        expect(uuidNameCache.findByName('dh2', 'Hive World')).toBe(uuidOf('worlds-a'));
        expect(uuidNameCache.findByName('dh1', 'feral world')).toBe(uuidOf('rt-looking-name'));
        expect(uuidNameCache.findByName('rt', 'Feral World')).toBeNull();
        expect(uuidNameCache.findByName('dh2', 'Feral World')).toBeNull();
    });

    it('strips a trailing specialisation when the full name has no entry', async () => {
        await buildFrom([pack('worlds-a', 'dh2', ['Hive World'])]);

        expect(uuidNameCache.findByName('dh2', 'Hive World (Desoleum)')).toBe(uuidOf('worlds-a'));
    });

    it('returns null for a name no pack holds', async () => {
        await buildFrom([pack('worlds-a', 'dh2', ['Hive World']), pack('brew', 'dh2', ['Void Born'], true)]);

        expect(uuidNameCache.findByName('dh2', 'Forge World')).toBeNull();
    });
});

describe('uuidNameCache.findByName reads homebrew packs after the line (#723)', () => {
    const lines = ['dh2', 'dh1', 'bc', 'dw', 'ow', 'rt'];

    for (const line of lines) {
        it(`finds a homebrew entry from the ${line} line`, async () => {
            await buildFrom([pack('worlds-a', 'dh2', ['Hive World']), pack('brew', 'dh2', ['Void Born'], true)]);

            expect(uuidNameCache.findByName(line, 'Void Born')).toBe(uuidOf('brew'));
        });
    }

    it('finds an entry of a pack that declares no line flags, as it does a homebrew one', async () => {
        const unflagged = {
            metadata: { id: 'wh40k-rpg.loose', name: 'loose', type: 'Item' },
            getIndex: async () => Promise.resolve([{ _id: 'loose0', name: 'Penal Colony' }]),
        };
        await buildFrom([unflagged]);

        expect(uuidNameCache.findByName('dh2', 'Penal Colony')).toBe(uuidOf('loose'));
    });

    it("gives the line's book entry over a homebrew entry of the same name", async () => {
        const book = pack('worlds-a', 'dh2', ['Hive World']);
        const brew = pack('brew', 'dh2', ['Hive World'], true);

        await buildFrom([book, brew]);
        expect(uuidNameCache.findByName('dh2', 'Hive World')).toBe(uuidOf('worlds-a'));

        // The order the packs are installed in does not decide it.
        await buildFrom([brew, book]);
        expect(uuidNameCache.findByName('dh2', 'Hive World')).toBe(uuidOf('worlds-a'));
    });

    it('gives the homebrew entry to a line whose own books do not hold the name', async () => {
        await buildFrom([pack('worlds-a', 'dh2', ['Hive World']), pack('brew', 'dh2', ['Hive World'], true)]);

        expect(uuidNameCache.findByName('rt', 'Hive World')).toBe(uuidOf('brew'));
    });

    it('strips a trailing specialisation for a homebrew entry too', async () => {
        await buildFrom([pack('brew', 'dh2', ['Void Born'], true)]);

        expect(uuidNameCache.findByName('dh2', 'Void Born (Battlefleet)')).toBe(uuidOf('brew'));
    });

    it("gives the line's stripped book match over a homebrew entry of the full name", async () => {
        await buildFrom([pack('worlds-a', 'dh2', ['Hive World']), pack('brew', 'dh2', ['Hive World (Desoleum)'], true)]);

        expect(uuidNameCache.findByName('dh2', 'Hive World (Desoleum)')).toBe(uuidOf('worlds-a'));
    });
});
