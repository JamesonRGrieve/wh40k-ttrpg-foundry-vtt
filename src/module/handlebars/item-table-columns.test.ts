import { describe, expect, it } from 'vitest';
import { itemTableColumns, itemTableColumnsHelper } from './item-table-columns';

describe('itemTableColumns (#662)', () => {
    it('gives each header a flexible track sized by its weight', () => {
        expect(itemTableColumns([{ weight: 2 }, {}, { weight: 1 }], false)).toBe('minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)');
    });

    it('adds a content-sized track for the add button', () => {
        expect(itemTableColumns([{ weight: 2 }, {}], true)).toBe('minmax(0, 2fr) minmax(0, 1fr) max-content');
    });

    it('sizes a fit column to its content', () => {
        expect(itemTableColumns([{}, { fit: true }], false)).toBe('minmax(0, 1fr) max-content');
    });

    it('falls back to a weight of 1 for a zero, negative or non-finite weight', () => {
        expect(itemTableColumns([{ weight: 0 }, { weight: -1 }, { weight: Number.NaN }], false)).toBe('minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)');
    });

    it('is empty with no headers and no add button', () => {
        expect(itemTableColumns([], false)).toBe('');
    });
});

describe('itemTableColumnsHelper', () => {
    it('reads the template header list and any non-empty addAction', () => {
        expect(itemTableColumnsHelper([{ weight: 2 }, { label: 'Class' }], 'itemCreate')).toBe('minmax(0, 2fr) minmax(0, 1fr) max-content');
    });

    it('treats a missing addAction and a non-array header list as absent', () => {
        expect(itemTableColumnsHelper([{}], undefined)).toBe('minmax(0, 1fr)');
        expect(itemTableColumnsHelper(undefined, '')).toBe('');
        expect(itemTableColumnsHelper([null, 'x', {}], false)).toBe('minmax(0, 1fr)');
    });
});
