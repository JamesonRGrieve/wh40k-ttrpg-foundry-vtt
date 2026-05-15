import { describe, expect, it } from 'vitest';
import { calculateQualityPenetrationModifiers, WEAPON_QUALITY_EFFECTS } from './weapon-quality-effects';

/**
 * #57 umbrella — partial mechanical coverage. These tests pin the
 * specific qualities that have machine-readable behaviour (Inaccurate,
 * Twin-linked, Razor Sharp, Proven, plus the description-only entries
 * for the remaining 19 qualities). Per-quality follow-up issues will
 * upgrade the description-only ones with real mechanics.
 */
describe('Weapon-quality registry coverage', () => {
    it('exposes every audit-listed quality in WEAPON_QUALITY_EFFECTS', () => {
        for (const key of [
            // mechanical
            'inaccurate',
            'razor-sharp',
            'proven',
            'twin-linked',
            'storm',
            'reliable',
            'unreliable',
            'sanctified',
            'power-field',
            'overheats',
            'recharge',
            // description-only
            'blast',
            'concussive',
            'corrosive',
            'crippling',
            'flame',
            'flexible',
            'graviton',
            'hallucinogenic',
            'haywire',
            'indirect',
            'lance',
            'maximal',
            'primitive',
            'scatter',
            'shocking',
            'smoke',
            'snare',
            'spray',
            'toxic',
        ]) {
            expect(WEAPON_QUALITY_EFFECTS, `missing quality: ${key}`).toHaveProperty(key);
        }
    });
});

describe('Razor Sharp penetration doubling', () => {
    const razorWeapon = { system: { special: new Set(['razor-sharp']) } } as Parameters<typeof calculateQualityPenetrationModifiers>[0]['weapon'];

    it('does not apply at 0 or 1 DoS', () => {
        for (const dos of [0, 1]) {
            const mods = calculateQualityPenetrationModifiers({ weapon: razorWeapon, basePenetration: 5, dos });
            expect(mods['Razor Sharp']).toBeUndefined();
        }
    });

    it('doubles penetration at 2 DoS (adds basePenetration as a modifier)', () => {
        const mods = calculateQualityPenetrationModifiers({ weapon: razorWeapon, basePenetration: 5, dos: 2 });
        expect(mods['Razor Sharp']).toBe(5);
    });

    it('continues to apply at 3+ DoS', () => {
        const mods = calculateQualityPenetrationModifiers({ weapon: razorWeapon, basePenetration: 7, dos: 4 });
        expect(mods['Razor Sharp']).toBe(7);
    });

    it('does not apply if the weapon lacks Razor Sharp', () => {
        const plain = { system: { special: new Set<string>() } } as Parameters<typeof calculateQualityPenetrationModifiers>[0]['weapon'];
        const mods = calculateQualityPenetrationModifiers({ weapon: plain, basePenetration: 5, dos: 5 });
        expect(mods['Razor Sharp']).toBeUndefined();
    });
});
