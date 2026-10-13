import { describe, expect, it } from 'vitest';
import {
    classifyDamageProfile,
    isContextualDamage,
    normalizeNoDamageNotation,
    ownDamageFormula,
    ownProfileDealsDamage,
    profileDealsDamage,
} from './no-damage.ts';

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

/** A weapon's own resolved damage profile with nothing authored. */
function unauthored(overrides: Partial<Parameters<typeof classifyDamageProfile>[0]> = {}): Parameters<typeof classifyDamageProfile>[0] {
    return { formula: '', none: false, bands: [], table: '', from: '', ...overrides };
}

const FFG_LINES = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'] as const;

describe('classifyDamageProfile (#601, #608)', () => {
    it.each(FFG_LINES)('reads each explicit profile shape the same on %s', (line) => {
        expect(classifyDamageProfile(unauthored({ formula: '1d10+2' }), line)).toBe('formula');
        expect(classifyDamageProfile(unauthored({ none: true }), line)).toBe('none');
        expect(classifyDamageProfile(unauthored({ bands: [{}] }), line)).toBe('bands');
        expect(classifyDamageProfile(unauthored({ table: 'Compendium.wh40k-rpg.x.RollTable.0123456789abcdef' }), line)).toBe('table');
        expect(classifyDamageProfile(unauthored({ from: 'mount' }), line)).toBe('mount');
        expect(classifyDamageProfile(unauthored({ from: 'wielder-melee' }), line)).toBe('wielder-melee');
    });

    it('authored dice win over every other shape', () => {
        expect(classifyDamageProfile(unauthored({ formula: '2d10', none: true, bands: [{}], from: 'mount' }), 'dh2')).toBe('formula');
    });

    // The '1d10' fallback is gone: an unauthored weapon no longer rolls dice no book printed.
    it.each(FFG_LINES)('an unauthored profile on %s is missing, not a silent 1d10', (line) => {
        expect(classifyDamageProfile(unauthored(), line)).toBe('missing');
    });

    // Imperium Maledictum is out of the #601 audit by operator decision: unchanged.
    it('an unauthored profile on Imperium Maledictum keeps the legacy default', () => {
        expect(classifyDamageProfile(unauthored(), 'im')).toBe('legacy-default');
    });
});

describe('the weapon’s own profile (#601)', () => {
    it('rolls the authored dice, the legacy default on IM, and nothing otherwise', () => {
        expect(ownDamageFormula('formula', '3d10')).toBe('3d10');
        expect(ownDamageFormula('legacy-default', '')).toBe('1d10');
        for (const kind of ['none', 'missing', 'bands', 'table', 'mount', 'wielder-melee'] as const) expect(ownDamageFormula(kind, '')).toBe('');
    });

    it('deals no damage for the book’s dash or a missing profile', () => {
        expect(ownProfileDealsDamage('none')).toBe(false);
        expect(ownProfileDealsDamage('missing')).toBe(false);
        for (const kind of ['formula', 'legacy-default', 'bands', 'table', 'mount', 'wielder-melee'] as const) expect(ownProfileDealsDamage(kind)).toBe(true);
    });

    it('a missing profile still deals a firing mode’s own dice or a chambered round’s', () => {
        expect(profileDealsDamage({ none: !ownProfileDealsDamage('missing'), override: null, modeDamage: '1d10' })).toBe(true);
        expect(profileDealsDamage({ none: !ownProfileDealsDamage('missing'), override: { none: false }, modeDamage: '' })).toBe(true);
        expect(profileDealsDamage({ none: !ownProfileDealsDamage('missing'), override: null, modeDamage: '' })).toBe(false);
    });

    it('only the bands / table / borrowed profiles resolve at attack time', () => {
        expect(['bands', 'table', 'mount', 'wielder-melee'].every((kind) => isContextualDamage(kind as 'bands'))).toBe(true);
        for (const kind of ['formula', 'none', 'legacy-default', 'missing'] as const) expect(isContextualDamage(kind)).toBe(false);
    });
});
