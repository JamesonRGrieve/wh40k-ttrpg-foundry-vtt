import { describe, expect, it } from 'vitest';
import {
    attackerWeaponPreventsParry,
    calculateQualityPenetrationModifiers,
    WEAPON_QUALITY_EFFECTS,
    type WeaponQualityHitEffect,
} from './weapon-quality-effects';

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

describe('Flexible — defender cannot parry', () => {
    const flexibleWeapon = { system: { special: new Set(['flexible']) } } as Parameters<typeof attackerWeaponPreventsParry>[0];

    it('returns true when the attacker has Flexible', () => {
        expect(attackerWeaponPreventsParry(flexibleWeapon)).toBe(true);
    });

    it('returns false for a weapon without the quality', () => {
        const plain = { system: { special: new Set<string>() } } as Parameters<typeof attackerWeaponPreventsParry>[0];
        expect(attackerWeaponPreventsParry(plain)).toBe(false);
    });

    it('returns false for undefined / null', () => {
        expect(attackerWeaponPreventsParry(undefined)).toBe(false);
        expect(attackerWeaponPreventsParry(null)).toBe(false);
    });
});

describe('Lance — penetration multiplied by DoS', () => {
    const lanceWeapon = { system: { special: new Set(['lance']) } } as Parameters<typeof calculateQualityPenetrationModifiers>[0]['weapon'];

    it('emits no Lance modifier at 1 DoS (×1 = no bonus)', () => {
        const mods = calculateQualityPenetrationModifiers({ weapon: lanceWeapon, basePenetration: 4, dos: 1 });
        expect(mods['Lance']).toBeUndefined();
    });

    it('adds basePen at 2 DoS (total = ×2)', () => {
        const mods = calculateQualityPenetrationModifiers({ weapon: lanceWeapon, basePenetration: 4, dos: 2 });
        expect(mods['Lance']).toBe(4);
    });

    it('adds basePen × 2 at 3 DoS (total = ×3)', () => {
        const mods = calculateQualityPenetrationModifiers({ weapon: lanceWeapon, basePenetration: 4, dos: 3 });
        expect(mods['Lance']).toBe(8);
    });

    it('adds basePen × 4 at 5 DoS (total = ×5)', () => {
        const mods = calculateQualityPenetrationModifiers({ weapon: lanceWeapon, basePenetration: 4, dos: 5 });
        expect(mods['Lance']).toBe(16);
    });

    it('does not apply if the weapon lacks Lance', () => {
        const plain = { system: { special: new Set<string>() } } as Parameters<typeof calculateQualityPenetrationModifiers>[0]['weapon'];
        const mods = calculateQualityPenetrationModifiers({ weapon: plain, basePenetration: 4, dos: 5 });
        expect(mods['Lance']).toBeUndefined();
    });
});

describe('Phase 5 registry promotions (#57 partial)', () => {
    const expectedTypes: Record<string, string> = {
        flexible: 'parry',
        lance: 'penetration',
        shocking: 'hit-effect',
        concussive: 'hit-effect',
        snare: 'hit-effect',
        smoke: 'template',
        blast: 'template',
        indirect: 'attack',
    };

    for (const [key, expectedType] of Object.entries(expectedTypes)) {
        it(`promotes ${key} from description-only to ${expectedType}`, () => {
            const entry = WEAPON_QUALITY_EFFECTS[key as keyof typeof WEAPON_QUALITY_EFFECTS];
            expect(entry, `missing quality entry: ${key}`).toBeDefined();
            expect(entry.type).not.toBe('description-only');
            expect(entry.type).toBe(expectedType);
        });
    }

    it('exposes a hit-effect.requiresSave on Shocking (toughness)', () => {
        const entry = WEAPON_QUALITY_EFFECTS.shocking as { hitEffect: WeaponQualityHitEffect };
        expect(entry.hitEffect.requiresSave).toBe('toughness');
        expect(entry.hitEffect.failEffect).toBe('stunned');
        expect(entry.hitEffect.stunRounds).toBe(1);
    });

    it('exposes a hit-effect.requiresSave on Concussive (toughness, variable rounds)', () => {
        const entry = WEAPON_QUALITY_EFFECTS.concussive as { hitEffect: WeaponQualityHitEffect };
        expect(entry.hitEffect.requiresSave).toBe('toughness');
        expect(entry.hitEffect.failEffect).toBe('stunned');
        expect(entry.hitEffect.stunRoundsVariable).toBe(true);
    });

    it('exposes a hit-effect.requiresSave on Snare (agility)', () => {
        const entry = WEAPON_QUALITY_EFFECTS.snare as { hitEffect: WeaponQualityHitEffect };
        expect(entry.hitEffect.requiresSave).toBe('agility');
        expect(entry.hitEffect.failEffect).toBe('snared');
    });
});
