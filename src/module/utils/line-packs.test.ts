import { describe, expect, it } from 'vitest';
import { isLineBookPack, uniqueByName } from './line-packs.ts';

describe('uniqueByName (#674)', () => {
    const printed = (entry: { cost: number | null }): boolean => entry.cost !== null;

    it("keeps the copy carrying the printed value over an adventure's restatement", () => {
        const chains = { name: 'Doombolt', pack: 'bc-chains', cost: null };
        const core = { name: 'Doombolt', pack: 'bc-core', cost: 200 };
        expect(uniqueByName([chains, core], printed)).toEqual([core]);
        expect(uniqueByName([core, chains], printed)).toEqual([core]);
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

describe('isLineBookPack (#674)', () => {
    it("selects every book's pack of the line and category, not only core", () => {
        expect(isLineBookPack('bc-core-items-psychic-powers', 'bc', 'psychic-powers')).toBe(true);
        expect(isLineBookPack('bc-fate-items-psychic-powers', 'bc', 'psychic-powers')).toBe(true);
        expect(isLineBookPack('ow-hammer-items-talents', 'ow', 'talents')).toBe(true);
    });

    it('keeps a sub-grouped pack of the category', () => {
        expect(isLineBookPack('dh2-core-items-talents-specializations', 'dh2', 'talents')).toBe(true);
    });

    it('rejects other lines, other categories and homebrew packs', () => {
        expect(isLineBookPack('dh1-core-items-psychic-powers', 'dh2', 'psychic-powers')).toBe(false);
        expect(isLineBookPack('bc-core-items-talents', 'bc', 'psychic-powers')).toBe(false);
        expect(isLineBookPack('hb-dh2-items-psychic-powers', 'dh2', 'psychic-powers')).toBe(false);
        expect(isLineBookPack('bc-core-actors-npcs', 'bc', 'talents')).toBe(false);
    });
});
