/**
 * Pinning tests for the Sanctic Purity Fate-spend Phenomena negation
 * surface (#131).
 *
 *   - `SANCTIC_PURITY_FATE_COST` is locked at 1. The prompt copy
 *     ("Spend 1 Fate to negate this Phenomena roll?") reads this
 *     constant indirectly; drifting it silently would break the
 *     player-facing message and the dispatch decrement together.
 *   - `hasSancticPurity` matches the talent by its `system.identifier`
 *     (`sancticPurity`), never by name.
 */

import { describe, expect, it } from 'vitest';
import { hasSancticPurity, SANCTIC_PURITY_FATE_COST } from './sanctic-purity.ts';

describe('SANCTIC_PURITY_FATE_COST (#131)', () => {
    it('pins the Fate cost at 1', () => {
        expect(SANCTIC_PURITY_FATE_COST).toBe(1);
    });
});

describe('hasSancticPurity predicate (#131)', () => {
    it('returns false for null / undefined actors', () => {
        expect(hasSancticPurity(null)).toBe(false);
        expect(hasSancticPurity(undefined)).toBe(false);
    });

    it('returns false when the actor exposes no items', () => {
        expect(hasSancticPurity({})).toBe(false);
    });

    it('recognises the talent by its sancticPurity identifier', () => {
        expect(hasSancticPurity({ items: [{ type: 'talent', system: { identifier: 'sancticPurity' } }] })).toBe(true);
    });

    it('ignores a non-talent item sharing the identifier and unrelated talents', () => {
        expect(hasSancticPurity({ items: [{ type: 'trait', system: { identifier: 'sancticPurity' } }] })).toBe(false);
        expect(hasSancticPurity({ items: [{ type: 'talent', system: { identifier: 'emperorsAnathema' } }] })).toBe(false);
    });
});
