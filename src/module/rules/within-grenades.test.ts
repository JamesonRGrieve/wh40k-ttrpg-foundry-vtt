import { describe, expect, it } from 'vitest';
import { WITHIN_GRENADES, getWithinGrenade, listWithinGrenades } from './within-grenades';

/**
 * Within-supplement grenade registry tests (#135).
 *
 * Pins the four canonical grenade-definition shapes and the accessor
 * behavior so the throw-dialog and chat card stay consistent with the
 * source supplement.
 */
describe('WITHIN_GRENADES (#135)', () => {
    it('exposes the four canonical entries', () => {
        expect(Object.keys(WITHIN_GRENADES).sort()).toEqual(
            ['photonFlash', 'psychotroke', 'smoke', 'tearsOfTheEmperor'].sort(),
        );
    });

    it('photon flash uses Agility +10 with no damage and a Blast (6) cloud', () => {
        const g = WITHIN_GRENADES.photonFlash!;
        expect(g.blastRadius).toBe(6);
        expect(g.damage).toBe('');
        expect(g.specialQualities).toContain('Blast (6)');
        expect(g.save.characteristic).toBe('agility');
        expect(g.save.difficulty).toBe(10);
    });

    it('psychotroke uses Toughness Ordinary with Hallucinogenic (4) step-up rider', () => {
        const g = WITHIN_GRENADES.psychotroke!;
        expect(g.blastRadius).toBe(3);
        expect(g.specialQualities).toContain('Hallucinogenic (4)');
        expect(g.save.characteristic).toBe('toughness');
        expect(g.save.difficulty).toBe(0);
        expect(g.failEffect).toMatch(/degree of failure/i);
    });

    it('tears-of-the-emperor uses Willpower Hard (-20) and is Sanctified', () => {
        const g = WITHIN_GRENADES.tearsOfTheEmperor!;
        expect(g.blastRadius).toBe(2);
        expect(g.damage).toBe('1d10 X');
        expect(g.specialQualities).toContain('Sanctified');
        expect(g.save.characteristic).toBe('willpower');
        expect(g.save.difficulty).toBe(-20);
        expect(g.failEffect).toMatch(/Perils of the Warp/i);
    });

    it('smoke is Smoke (4) with no damage', () => {
        const g = WITHIN_GRENADES.smoke!;
        expect(g.blastRadius).toBe(4);
        expect(g.damage).toBe('');
        expect(g.specialQualities).toEqual(['Smoke (4)']);
    });

    it('each entry carries a distinct accent class', () => {
        const accents = Object.values(WITHIN_GRENADES).map((g) => g.accentClass);
        expect(new Set(accents).size).toBe(accents.length);
    });
});

describe('getWithinGrenade', () => {
    it('returns the registry entry for a known id', () => {
        expect(getWithinGrenade('smoke')).toBe(WITHIN_GRENADES.smoke);
    });

    it('returns null for an unknown id (no throw)', () => {
        expect(getWithinGrenade('frag-but-typoed')).toBeNull();
    });
});

describe('listWithinGrenades', () => {
    it('returns the same four entries in object-insertion order', () => {
        const ids = listWithinGrenades().map((g) => g.id);
        expect(ids).toEqual(['photonFlash', 'psychotroke', 'tearsOfTheEmperor', 'smoke']);
    });
});
