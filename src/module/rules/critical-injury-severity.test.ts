import { describe, expect, it } from 'vitest';
import { editableSeverities } from './critical-injury-severity.ts';

describe('the severity levels an injury sheet edits (#734)', () => {
    it('lists every stored level in order, then the next one to add', () => {
        expect(editableSeverities([3, 1, 2])).toEqual([1, 2, 3, 4]);
    });

    it('offers level 1 when the injury stores none', () => {
        expect(editableSeverities([])).toEqual([1]);
    });

    it('drops duplicates and anything that is not a positive whole level', () => {
        expect(editableSeverities([2, 2, Number.NaN, 0, -1, 1.5])).toEqual([2, 3]);
    });
});
