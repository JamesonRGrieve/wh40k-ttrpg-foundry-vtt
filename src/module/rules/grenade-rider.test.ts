import { describe, expect, it } from 'vitest';
import { blastRating, type GrenadeRiderData, hasGrenadeRider, RIDER_TEST_CHARACTERISTICS, riderArea, riderHasTest } from './grenade-rider.ts';

/**
 * The grenade rider readers (#135): a rider is content on the grenade's compendium
 * document, and these read whether there is one, whether it tests, and the area it
 * covers (printed, or the weapon's own Blast rating).
 */

function rider(overrides: Partial<GrenadeRiderData> = {}): GrenadeRiderData {
    return {
        test: { characteristic: 'agility', modifier: 10 },
        area: { size: '', measure: 'radius' },
        duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
        effectRollShift: { perDegree: 0, max: 0 },
        effect: 'Blinded for a number of rounds equal to the degrees of failure.',
        ...overrides,
    };
}

describe('hasGrenadeRider', () => {
    it('is true for an authored rider, false for null or an absent field', () => {
        expect(hasGrenadeRider({ rider: rider() })).toBe(true);
        expect(hasGrenadeRider({ rider: null })).toBe(false);
        expect(hasGrenadeRider({})).toBe(false);
    });
});

describe('riderHasTest', () => {
    it('reads the test from its characteristic; a blank one is no test', () => {
        expect(riderHasTest(rider())).toBe(true);
        expect(riderHasTest(rider({ test: { characteristic: '', modifier: 0 } }))).toBe(false);
    });
});

describe('RIDER_TEST_CHARACTERISTICS', () => {
    it('offers every characteristic but Influence', () => {
        expect(RIDER_TEST_CHARACTERISTICS).toContain('toughness');
        expect(RIDER_TEST_CHARACTERISTICS).toContain('willpower');
        expect(RIDER_TEST_CHARACTERISTICS).not.toContain('influence');
        expect(RIDER_TEST_CHARACTERISTICS).toHaveLength(9);
    });
});

describe('blastRating', () => {
    it('reads the rated Blast quality among the weapon qualities', () => {
        expect(blastRating(new Set(['blast-6']))).toBe(6);
        expect(blastRating(new Set(['hallucinogenic-4', 'blast-3']))).toBe(3);
    });

    it('is null without a Blast quality or a numeric rating', () => {
        expect(blastRating(new Set(['smoke-4']))).toBeNull();
        expect(blastRating(new Set(['blast-x']))).toBeNull();
        expect(blastRating(new Set())).toBeNull();
    });
});

describe('riderArea', () => {
    it('takes the radius from the Blast quality when the rider prints no area', () => {
        expect(riderArea(rider(), new Set(['blast-6']))).toEqual({ size: '6', measure: 'radius' });
    });

    it('prefers the printed area, radius or diameter, over the Blast rating', () => {
        expect(riderArea(rider({ area: { size: '15', measure: 'radius' } }), new Set())).toEqual({ size: '15', measure: 'radius' });
        expect(riderArea(rider({ area: { size: '3d10', measure: 'diameter' } }), new Set(['blast-6']))).toEqual({ size: '3d10', measure: 'diameter' });
    });

    it('is null when neither the rider nor the weapon gives an area', () => {
        expect(riderArea(rider(), new Set(['smoke']))).toBeNull();
    });
});
