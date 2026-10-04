import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BODY_LOCATIONS } from '../data/shared/body-locations.ts';
import { buildLangStub } from '../testing/lang-stub.ts';
import {
    additionalHitLocations,
    creatureHitLocations,
    DEFAULT_HIT_LOCATION,
    getHitLocationForRoll,
    HIT_LOCATION_IDS,
    hitDropdown,
    hitLocationAbbreviation,
    hitLocationLabel,
    hitLocationNames,
    hitLocationRollRange,
    hitLocationShortLabel,
    resolveHitLocationId,
    reverseAttackRollDigits,
} from './hit-locations';

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

/** `game.i18n` over the real langpack, installed for the localized-label assertions. */
function installLangpack(): void {
    vi.stubGlobal('game', { i18n: buildLangStub(), wh40k: { log: (): void => {} } });
}

describe('creatureHitLocations() — Table 7-3 location bands', () => {
    const locations = creatureHitLocations();
    const byId = Object.fromEntries(locations.map((l) => [l.id, l]));

    it('Head covers 0-10 (reversed indexes 01-10)', () => {
        expect(byId['head']).toEqual({ id: 'head', min: 0, max: 10 });
    });
    it('Right Arm covers 11-20', () => {
        expect(byId['rightArm']).toEqual({ id: 'rightArm', min: 11, max: 20 });
    });
    it('Left Arm covers 21-30', () => {
        expect(byId['leftArm']).toEqual({ id: 'leftArm', min: 21, max: 30 });
    });
    it('Body covers 31-70', () => {
        expect(byId['body']).toEqual({ id: 'body', min: 31, max: 70 });
    });
    it('Right Leg covers 71-85', () => {
        expect(byId['rightLeg']).toEqual({ id: 'rightLeg', min: 71, max: 85 });
    });
    it('Left Leg covers 86-100', () => {
        expect(byId['leftLeg']).toEqual({ id: 'leftLeg', min: 86, max: 100 });
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

describe('single hit-location id source', () => {
    it('the hit-location registry covers exactly the shared BODY_LOCATIONS ids', () => {
        expect([...HIT_LOCATION_IDS].sort()).toEqual([...BODY_LOCATIONS].sort());
    });

    it('lists the ids in Table 7-3 (d100) order', () => {
        expect(HIT_LOCATION_IDS).toEqual(['head', 'rightArm', 'leftArm', 'body', 'rightLeg', 'leftLeg']);
    });

    it('every table that names a location uses a registered id', () => {
        const ids = new Set<string>(HIT_LOCATION_IDS);
        for (const [start, followUps] of Object.entries(additionalHitLocations())) {
            expect(ids.has(start)).toBe(true);
            for (const id of followUps) expect(ids.has(id)).toBe(true);
        }
    });
});

describe('hit-location display labels', () => {
    beforeEach(installLangpack);
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('hitLocationNames returns all six location ids in registry order', () => {
        expect(hitLocationNames()).toEqual(['head', 'rightArm', 'leftArm', 'body', 'rightLeg', 'leftLeg']);
    });

    it('hitDropdown maps each id to its localized label', () => {
        expect(hitDropdown()).toEqual({
            head: 'Head',
            rightArm: 'Right Arm',
            leftArm: 'Left Arm',
            body: 'Body',
            rightLeg: 'Right Leg',
            leftLeg: 'Left Leg',
        });
    });

    it('hitLocationLabel localizes an id and a legacy English name alike, and passes unknowns through', () => {
        expect(hitLocationLabel('rightArm')).toBe('Right Arm');
        expect(hitLocationLabel('Left Leg')).toBe('Left Leg');
        expect(hitLocationLabel('Turret')).toBe('Turret');
    });

    it('resolves short labels, abbreviations and printed roll ranges from the same registry', () => {
        expect(hitLocationShortLabel('rightArm')).toBe('R.Arm');
        expect(hitLocationAbbreviation('leftLeg')).toBe('LL');
        expect(hitLocationRollRange('head')).toBe('01-10');
        expect(hitLocationRollRange('body')).toBe('31-70');
        expect(hitLocationRollRange('leftLeg')).toBe('86-00');
    });
});

describe('resolveHitLocationId', () => {
    it('accepts ids and legacy English names, ignoring case and whitespace', () => {
        expect(resolveHitLocationId('rightArm')).toBe('rightArm');
        expect(resolveHitLocationId('Right Arm')).toBe('rightArm');
        expect(resolveHitLocationId('LEFT LEG')).toBe('leftLeg');
        expect(resolveHitLocationId('Head')).toBe('head');
    });

    it('returns undefined for unknown, empty or absent values', () => {
        expect(resolveHitLocationId('Turret')).toBeUndefined();
        expect(resolveHitLocationId('')).toBeUndefined();
        expect(resolveHitLocationId(undefined)).toBeUndefined();
        expect(resolveHitLocationId(null)).toBeUndefined();
    });

    it('the default location is a registered id', () => {
        expect(resolveHitLocationId(DEFAULT_HIT_LOCATION)).toBe(DEFAULT_HIT_LOCATION);
    });
});

describe('getHitLocationForRoll', () => {
    beforeEach(installLangpack);
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('maps the digit-reversed roll onto a location id', () => {
        expect(getHitLocationForRoll(23)).toBe('body');
        expect(getHitLocationForRoll(47)).toBe('rightLeg');
        expect(getHitLocationForRoll(100)).toBe('head');
    });
});

describe('additionalHitLocations — Table 7-2 multi-hit follow-up locations', () => {
    const followups = additionalHitLocations();

    it('exposes a six-entry array per starting location', () => {
        for (const start of HIT_LOCATION_IDS) {
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
