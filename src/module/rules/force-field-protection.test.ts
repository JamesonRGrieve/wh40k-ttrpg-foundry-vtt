import { describe, expect, it } from 'vitest';
import { type ForceFieldRollTerms, forceFieldOutcome, isForceFieldItem } from './force-field-protection.ts';

/**
 * The force-field protection roll (#645): 1d100 at or under the protection rating
 * nullifies the attack; inside the overload band the field overloads. RAW Common
 * craftsmanship overloads on 01–10 (the DH2 Field Overload Chance table).
 */
const commonField = (protectionRating: number): ForceFieldRollTerms => ({
    protectionRating,
    checksOverload: (roll: number) => roll >= 1 && roll <= 10,
});

describe('forceFieldOutcome', () => {
    it('protects at or under the protection rating, and not above it', () => {
        expect(forceFieldOutcome(30, commonField(30)).protected).toBe(true);
        expect(forceFieldOutcome(31, commonField(30)).protected).toBe(false);
    });

    it('overloads inside the band, even on a protecting roll', () => {
        expect(forceFieldOutcome(7, commonField(30))).toEqual({ protected: true, overload: true });
        expect(forceFieldOutcome(11, commonField(30))).toEqual({ protected: true, overload: false });
        expect(forceFieldOutcome(64, commonField(30))).toEqual({ protected: false, overload: false });
    });
});

describe('isForceFieldItem', () => {
    it('recognises a force-field item by type', () => {
        expect(isForceFieldItem({ type: 'forceField' })).toBe(true);
        expect(isForceFieldItem({ type: 'armour' })).toBe(false);
    });
});
