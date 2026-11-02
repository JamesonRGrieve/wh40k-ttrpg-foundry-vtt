import { describe, expect, it } from 'vitest';
import { canonicalIdentifier, hasItemWithIdentifier, itemIdentifier } from './item-identifier.ts';

describe('canonicalIdentifier', () => {
    it('leaves a kebab-case identifier as it is', () => {
        expect(canonicalIdentifier('two-weapon-wielder')).toBe('two-weapon-wielder');
        expect(canonicalIdentifier('hatred')).toBe('hatred');
    });

    it('folds the legacy camelCase form to kebab-case', () => {
        expect(canonicalIdentifier('twoWeaponWielder')).toBe('two-weapon-wielder');
        expect(canonicalIdentifier('naturalArmour')).toBe('natural-armour');
        expect(canonicalIdentifier('psyRating2')).toBe('psy-rating2');
    });
});

describe('itemIdentifier', () => {
    it("reads the item's system.identifier", () => {
        expect(itemIdentifier({ system: { identifier: 'hatred' } })).toBe('hatred');
    });

    it('reads a legacy camelCase identifier in canonical form', () => {
        expect(itemIdentifier({ system: { identifier: 'sancticPurity' } })).toBe('sanctic-purity');
    });

    it("is '' with no system, no identifier, or a non-string identifier", () => {
        expect(itemIdentifier({})).toBe('');
        expect(itemIdentifier({ system: {} })).toBe('');
        expect(itemIdentifier({ system: { identifier: null } })).toBe('');
    });
});

describe('hasItemWithIdentifier', () => {
    const items = [
        { type: 'talent', system: { identifier: 'hatred' } },
        { type: 'trait', system: { identifier: 'daemonic' } },
    ];

    it('matches type and identifier together', () => {
        expect(hasItemWithIdentifier(items, 'trait', 'daemonic')).toBe(true);
        expect(hasItemWithIdentifier(items, 'talent', 'daemonic')).toBe(false);
        expect(hasItemWithIdentifier(items, 'talent', 'hatred')).toBe(true);
    });

    it('matches a stored legacy camelCase identifier against the kebab-case one', () => {
        const legacy = [{ type: 'talent', system: { identifier: 'sancticPurity' } }];
        expect(hasItemWithIdentifier(legacy, 'talent', 'sanctic-purity')).toBe(true);
        expect(hasItemWithIdentifier(legacy, 'trait', 'sanctic-purity')).toBe(false);
    });

    it('is false for an empty collection', () => {
        expect(hasItemWithIdentifier([], 'talent', 'hatred')).toBe(false);
    });
});
