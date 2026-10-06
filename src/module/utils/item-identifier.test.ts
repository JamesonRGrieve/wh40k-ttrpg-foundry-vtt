import { describe, expect, it } from 'vitest';
import { hasItemWithIdentifier, itemIdentifier } from './item-identifier.ts';

describe('itemIdentifier', () => {
    it("reads the item's system.identifier", () => {
        expect(itemIdentifier({ system: { identifier: 'hatred' } })).toBe('hatred');
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

    it('is false for an empty collection', () => {
        expect(hasItemWithIdentifier([], 'talent', 'hatred')).toBe(false);
    });
});
