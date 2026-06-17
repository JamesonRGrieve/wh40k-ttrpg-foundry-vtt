import { beforeAll, describe, expect, it } from 'vitest';
import { checkRighteousFury, getRighteousFuryThreshold } from './weapon-quality-effects';
import { setWeaponQualityPayloadsForTesting } from './weapon-quality-payloads.ts';

/**
 * Regression tests for the Righteous Fury threshold lookup. The threshold
 * is consumed by `damage-data.ts:_calculateDamage()` for each rolled
 * damage die, so any drift in the threshold table directly affects how
 * often a 10 on a damage die generates a critical-injury lookup.
 *
 * If this test suite goes red, do NOT update the expectations to match
 * the new behaviour — DH2 RAW pins these thresholds (Gauss=9, Vengeful=8,
 * standard=10). Fix the underlying lookup.
 *
 * `getRighteousFuryThreshold` reads the quality mechanics through the boot
 * index (#303); seed it with the RAW thresholds here. The weaponQuality pack
 * actually carrying these values is verified in `weapon-quality-effects.test.ts`.
 */
describe('Righteous Fury threshold', () => {
    beforeAll(() => {
        setWeaponQualityPayloadsForTesting({ gauss: { rfThreshold: 9 }, vengeful: { rfThreshold: 8 } });
    });

    it('defaults to 10 for an undefined weapon', () => {
        expect(getRighteousFuryThreshold(undefined)).toBe(10);
        expect(getRighteousFuryThreshold(null)).toBe(10);
    });

    it('defaults to 10 for a weapon with no special quality', () => {
        const weapon = { system: { special: new Set<string>() } };
        expect(getRighteousFuryThreshold(weapon as Parameters<typeof getRighteousFuryThreshold>[0])).toBe(10);
    });

    it('drops to 9 for a Gauss weapon', () => {
        const weapon = { system: { special: new Set(['gauss']) } };
        expect(getRighteousFuryThreshold(weapon as Parameters<typeof getRighteousFuryThreshold>[0])).toBe(9);
    });

    it('drops to 8 for a Vengeful weapon', () => {
        const weapon = { system: { special: new Set(['vengeful']) } };
        expect(getRighteousFuryThreshold(weapon as Parameters<typeof getRighteousFuryThreshold>[0])).toBe(8);
    });

    it('checkRighteousFury fires on natural 10 for a standard weapon', () => {
        const weapon = { system: { special: new Set<string>() } };
        expect(checkRighteousFury(weapon as Parameters<typeof checkRighteousFury>[0], 10)).toBe(true);
        expect(checkRighteousFury(weapon as Parameters<typeof checkRighteousFury>[0], 9)).toBe(false);
    });

    it('checkRighteousFury fires on 8+ for a Vengeful weapon', () => {
        const weapon = { system: { special: new Set(['vengeful']) } };
        expect(checkRighteousFury(weapon as Parameters<typeof checkRighteousFury>[0], 8)).toBe(true);
        expect(checkRighteousFury(weapon as Parameters<typeof checkRighteousFury>[0], 7)).toBe(false);
    });
});
