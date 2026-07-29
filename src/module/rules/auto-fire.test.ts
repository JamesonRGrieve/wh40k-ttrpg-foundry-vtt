import { describe, expect, it } from 'vitest';
import { burstModeForAction, hitsForDegrees, isBurstAction, resolveBurst } from './auto-fire';

/** A Storm Bolter: S/2/4, the canonical Storm weapon in the DH2 armoury. */
const STORM_BOLTER = { semi: 2, full: 4 };
/** An ordinary autogun-shaped profile: S/3/6. */
const AUTOGUN = { semi: 3, full: 6 };

describe('burstModeForAction', () => {
    it('maps both burst actions to their rate-of-fire entry', () => {
        expect(burstModeForAction('Semi-Auto Burst')).toBe('semi');
        expect(burstModeForAction('Full Auto Burst')).toBe('full');
    });

    it('maps BOTH Suppressing Fire actions — omitting them is #510', () => {
        // Suppressing Fire "fires a Full Auto or Semi-Auto Burst … and expends the
        // appropriate ammo", so it draws on the same RoF entry as the burst it fired.
        expect(burstModeForAction('Suppressing Fire - Semi')).toBe('semi');
        expect(burstModeForAction('Suppressing Fire - Full')).toBe('full');
    });

    it('excludes melee multi-attacks and psychic actions, which have no rate of fire', () => {
        for (const action of ['Swift Attack', 'Lightning Attack', 'Standard Attack', 'Charge', '']) {
            expect(burstModeForAction(action)).toBeNull();
            expect(isBurstAction(action)).toBe(false);
        }
    });
});

describe('hitsForDegrees', () => {
    it('semi scores the initial DoS plus one per TWO additional', () => {
        expect(hitsForDegrees('semi', 1)).toBe(1);
        expect(hitsForDegrees('semi', 2)).toBe(1);
        expect(hitsForDegrees('semi', 3)).toBe(2);
        expect(hitsForDegrees('semi', 4)).toBe(2);
        expect(hitsForDegrees('semi', 5)).toBe(3);
    });

    it('full scores one hit per degree of success', () => {
        expect(hitsForDegrees('full', 1)).toBe(1);
        expect(hitsForDegrees('full', 2)).toBe(2);
        expect(hitsForDegrees('full', 5)).toBe(5);
    });

    it('never returns less than the single hit a success always earns', () => {
        expect(hitsForDegrees('full', 0)).toBe(1);
        expect(hitsForDegrees('semi', -3)).toBe(1);
        expect(hitsForDegrees('semi', Number.NaN)).toBe(1);
    });
});

describe('resolveBurst — ammunition vs hit ceiling', () => {
    it('fires the whole burst and caps hits at the same RoF (no Storm)', () => {
        expect(resolveBurst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 6,
            maxHits: 6,
        });
        expect(resolveBurst({ action: 'Semi-Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 3,
            maxHits: 3,
        });
    });

    it('#511: Storm doubles the AMMUNITION but NOT the ceiling', () => {
        // "doubles the number of hits … and the amount of ammunition expended …
        // (up to the weapon's firing rate, as normal)". A Storm Bolter burns 8
        // rounds on full auto and still lands at most 4 hits — which is why it
        // ships with a 60-round clip.
        expect(resolveBurst({ action: 'Full Auto Burst', rateOfFire: STORM_BOLTER, storm: true, affordableShots: 60 })).toEqual({
            shotsFired: 8,
            maxHits: 4,
        });
        expect(resolveBurst({ action: 'Semi-Auto Burst', rateOfFire: STORM_BOLTER, storm: true, affordableShots: 60 })).toEqual({
            shotsFired: 4,
            maxHits: 2,
        });
    });

    it('#510: Suppressing Fire expends the burst it fired, not one round', () => {
        expect(resolveBurst({ action: 'Suppressing Fire - Full', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 6,
            maxHits: 6,
        });
        expect(resolveBurst({ action: 'Suppressing Fire - Semi', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 3,
            maxHits: 3,
        });
    });

    it('#512: a weapon that consumes no ammunition still gets its RoF ceiling', () => {
        // `affordableShots: null` = no clip to draw down. The ceiling is a property
        // of the weapon's rate of fire, not of ammunition bookkeeping.
        expect(resolveBurst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: null })).toEqual({
            shotsFired: 6,
            maxHits: 6,
        });
        expect(resolveBurst({ action: 'Semi-Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: null })).toEqual({
            shotsFired: 3,
            maxHits: 3,
        });
    });

    it('a burst cut short by the clip cannot land more hits than it fired shots', () => {
        expect(resolveBurst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 2 })).toEqual({
            shotsFired: 2,
            maxHits: 2,
        });
    });

    it('an empty clip fires nothing and scores nothing', () => {
        expect(resolveBurst({ action: 'Full Auto Burst', rateOfFire: AUTOGUN, storm: false, affordableShots: 0 })).toEqual({
            shotsFired: 0,
            maxHits: 0,
        });
    });

    it('a weapon with no entry for the mode fires nothing on it', () => {
        expect(resolveBurst({ action: 'Full Auto Burst', rateOfFire: { semi: 3, full: 0 }, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 0,
            maxHits: 0,
        });
    });

    it('a non-burst action is a single shot, unchanged', () => {
        expect(resolveBurst({ action: 'Standard Attack', rateOfFire: AUTOGUN, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 1,
            maxHits: 1,
        });
        expect(resolveBurst({ action: 'Swift Attack', rateOfFire: null, storm: false, affordableShots: null })).toEqual({
            shotsFired: 1,
            maxHits: 1,
        });
    });

    it('tolerates missing or malformed rate-of-fire data rather than throwing', () => {
        expect(resolveBurst({ action: 'Full Auto Burst', rateOfFire: undefined, storm: false, affordableShots: 30 })).toEqual({
            shotsFired: 0,
            maxHits: 0,
        });
    });
});
