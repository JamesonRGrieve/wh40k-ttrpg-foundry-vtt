import { describe, expect, it } from 'vitest';
import { additionalHitLocations, creatureHitLocations, hitDropdown, hitLocationNames, reverseAttackRollDigits } from './hit-locations';

/**
 * Hit location resolution per core.md L10372-10390 (Table 7-3, #107).
 *
 * The DH2 hit-location convention reverses the digits of the d100
 * attack roll: 23 → 32 → Body, 47 → 74 → Right Leg, etc. The integration
 * already lives in `rolls/damage-data.ts:127` (and the Called Shot
 * bypass in :123). These tests pin the canonical location bands and
 * the reversal edge cases.
 */

describe('reverseAttackRollDigits (#107)', () => {
    it('reverses two-digit rolls', () => {
        expect(reverseAttackRollDigits(23)).toBe(32);
        expect(reverseAttackRollDigits(47)).toBe(74);
        expect(reverseAttackRollDigits(85)).toBe(58);
    });

    it('passes palindromes / doubles through unchanged', () => {
        expect(reverseAttackRollDigits(33)).toBe(33);
        expect(reverseAttackRollDigits(55)).toBe(55);
        expect(reverseAttackRollDigits(77)).toBe(77);
    });

    it('reverses single-digit rolls (5 → 5)', () => {
        expect(reverseAttackRollDigits(5)).toBe(5);
        expect(reverseAttackRollDigits(9)).toBe(9);
    });

    it('treats 100 as 001 → 1 (Head)', () => {
        expect(reverseAttackRollDigits(100)).toBe(1);
    });

    it('treats non-finite or zero rolls as 0', () => {
        expect(reverseAttackRollDigits(0)).toBe(0);
        expect(reverseAttackRollDigits(Number.NaN)).toBe(0);
    });
});

describe('creatureHitLocations() — Table 7-3 location bands', () => {
    const locations = creatureHitLocations();
    const byName = Object.fromEntries(locations.map((l) => [l.name, l]));

    it('Head covers 0-10 (reversed indexes 01-10)', () => {
        expect(byName['Head']).toEqual({ name: 'Head', min: 0, max: 10 });
    });
    it('Right Arm covers 11-20', () => {
        expect(byName['Right Arm']).toEqual({ name: 'Right Arm', min: 11, max: 20 });
    });
    it('Left Arm covers 21-30', () => {
        expect(byName['Left Arm']).toEqual({ name: 'Left Arm', min: 21, max: 30 });
    });
    it('Body covers 31-70', () => {
        expect(byName['Body']).toEqual({ name: 'Body', min: 31, max: 70 });
    });
    it('Right Leg covers 71-85', () => {
        expect(byName['Right Leg']).toEqual({ name: 'Right Leg', min: 71, max: 85 });
    });
    it('Left Leg covers 86-100', () => {
        expect(byName['Left Leg']).toEqual({ name: 'Left Leg', min: 86, max: 100 });
    });

    it('contiguous bands with no overlap or gap', () => {
        const sorted = [...locations].sort((a, b) => a.min - b.min);
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const cur = sorted[i];
            expect(prev).toBeDefined();
            expect(cur).toBeDefined();
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: sorted[i] / sorted[i-1] return T | undefined
            expect(cur?.min).toBe((prev?.max ?? 0) + 1);
        }
    });
});

describe('hitDropdown / hitLocationNames helpers', () => {
    it('hitLocationNames returns all six location names in registry order', () => {
        expect(hitLocationNames()).toEqual(['Head', 'Right Arm', 'Left Arm', 'Body', 'Right Leg', 'Left Leg']);
    });

    it('hitDropdown returns a name→name map', () => {
        const dd = hitDropdown();
        expect(dd['Body']).toBe('Body');
        expect(dd['Head']).toBe('Head');
        expect(Object.keys(dd)).toHaveLength(6);
    });
});

describe('additionalHitLocations — Table 7-2 multi-hit follow-up locations', () => {
    const followups = additionalHitLocations();

    it('exposes a six-entry array per starting location', () => {
        for (const start of ['Head', 'Right Arm', 'Left Arm', 'Body', 'Right Leg', 'Left Leg']) {
            const arr = followups[start];
            expect(arr, `missing follow-up array for ${start}`).toBeDefined();
            expect(arr).toHaveLength(6);
        }
    });

    it('the first follow-up element for any starting location is the location itself', () => {
        for (const [start, arr] of Object.entries(followups)) {
            expect(arr[0], `first follow-up should match starting location ${start}`).toBe(start);
        }
    });
});
