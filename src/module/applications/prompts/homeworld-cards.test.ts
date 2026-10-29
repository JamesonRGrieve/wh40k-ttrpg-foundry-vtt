import { describe, expect, it } from 'vitest';
import type { HomeworldGroup, HomeworldMechanics } from '../../rules/homeworld-compendium.ts';
import { HOMEWORLD_ACCENTS, homeworldCardGroups } from './homeworld-cards.ts';

/** A home-world with the given overrides. */
function mechanics(overrides: Partial<HomeworldMechanics>): HomeworldMechanics {
    return {
        id: 'x',
        label: 'X',
        charModsPositive: [],
        charModsNegative: [],
        fateBase: 0,
        emperorsBlessingMin: 0,
        aptitudes: [],
        abilities: [],
        woundsFlat: 8,
        woundsDice: 1,
        woundsFaces: 5,
        ...overrides,
    };
}

describe('homeworldCardGroups', () => {
    it('formats each home-world and keeps the groups, in order', () => {
        const groups: HomeworldGroup[] = [
            { label: 'A', homeworlds: [mechanics({ id: 'a1', label: 'A One', fateBase: 2, emperorsBlessingMin: 7, aptitudes: ['Strength'] })] },
            { label: 'B', homeworlds: [mechanics({ id: 'b1', label: 'B One', abilities: [{ name: 'N', description: 'D' }] })] },
        ];
        const cardGroups = homeworldCardGroups(groups);
        expect(cardGroups.map((group) => group.label)).toEqual(['A', 'B']);
        expect(cardGroups.flatMap((group) => group.cards)).toMatchObject([
            { id: 'a1', label: 'A One', fateLabel: '2 (7+)', woundsLabel: '8 + 1d5', aptitudes: ['Strength'] },
            { id: 'b1', abilities: [{ name: 'N', description: 'D' }] },
        ]);
    });

    it('leaves the Fate label empty when the home-world grants no Fate, and omits an absent blessing face', () => {
        const cardGroups = homeworldCardGroups([{ label: 'A', homeworlds: [mechanics({ id: 'none' }), mechanics({ id: 'plain', fateBase: 3 })] }]);
        expect(cardGroups.flatMap((group) => group.cards.map((card) => card.fateLabel))).toEqual(['', '3']);
    });

    it('runs the accent palette on across groups and cycles it', () => {
        const many = Array.from({ length: HOMEWORLD_ACCENTS.length + 1 }, (_, index) => mechanics({ id: `h${index}` }));
        const groups = homeworldCardGroups([
            { label: 'A', homeworlds: many.slice(0, 2) },
            { label: 'B', homeworlds: many.slice(2) },
        ]);
        const accents = groups.flatMap((group) => group.cards.map((card) => card.accent));
        expect(accents.slice(0, HOMEWORLD_ACCENTS.length)).toEqual(HOMEWORLD_ACCENTS);
        expect(accents.at(-1)).toBe(HOMEWORLD_ACCENTS[0]);
    });
});
