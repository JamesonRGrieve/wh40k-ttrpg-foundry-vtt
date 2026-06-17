import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WeaponQualityMechanics } from '../data/item/weapon-quality-mechanics.ts';
import { attackerWeaponPreventsParry, calculateQualityPenetrationModifiers } from './weapon-quality-effects';
import { weaponQualityMechanicsFromRaw } from './weapon-quality-payloads.ts';

/**
 * #57 umbrella — partial mechanical coverage. The structured payloads now live on
 * the weaponQuality compendium docs (`system.mechanics`, #303), so these tests read
 * the real pack `_source` (through `weaponQualityMechanicsFromRaw`, the boot index's
 * default-merge) instead of the former in-`src/` WEAPON_QUALITY_EFFECTS registry.
 */

const PACK_DIR = resolve(__dirname, '../../packs/rogue-trader/rt-core-items-weapon-qualities/_source');
const mechanicsById = new Map<string, WeaponQualityMechanics>();
if (existsSync(PACK_DIR)) {
    for (const file of readdirSync(PACK_DIR).filter((f) => f.endsWith('.json'))) {
        const doc = JSON.parse(readFileSync(resolve(PACK_DIR, file), 'utf8')) as { system?: { identifier?: string; mechanics?: WeaponQualityMechanics } };
        const id = doc.system?.identifier;
        if (typeof id === 'string' && id !== '') mechanicsById.set(id.toLowerCase(), weaponQualityMechanicsFromRaw(doc.system?.mechanics));
    }
}

function mech(identifier: string): WeaponQualityMechanics {
    const m = mechanicsById.get(identifier);
    if (m === undefined) throw new Error(`weaponQuality pack has no doc for identifier "${identifier}"`);
    return m;
}

describe('Weapon-quality registry coverage', () => {
    it('carries mechanics for every audit-listed quality', () => {
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
            // structured payloads
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
            expect(mechanicsById.has(key), `missing quality: ${key}`).toBe(true);
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
        it(`carries ${key} as type ${expectedType}`, () => {
            expect(mech(key).type).toBe(expectedType);
        });
    }

    it('exposes a hit-effect.requiresSave on Shocking (toughness)', () => {
        const hit = mech('shocking').hitEffect;
        expect(hit.requiresSave).toBe('toughness');
        expect(hit.failEffect).toBe('stunned');
        expect(hit.stunRounds).toBe(1);
    });

    it('exposes a hit-effect.requiresSave on Concussive (toughness, variable rounds)', () => {
        const hit = mech('concussive').hitEffect;
        expect(hit.requiresSave).toBe('toughness');
        expect(hit.failEffect).toBe('stunned');
        expect(hit.stunRoundsVariable).toBe(true);
    });

    it('exposes a hit-effect.requiresSave on Snare (agility)', () => {
        const hit = mech('snare').hitEffect;
        expect(hit.requiresSave).toBe('agility');
        expect(hit.failEffect).toBe('snared');
    });
});
