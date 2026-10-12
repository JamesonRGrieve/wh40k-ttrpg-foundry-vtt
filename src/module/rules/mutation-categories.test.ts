import { describe, expect, it } from 'vitest';
import { GIFT_MUTATION_CATEGORY } from './bc-gifts.ts';
import { MUTATION_CATEGORIES } from './mutation-categories.ts';

describe('MUTATION_CATEGORIES', () => {
    it('keeps the Dark Heresy categories so existing mutations stay valid', () => {
        expect(MUTATION_CATEGORIES).toEqual(expect.arrayContaining(['minor', 'major', 'malignancy']));
    });

    it('includes the Gift of the Gods category (#180)', () => {
        expect(MUTATION_CATEGORIES).toContain(GIFT_MUTATION_CATEGORY);
    });

    it('lists each category once', () => {
        expect(new Set(MUTATION_CATEGORIES).size).toBe(MUTATION_CATEGORIES.length);
    });
});
