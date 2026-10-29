import { describe, expect, it } from 'vitest';
import {
    builderPacks,
    isLineBookPack,
    isLineOriginPack,
    lineBookPacks,
    lineCategoryPack,
    type PackMetadataLike,
    packLineFlags,
    skillReferencePack,
    uniqueByName,
} from './line-packs.ts';

/** A pack's metadata with the manifest flags. The name is arbitrary: selection reads only the flags. */
function pack(line: string, category: string, homebrew = false): PackMetadataLike {
    return { name: `pack-${line}-${category}`, flags: { 'wh40k-rpg': { line, category, homebrew } } };
}

describe('uniqueByName (#674)', () => {
    const printed = (entry: { cost: number | null }): boolean => entry.cost !== null;

    it("keeps the copy carrying the printed value over an adventure's restatement", () => {
        const restated = { name: 'Doombolt', pack: 'a', cost: null };
        const printedCopy = { name: 'Doombolt', pack: 'b', cost: 200 };
        expect(uniqueByName([restated, printedCopy], printed)).toEqual([printedCopy]);
        expect(uniqueByName([printedCopy, restated], printed)).toEqual([printedCopy]);
    });

    it('keeps the first copy when neither or both are preferred, matching names case-insensitively', () => {
        const a = { name: 'Smite', cost: null };
        const b = { name: 'smite', cost: null };
        expect(uniqueByName([a, b], printed)).toEqual([a]);
    });

    it('keeps distinct names', () => {
        expect(
            uniqueByName(
                [
                    { name: 'A', cost: 1 },
                    { name: 'B', cost: 2 },
                ],
                printed,
            ),
        ).toHaveLength(2);
    });
});

describe('packLineFlags', () => {
    it('reads the declared line, category and homebrew flag', () => {
        expect(packLineFlags(pack('dh2', 'weapons'))).toEqual({ line: 'dh2', category: 'weapons', homebrew: false });
    });

    it('returns null for a pack that declares no flags', () => {
        expect(packLineFlags({ name: 'undeclared' })).toBeNull();
        expect(packLineFlags({ name: 'empty', flags: {} })).toBeNull();
    });
});

describe('isLineBookPack (#674)', () => {
    it('selects every pack of the line and category, whatever its name', () => {
        expect(isLineBookPack(pack('bc', 'psychic-powers'), 'bc', 'psychic-powers')).toBe(true);
        expect(isLineBookPack(pack('ow', 'talents'), 'ow', 'talents')).toBe(true);
    });

    it('keeps a sub-grouped pack of the category', () => {
        expect(isLineBookPack(pack('dh2', 'talents-specializations'), 'dh2', 'talents')).toBe(true);
    });

    it('rejects other lines, other categories and homebrew packs', () => {
        expect(isLineBookPack(pack('dh1', 'psychic-powers'), 'dh2', 'psychic-powers')).toBe(false);
        expect(isLineBookPack(pack('bc', 'talents'), 'bc', 'psychic-powers')).toBe(false);
        expect(isLineBookPack(pack('dh2', 'psychic-powers', true), 'dh2', 'psychic-powers')).toBe(false);
        expect(isLineBookPack(pack('bc', 'actors-npcs'), 'bc', 'talents')).toBe(false);
        expect(isLineBookPack({ name: 'undeclared' }, 'bc', 'talents')).toBe(false);
    });
});

describe('isLineOriginPack (#681)', () => {
    it('selects every origin-path pack of the line', () => {
        expect(isLineOriginPack(pack('dh2', 'origins-elite-advances'), 'dh2')).toBe(true);
        expect(isLineOriginPack(pack('bc', 'origins-archetypes'), 'bc')).toBe(true);
    });

    it('rejects other lines, item packs and homebrew packs', () => {
        expect(isLineOriginPack(pack('dh1', 'origins-careers'), 'dh2')).toBe(false);
        expect(isLineOriginPack(pack('dh2', 'talents'), 'dh2')).toBe(false);
        expect(isLineOriginPack(pack('dh2', 'origins-backgrounds', true), 'dh2')).toBe(false);
    });
});

/** A Foundry-like pack wrapping `metadata`, with builder ranks. */
function ranked(
    name: string,
    line: string,
    category: string,
    ranks: { originBuilder?: number; startingEquipment?: number },
    homebrew = false,
): { metadata: PackMetadataLike } {
    return { metadata: { name, flags: { 'wh40k-rpg': { line, category, homebrew, ...ranks } } } };
}

describe('builderPacks', () => {
    const packs = [
        ranked('third', 'dh2', 'origins-roles', { originBuilder: 3 }),
        ranked('first', 'dh2', 'origins-homeworlds', { originBuilder: 1 }),
        ranked('gear', 'dh2', 'weapons', { startingEquipment: 1 }),
        ranked('second', 'dh2', 'origins-backgrounds', { originBuilder: 2 }),
        ranked('other-line', 'rt', 'origins-homeworlds', { originBuilder: 1 }),
        ranked('unranked', 'dh2', 'origins-homeworlds', {}),
    ];

    it("returns the line's packs for the role, in their declared order", () => {
        expect(builderPacks(packs, 'dh2', 'originBuilder').map((p) => p.metadata.name)).toEqual(['first', 'second', 'third']);
        expect(builderPacks(packs, 'dh2', 'startingEquipment').map((p) => p.metadata.name)).toEqual(['gear']);
    });

    it('returns nothing for a line that ranks no pack for the role', () => {
        expect(builderPacks(packs, 'rt', 'startingEquipment')).toEqual([]);
        expect(builderPacks([{ metadata: { name: 'undeclared' } }], 'dh2', 'originBuilder')).toEqual([]);
    });
});

describe('lineCategoryPack', () => {
    it("returns the line's first book pack of exactly the category", () => {
        const packs = [
            ranked('brew', 'dh2', 'origins-divinations', {}, true),
            ranked('sub', 'dh2', 'origins-divinations-extra', {}),
            ranked('book', 'dh2', 'origins-divinations', {}),
            ranked('later', 'dh2', 'origins-divinations', {}),
        ];
        expect(lineCategoryPack(packs, 'dh2', 'origins-divinations')?.metadata.name).toBe('book');
        expect(lineCategoryPack(packs, 'dh1', 'origins-divinations')).toBeUndefined();
    });
});

describe('lineBookPacks', () => {
    it("returns every one of the line's book packs of the category, sub-groupings included, in order", () => {
        const packs = [
            ranked('a', 'dh2', 'talents', {}),
            ranked('brew', 'dh2', 'talents', {}, true),
            ranked('b', 'dh2', 'talents-specializations', {}),
            ranked('other', 'rt', 'talents', {}),
            ranked('c', 'dh2', 'talents', {}),
        ];
        expect(lineBookPacks(packs, 'dh2', 'talents').map((p) => p.metadata.name)).toEqual(['a', 'b', 'c']);
    });
});

describe('skillReferencePack', () => {
    it('prefers DH2, then RT, then DW, ignoring other lines', () => {
        const rt = ranked('rt', 'rt', 'skills', {});
        const dw = ranked('dw', 'dw', 'skills', {});
        const dh2 = ranked('dh2', 'dh2', 'skills', {});
        const im = ranked('im', 'im', 'skills', {});
        expect(skillReferencePack([im, dw, rt, dh2])?.metadata.name).toBe('dh2');
        expect(skillReferencePack([im, dw, rt])?.metadata.name).toBe('rt');
        expect(skillReferencePack([im, dw])?.metadata.name).toBe('dw');
        expect(skillReferencePack([im])).toBeUndefined();
    });
});
