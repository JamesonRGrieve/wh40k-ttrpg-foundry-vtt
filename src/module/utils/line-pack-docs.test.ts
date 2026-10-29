import { describe, expect, it } from 'vitest';
import { type LoadablePack, loadLinePackDocs } from './line-pack-docs.ts';

/** A pack of `line` and `category` holding `docs`. */
function pack(line: string, category: string, docs: string[], homebrew = false): LoadablePack<string> {
    return {
        metadata: { name: `${line}-${category}`, flags: { 'wh40k-rpg': { line, category, homebrew } } },
        getDocuments: async () => Promise.resolve(docs),
    };
}

describe('loadLinePackDocs', () => {
    it("loads each line's book packs of exactly the category, tagged with the line, in pack order", async () => {
        const packs = [
            pack('dh2', 'skills', ['Awareness']),
            pack('dh2', 'talents', ['Ambidextrous']),
            pack('rt', 'skills', ['Navigation']),
            pack('dh2', 'skills', ['Homebrew Skill'], true),
            pack('ow', 'skills-extra', ['Other']),
        ];
        expect(await loadLinePackDocs(packs, 'skills')).toEqual([
            { line: 'dh2', docs: ['Awareness'] },
            { line: 'rt', docs: ['Navigation'] },
        ]);
    });

    it('skips a pack that declares no flags or cannot load documents', async () => {
        const packs: Array<LoadablePack<string>> = [
            { metadata: { name: 'undeclared' }, getDocuments: async () => Promise.resolve(['x']) },
            { ...pack('dh2', 'skills', []), getDocuments: undefined },
        ];
        expect(await loadLinePackDocs(packs, 'skills')).toEqual([]);
    });
});
