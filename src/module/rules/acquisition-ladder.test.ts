import { describe, expect, it } from 'vitest';
import { DH2_ACQUISITION_LADDER } from '../config/game-systems/dh2-config.ts';
import { acquisitionLadderFor, SystemConfigRegistry } from '../config/game-systems/index.ts';
import { OW_ACQUISITION_LADDER } from '../config/game-systems/ow-config.ts';
import { type AcquisitionLadder, availabilityTerm, normaliseAvailability, normaliseCraftsmanship, ratingAfterFailure } from './acquisition-ladder.ts';

/**
 * Each line's acquisition ladder, pinned cell-for-cell to its printed table
 * (#192). The lines legitimately differ — these are the book values, verified
 * against the page images in the source-book corpus — and there is exactly one
 * copy of each, on the line's game-system config.
 */
const BOOK_LADDERS: Record<string, AcquisitionLadder | null> = {
    // A DH1 supplement's Influence availability table. The Influence requisition test
    // takes no craftsmanship modifier (only duration, Availability, number of individuals).
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
        // Fails by four or more (full-ten) degrees → the group loses 1 Influence.
        failureLoss: { kind: 'flat', minDegrees: 4, loss: 1, counting: 'fullTens' },
    },
    // DH2's availability and craftsmanship modifier tables.
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
        // "Excessive or Reckless Use": the DoF beyond Fellowship bonus.
        failureLoss: { kind: 'beyondFellowshipBonus' },
    },
    // RT's acquisition modifiers table.
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
        // A failure only means waiting to try again.
        failureLoss: null,
    },
    // BC's acquisition modifiers table.
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
        // "If he fails, he does not" — no Infamy loss.
        failureLoss: null,
    },
    // OW's troop-difficulty table ("Company or Less" column) and craftsmanship table.
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
        // Failure only means the item could not be obtained.
        failureLoss: null,
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

describe('ratingAfterFailure (#496)', () => {
    it('loses nothing when the line prints no loss', () => {
        expect(ratingAfterFailure(null, 40, 9, 0)).toBe(40);
    });

    it('DH1 flat loss counts a degree per full 10 points: 4+ such degrees cost 1', () => {
        const dh1 = { kind: 'flat', minDegrees: 4, loss: 1, counting: 'fullTens' } as const;
        // plusOne DoF 4 is a 30–39 margin: three DH1 degrees.
        expect(ratingAfterFailure(dh1, 40, 4, 0)).toBe(40);
        // plusOne DoF 5 is a 40+ margin: four DH1 degrees.
        expect(ratingAfterFailure(dh1, 40, 5, 0)).toBe(39);
    });

    it('a plusOne flat loss uses the DoF as given', () => {
        expect(ratingAfterFailure({ kind: 'flat', minDegrees: 3, loss: 2, counting: 'plusOne' }, 40, 3, 0)).toBe(38);
    });

    it('DH2 loses the degrees beyond Fellowship bonus, and nothing within it', () => {
        const dh2 = { kind: 'beyondFellowshipBonus' } as const;
        expect(ratingAfterFailure(dh2, 40, 4, 4)).toBe(40);
        expect(ratingAfterFailure(dh2, 40, 7, 4)).toBe(37);
    });

    it('never drives the rating below 0, and a pass (0 DoF) costs nothing', () => {
        expect(ratingAfterFailure({ kind: 'beyondFellowshipBonus' }, 2, 9, 0)).toBe(0);
        expect(ratingAfterFailure({ kind: 'beyondFellowshipBonus' }, 20, 0, 0)).toBe(20);
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
