import { describe, expect, it } from 'vitest';
import { DH2_ACQUISITION_LADDER } from '../config/game-systems/dh2-config.ts';
import { acquisitionLadderFor, SystemConfigRegistry } from '../config/game-systems/index.ts';
import { OW_ACQUISITION_LADDER } from '../config/game-systems/ow-config.ts';
import { type AcquisitionLadder, availabilityTerm, normaliseAvailability, normaliseCraftsmanship } from './acquisition-ladder.ts';

/**
 * Each line's acquisition ladder, pinned cell-for-cell to its printed table
 * (#192). The lines legitimately differ — these are the book values, verified
 * against the page images in the source-book corpus — and there is exactly one
 * copy of each, on the line's game-system config.
 */
const BOOK_LADDERS: Record<string, AcquisitionLadder | null> = {
    // DH1 Ascension Table 1-5 (p. 14). The Influence requisition test takes no
    // craftsmanship modifier (p. 16: duration, Availability, number of individuals).
    dh1: {
        availability: {
            ubiquitous: 70,
            abundant: 50,
            plentiful: 30,
            common: 20,
            average: 10,
            scarce: 0,
            rare: -10,
            veryRare: -20,
            extremelyRare: -30,
            nearUnique: -50,
            unique: -70,
        },
        craftsmanship: null,
    },
    // DH2 core Table 5-1 / Table 5-2 (p. 141).
    dh2: {
        availability: {
            ubiquitous: 'automatic',
            abundant: 30,
            plentiful: 20,
            common: 10,
            average: 0,
            scarce: -10,
            rare: -20,
            veryRare: -30,
            extremelyRare: -40,
            nearUnique: -50,
            unique: -60,
        },
        craftsmanship: { poor: 10, common: 0, good: -20, best: -30 },
    },
    // RT core Table 9-35 (p. 272).
    rt: {
        availability: {
            ubiquitous: 70,
            abundant: 50,
            plentiful: 30,
            common: 20,
            average: 10,
            scarce: 0,
            rare: -10,
            veryRare: -20,
            extremelyRare: -30,
            nearUnique: -50,
            unique: -70,
        },
        craftsmanship: { poor: 10, common: 0, good: -10, best: -30 },
    },
    // BC core Table 9-11 (p. 306).
    bc: {
        availability: {
            ubiquitous: 70,
            abundant: 50,
            plentiful: 30,
            common: 20,
            average: 10,
            scarce: 0,
            rare: -10,
            veryRare: -20,
            extremelyRare: -30,
            nearUnique: -50,
            unique: -70,
        },
        craftsmanship: { poor: 10, common: 0, good: -10, best: -20 },
    },
    // OW core Table 6-2 "Company or Less" column (p. 163) and Table 6-6 (p. 167).
    ow: {
        availability: {
            ubiquitous: 30,
            abundant: 20,
            plentiful: 10,
            common: 0,
            average: -10,
            scarce: -20,
            rare: -30,
            veryRare: -40,
            extremelyRare: -50,
            nearUnique: -60,
            unique: 'discretion',
        },
        craftsmanship: { poor: 20, common: 0, good: -30, best: -50 },
    },
    // DW spends Requisition points; IM has no availability-modified test.
    dw: null,
    im: null,
};

describe('per-line acquisition ladders match the printed tables (#192)', () => {
    it.each(Object.entries(BOOK_LADDERS))('%s', (line, expected) => {
        expect(acquisitionLadderFor(line)).toEqual(expected);
    });

    it('covers every registered line', () => {
        expect(Object.keys(BOOK_LADDERS).sort()).toEqual(SystemConfigRegistry.getIds().sort());
    });

    it('has no ladder for an unknown or missing line', () => {
        expect(acquisitionLadderFor('nope')).toBeNull();
        expect(acquisitionLadderFor(undefined)).toBeNull();
    });
});

describe('availabilityTerm', () => {
    it('resolves a printed number, Automatic and GM discretion', () => {
        expect(availabilityTerm(DH2_ACQUISITION_LADDER, 'common')).toEqual({ kind: 'modifier', value: 10 });
        expect(availabilityTerm(DH2_ACQUISITION_LADDER, 'ubiquitous')).toEqual({ kind: 'automatic' });
        expect(availabilityTerm(OW_ACQUISITION_LADDER, 'unique')).toEqual({ kind: 'discretion' });
    });
});

describe('normalisers', () => {
    it.each(['very rare', 'Very Rare', 'very-rare', 'veryRare', 'VERY_RARE'])('resolves the stored spelling %s', (raw) => {
        expect(normaliseAvailability(raw)).toBe('veryRare');
    });

    it('resolves the ship-component enum and underscore spellings', () => {
        expect(normaliseAvailability('near-unique')).toBe('nearUnique');
        expect(normaliseAvailability('extremely_rare')).toBe('extremelyRare');
    });

    it('reject ratings no ladder rates', () => {
        expect(normaliseAvailability('uncommon')).toBeNull();
        expect(normaliseAvailability('')).toBeNull();
        expect(normaliseAvailability(null)).toBeNull();
        expect(normaliseCraftsmanship('exceptional')).toBeNull();
    });

    it('resolve craftsmanship trimmed and case-insensitively', () => {
        expect(normaliseCraftsmanship('  Best  ')).toBe('best');
        expect(normaliseCraftsmanship('GOOD')).toBe('good');
        expect(normaliseCraftsmanship(undefined)).toBeNull();
    });
});
