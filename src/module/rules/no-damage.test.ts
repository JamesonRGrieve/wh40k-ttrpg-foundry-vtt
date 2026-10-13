import { describe, expect, it } from 'vitest';
import { normalizeNoDamageNotation, profileDealsDamage } from './no-damage.ts';

/** A weapon's raw `_migrateData` source as packs and old worlds store it. */
function source(damage: object): { damage: object } {
    return { damage };
}

describe('normalizeNoDamageNotation (#601)', () => {
    it.each(['-', '–', '—', ' - '])('rewrites a flat %j formula to the explicit no-damage profile', (dash) => {
        const src = source({ formula: dash, type: 'impact', bonus: 0, penetration: 0 });
        normalizeNoDamageNotation(src);
        expect(src.damage).toEqual({ formula: '', type: 'impact', bonus: 0, penetration: 0, none: true });
    });

    it('rewrites every per-line variant branch, leaving branches with real dice alone', () => {
        const src = source({
            dh2: { formula: '-', type: 'impact', bonus: 0, penetration: 0 },
            rt: { formula: '—', type: 'impact', bonus: 0, penetration: 0 },
            dh1: { formula: '2d10', type: 'explosive', bonus: 0, penetration: 0 },
        });
        normalizeNoDamageNotation(src);
        expect(src.damage).toEqual({
            dh2: { formula: '', type: 'impact', bonus: 0, penetration: 0, none: true },
            rt: { formula: '', type: 'impact', bonus: 0, penetration: 0, none: true },
            dh1: { formula: '2d10', type: 'explosive', bonus: 0, penetration: 0 },
        });
    });

    it('is idempotent', () => {
        const src = source({ dh2: { formula: '-' } });
        normalizeNoDamageNotation(src);
        normalizeNoDamageNotation(src);
        expect(src.damage).toEqual({ dh2: { formula: '', none: true } });
    });

    it('does not mark an empty formula as no damage: that means no dice were authored', () => {
        const src = source({ formula: '', type: 'impact' });
        normalizeNoDamageNotation(src);
        expect(src.damage).toEqual({ formula: '', type: 'impact' });
    });

    it('ignores a source with no damage profile, or one in an unexpected shape', () => {
        const empty = {};
        normalizeNoDamageNotation(empty);
        expect(empty).toEqual({});
        const scalar = { damage: { bc: '1d10+3' } };
        normalizeNoDamageNotation(scalar);
        expect(scalar).toEqual({ damage: { bc: '1d10+3' } });
    });
});

describe('profileDealsDamage (#601)', () => {
    it('a weapon with dice deals damage; a no-damage weapon does not', () => {
        expect(profileDealsDamage({ none: false, override: null, modeDamage: '' })).toBe(true);
        expect(profileDealsDamage({ none: true, override: null, modeDamage: '' })).toBe(false);
    });

    it('a chambered full-profile round decides in place of the weapon', () => {
        // A launcher (no damage of its own) firing a frag round deals the round's damage…
        expect(profileDealsDamage({ none: true, override: { none: false }, modeDamage: '' })).toBe(true);
        // …and one firing a stun round deals none, even from a weapon that has dice.
        expect(profileDealsDamage({ none: false, override: { none: true }, modeDamage: '' })).toBe(false);
        // A segment cached before `none` existed is a damaging round.
        expect(profileDealsDamage({ none: true, override: {}, modeDamage: '' })).toBe(true);
    });

    it('a firing mode that authors its own dice deals damage', () => {
        expect(profileDealsDamage({ none: true, override: { none: true }, modeDamage: '1d10+2' })).toBe(true);
    });
});
