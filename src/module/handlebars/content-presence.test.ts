import { describe, expect, it } from 'vitest';
import {
    hasDisplayedModifiers,
    hasDisplayedModifiersHelper,
    hasNonZeroHelper,
    hasNonZeroModifier,
    hasTextHelper,
    hasValueHelper,
    htmlHasText,
} from './content-presence.ts';

describe('hasValueHelper (#699)', () => {
    it('a number, zero included, or a non-empty string is a value', () => {
        expect([0, 27, -3, 13.5, '4', '1d10'].map(hasValueHelper)).toEqual([true, true, true, true, true, true]);
    });

    it('null, undefined, NaN, an empty string or an object is not, so the template prints "—"', () => {
        expect([null, undefined, Number.NaN, '', '  ', {}].map(hasValueHelper)).toEqual([false, false, false, false, false, false]);
    });
});

/**
 * #597: a read-only item sheet hides a section with nothing in it. These are the
 * emptiness tests its templates use.
 */

describe('htmlHasText', () => {
    it('treats an untouched rich-text field as empty', () => {
        const nbsp = String.fromCharCode(0xa0);
        const empties = ['', '   ', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>', `<p>${nbsp}</p>`, '<div><p> </p></div>'];
        expect(empties.filter((empty) => htmlHasText(empty))).toEqual([]);
    });

    it('finds visible text, however it is wrapped', () => {
        expect(htmlHasText('<p>Grows a third arm.</p>')).toBe(true);
        expect(htmlHasText('<p><strong>−10</strong> Fellowship</p>')).toBe(true);
        expect(htmlHasText('Plain notes')).toBe(true);
    });
});

describe('hasNonZeroModifier', () => {
    it('is false for a missing group, an empty one, or one of zeros', () => {
        expect(hasNonZeroModifier(undefined)).toBe(false);
        expect(hasNonZeroModifier({})).toBe(false);
        expect(hasNonZeroModifier({ strength: 0, toughness: 0 })).toBe(false);
    });

    it('is true when any modifier is non-zero, positive or negative', () => {
        expect(hasNonZeroModifier({ strength: 0, toughness: 5 })).toBe(true);
        expect(hasNonZeroModifier({ fellowship: -10 })).toBe(true);
    });
});

describe('hasDisplayedModifiers', () => {
    const zeros = { characteristics: { strength: 0 }, skills: {}, combat: { attack: 0, damage: 0 }, resources: { wounds: 0, fate: 0 }, otherCount: 0 };

    it('is false when every group the panel shows is empty or zero', () => {
        expect(hasDisplayedModifiers(undefined)).toBe(false);
        expect(hasDisplayedModifiers(zeros)).toBe(false);
    });

    it('is true for one non-zero modifier in any group, or any free-form one', () => {
        expect(hasDisplayedModifiers({ ...zeros, skills: { dodge: 10 } })).toBe(true);
        expect(hasDisplayedModifiers({ ...zeros, resources: { wounds: 2, fate: 0 } })).toBe(true);
        expect(hasDisplayedModifiers({ ...zeros, otherCount: 1 })).toBe(true);
    });
});

describe('the template helpers narrow what a template passes', () => {
    it('hasText: only a string with visible text', () => {
        expect(hasTextHelper('<p>x</p>')).toBe(true);
        expect([undefined, null, 3, {}, '<p></p>'].map(hasTextHelper)).toEqual([false, false, false, false, false]);
    });

    it('hasNonZero: reads only the numeric entries of an object', () => {
        expect(hasNonZeroHelper({ strength: 0, note: 'x' })).toBe(false);
        expect(hasNonZeroHelper({ strength: 5 })).toBe(true);
        expect([undefined, null, [5], 'x'].map(hasNonZeroHelper)).toEqual([false, false, false, false]);
    });

    it('hasDisplayedModifiers: an item modifiers object as the DataModel stores it', () => {
        const stored = {
            characteristics: { strength: 0 },
            skills: {},
            combat: { attack: 0 },
            resources: { wounds: 0 },
            other: [],
            situational: { combat: [] },
        };
        expect(hasDisplayedModifiersHelper(stored)).toBe(false);
        expect(hasDisplayedModifiersHelper({ ...stored, other: [{ key: 'x', label: 'X', value: 1, mode: 'add' }] })).toBe(true);
        expect(hasDisplayedModifiersHelper({ ...stored, combat: { attack: 10 } })).toBe(true);
        expect(hasDisplayedModifiersHelper(undefined)).toBe(false);
    });
});
