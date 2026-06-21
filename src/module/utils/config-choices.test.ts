import { afterEach, describe, expect, it, vi } from 'vitest';
import { choicesFrom, choicesRecordFrom } from './config-choices.ts';

/**
 * `choicesFrom` / `choicesRecordFrom` derive UI choice lists from a CONFIG map,
 * localizing each entry's label key. `game.i18n.localize` is stubbed to upper-
 * case the trailing segment of the key so localization is observable.
 */

function stubLocalize(): void {
    vi.stubGlobal('game', {
        i18n: {
            localize: (key: string): string => {
                const tail = key.split('.').pop() ?? key;
                return `loc:${tail}`;
            },
        },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

const SAMPLE = {
    trivial: { label: 'WH40K.Difficulty.Trivial', modifier: 60 },
    challenging: { label: 'WH40K.Difficulty.Challenging', modifier: 0 },
    hellish: { label: 'WH40K.Difficulty.Hellish', modifier: -60 },
};

describe('choicesFrom', () => {
    it('builds a {value,label} list with each label localized', () => {
        stubLocalize();
        expect(choicesFrom(SAMPLE)).toEqual([
            { value: 'trivial', label: 'loc:Trivial' },
            { value: 'challenging', label: 'loc:Challenging' },
            { value: 'hellish', label: 'loc:Hellish' },
        ]);
    });

    it('preserves the CONFIG map insertion order', () => {
        stubLocalize();
        expect(choicesFrom(SAMPLE).map((c) => c.value)).toEqual(['trivial', 'challenging', 'hellish']);
    });

    it('returns an empty list for an empty map', () => {
        stubLocalize();
        expect(choicesFrom({})).toEqual([]);
    });
});

describe('choicesRecordFrom', () => {
    it('builds a value -> localized-label record for selectOptions', () => {
        stubLocalize();
        expect(choicesRecordFrom(SAMPLE)).toEqual({
            trivial: 'loc:Trivial',
            challenging: 'loc:Challenging',
            hellish: 'loc:Hellish',
        });
    });

    it('agrees with choicesFrom entry-for-entry', () => {
        stubLocalize();
        const record = choicesRecordFrom(SAMPLE);
        for (const { value, label } of choicesFrom(SAMPLE)) {
            expect(record[value]).toBe(label);
        }
    });
});
