import { describe, expect, it } from 'vitest';
import { isOwnQuality, qualityIconLookup, qualityPickerOptions, qualityTakesLevel, weaponQualityId } from './weapon-quality-edit.ts';

/** #745: a weapon's own qualities can be added and removed on its sheet. */
describe('weaponQualityId (#745)', () => {
    it('stores an unrated quality by its compendium id, ignoring any level', () => {
        expect(weaponQualityId('tearing', null)).toBe('tearing');
        expect(weaponQualityId('tearing', 3)).toBe('tearing');
    });

    it('stores a rated quality with its level in place of the (X)', () => {
        expect(weaponQualityId('toxic-x', 4)).toBe('toxic-4');
        expect(weaponQualityId('felling-x', 2)).toBe('felling-2');
        expect(weaponQualityId('Blast-X', 3)).toBe('Blast-3');
    });

    it('refuses a rated quality without a whole, positive level', () => {
        expect(weaponQualityId('toxic-x', null)).toBeNull();
        expect(weaponQualityId('toxic-x', 0)).toBeNull();
        expect(weaponQualityId('toxic-x', -2)).toBeNull();
        expect(weaponQualityId('toxic-x', 1.5)).toBeNull();
    });

    it('refuses an empty id', () => {
        expect(weaponQualityId('', 2)).toBeNull();
    });
});

describe('qualityTakesLevel (#745)', () => {
    it('reads the -x placeholder, in any case', () => {
        expect(qualityTakesLevel('toxic-x')).toBe(true);
        expect(qualityTakesLevel('FLAMER-X')).toBe(true);
        expect(qualityTakesLevel('tearing')).toBe(false);
        expect(qualityTakesLevel('toxic-4')).toBe(false);
    });
});

describe('qualityPickerOptions (#745)', () => {
    it('sorts by name and offers only the rated form when the compendium carries both', () => {
        const options = qualityPickerOptions([
            { identifier: 'toxic', name: 'Toxic' },
            { identifier: 'toxic-x', name: 'Toxic (X)' },
            { identifier: 'tearing', name: 'Tearing' },
            { identifier: 'balanced', name: 'Balanced' },
        ]);
        expect(options).toEqual([
            { identifier: 'balanced', name: 'Balanced', takesLevel: false },
            { identifier: 'tearing', name: 'Tearing', takesLevel: false },
            { identifier: 'toxic-x', name: 'Toxic (X)', takesLevel: true },
        ]);
    });

    it('skips entries without an id and keeps one option per id', () => {
        const options = qualityPickerOptions([
            { identifier: '', name: 'Broken' },
            { identifier: 'tearing', name: 'Tearing' },
            { identifier: 'tearing', name: 'Tearing' },
        ]);
        expect(options.map((o) => o.identifier)).toEqual(['tearing']);
    });
});

describe('isOwnQuality (#745)', () => {
    it("is true for the weapon's own quality and false for one from craftsmanship, ammunition or a mode", () => {
        const special = new Set(['toxic-4', 'balanced']);
        expect(isOwnQuality(special, 'toxic-4')).toBe(true);
        expect(isOwnQuality(special, 'reliable')).toBe(false);
    });
});

describe('qualityIconLookup', () => {
    const icon = qualityIconLookup([
        { identifier: 'toxic', name: 'Toxic', img: 'toxic.svg' },
        { identifier: 'toxic-x', name: 'Toxic (X)', img: 'toxic-x.svg' },
        { identifier: 'tearing', name: 'Tearing', img: 'tearing.svg' },
        { identifier: 'felling', name: 'Felling', img: 'felling.svg' },
        { identifier: 'blank', name: 'Blank', img: '' },
    ]);

    it("takes a rated id's art from its rated entry", () => {
        expect(icon('toxic-4')).toBe('toxic-x.svg');
    });

    it('falls back to the unrated entry when no rated one exists', () => {
        expect(icon('felling-2')).toBe('felling.svg');
    });

    it('matches an unrated id directly', () => {
        expect(icon('tearing')).toBe('tearing.svg');
    });

    it('returns no art for an id with no entry or no image', () => {
        expect(icon('unreliable')).toBe('');
        expect(icon('blank')).toBe('');
    });
});
