import { describe, expect, it } from 'vitest';
import { type RiderOverrides, riderFixture } from '../testing/grenade-rider-fixture.ts';
import {
    blastRating,
    type GrenadeRiderData,
    hasGrenadeRider,
    RIDER_TEST_CHARACTERISTICS,
    riderArea,
    riderHasTest,
    riderIsResolvable,
    riderRadiusMetres,
    riderTakesWeaponRoll,
} from './grenade-rider.ts';

/**
 * The grenade rider readers (#135): a rider is content on the grenade's compendium
 * document, and these read whether there is one, whether it tests, and the area it
 * covers (printed, or the weapon's own Blast rating).
 */

function rider(overrides: RiderOverrides = {}): GrenadeRiderData {
    return riderFixture({
        test: { characteristic: 'agility', modifier: 10 },
        duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
        effect: 'Blinded for a number of rounds equal to the degrees of failure.',
        ...overrides,
    });
}

describe('riderIsResolvable', () => {
    it('resolves a rider with a test or a condition, and leaves a prose-only rider to the GM (#623)', () => {
        expect(riderIsResolvable(rider())).toBe(true);
        expect(riderIsResolvable(rider({ test: { characteristic: '' }, condition: 'stunned' }))).toBe(true);
        // A smokescreen, Tears of the Emperor's strike: nothing to roll or apply.
        expect(riderIsResolvable(rider({ test: { characteristic: '' } }))).toBe(false);
    });
});

describe('riderRadiusMetres', () => {
    it('reads a radius as printed and halves a diameter', () => {
        expect(riderRadiusMetres(6, 'radius')).toBe(6);
        expect(riderRadiusMetres(6, 'diameter')).toBe(3);
    });
});

describe('hasGrenadeRider', () => {
    it('is true for an authored rider, false for null or an absent field', () => {
        expect(hasGrenadeRider({ rider: rider() })).toBe(true);
        expect(hasGrenadeRider({ rider: null })).toBe(false);
        expect(hasGrenadeRider({})).toBe(false);
    });
});

describe('riderTakesWeaponRoll', () => {
    it('sends a grenade that rolls damage through the weapon roll, and one that deals none to the dialog (#622)', () => {
        expect(riderTakesWeaponRoll({ rider: rider(), dealsDamage: true })).toBe(true);
        expect(riderTakesWeaponRoll({ rider: rider(), dealsDamage: false })).toBe(false);
        // An unknown damage line is not assumed to roll.
        expect(riderTakesWeaponRoll({ rider: rider() })).toBe(false);
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
