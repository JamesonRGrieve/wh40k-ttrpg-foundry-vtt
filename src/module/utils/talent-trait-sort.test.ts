import { describe, expect, it } from 'vitest';
import { sortByDisplayName, talentTraitSortKey } from './talent-trait-sort.ts';

describe('talentTraitSortKey', () => {
    it('prefers fullName, falls back to name, and is empty when neither is a string', () => {
        expect(talentTraitSortKey({ fullName: 'Weapon Training (Shock)', name: 'Weapon Training' })).toBe('Weapon Training (Shock)');
        expect(talentTraitSortKey({ name: 'Catfall' })).toBe('Catfall');
        expect(talentTraitSortKey({ fullName: '', name: 'Dodge' })).toBe('Dodge');
        expect(talentTraitSortKey({})).toBe('');
    });
});

describe('sortByDisplayName', () => {
    it('orders alphabetically by display name, case-insensitive', () => {
        const items = [{ fullName: 'Weapon-Tech' }, { fullName: 'Catfall' }, { name: 'ambush' }, { fullName: 'rapid reload' }];
        const ordered = sortByDisplayName([...items], 'en').map((x) => talentTraitSortKey(x));
        expect(ordered).toEqual(['ambush', 'Catfall', 'rapid reload', 'Weapon-Tech']);
    });

    it('sorts in place and returns the same array reference', () => {
        const items = [{ fullName: 'Beta' }, { fullName: 'Alpha' }];
        const result = sortByDisplayName(items, 'en');
        expect(result).toBe(items);
        expect(talentTraitSortKey(items[0] ?? {})).toBe('Alpha');
    });
});
