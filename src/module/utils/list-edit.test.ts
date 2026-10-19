import { describe, expect, it } from 'vitest';
import { appendTag, withoutIndex } from './list-edit.ts';

describe('appendTag', () => {
    it('appends a trimmed tag', () => {
        expect(appendTag(['cultist'], '  heretic ')).toEqual(['cultist', 'heretic']);
    });

    it('leaves the list unchanged for a blank tag or one already listed', () => {
        expect(appendTag(['cultist'], '   ')).toEqual(['cultist']);
        expect(appendTag(['cultist'], 'cultist')).toEqual(['cultist']);
    });

    it('never mutates the list it was given', () => {
        const tags = ['cultist'];
        appendTag(tags, 'heretic');
        expect(tags).toEqual(['cultist']);
    });
});

describe('withoutIndex', () => {
    it('drops the entry at the index', () => {
        expect(withoutIndex(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
    });

    it('leaves the list unchanged for an index out of range', () => {
        expect(withoutIndex(['a', 'b'], 5)).toEqual(['a', 'b']);
        expect(withoutIndex(['a', 'b'], -1)).toEqual(['a', 'b']);
    });
});
