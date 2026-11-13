import { describe, expect, it } from 'vitest';
import { loadLinePackIndex } from './line-pack-docs.ts';
import type { IndexablePack } from './pack-index.ts';

interface Row {
    name: string;
}

/** A pack of `line` and `category` whose index holds `names`. */
function pack(line: string, category: string, names: string[], homebrew = false): IndexablePack<Row> {
    return {
        metadata: { name: `${line}-${category}`, flags: { 'wh40k-rpg': { line, category, homebrew } } },
        getIndex: async () => Promise.resolve(names.map((name) => ({ name }))),
    };
}

describe('loadLinePackIndex', () => {
    it("reads each line's book packs of exactly the category, tagged with the line, in pack order", async () => {
        const packs = [
            pack('dh2', 'skills', ['Awareness']),
            pack('dh2', 'talents', ['Ambidextrous']),
            pack('rt', 'skills', ['Navigation']),
            pack('dh2', 'skills', ['Homebrew Skill'], true),
            pack('ow', 'skills-extra', ['Other']),
        ];
        expect(await loadLinePackIndex(packs, 'skills')).toEqual([
            { line: 'dh2', entries: [{ name: 'Awareness' }] },
            { line: 'rt', entries: [{ name: 'Navigation' }] },
        ]);
    });

    it('skips a pack that declares no flags', async () => {
        const undeclared: IndexablePack<Row> = { metadata: { name: 'undeclared' }, getIndex: async () => Promise.resolve([{ name: 'x' }]) };
        expect(await loadLinePackIndex([undeclared], 'skills')).toEqual([]);
    });
});
