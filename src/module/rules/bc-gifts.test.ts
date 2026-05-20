/**
 * Tests for Black Crusade Gifts of the Gods resolver (#180).
 *
 * Covers the data-shape contract for `resolveGiftForAlignment` (base
 * vs. rider merging, alignment matching, trait/Active-Effect dedup)
 * and the per-actor aggregation pass via `mergeGiftDeltas`.
 *
 * Per Direction #7, the fixtures here are structural — no real gift
 * names or canonical numeric values from Table 9-1; the catalogue
 * lives in the compendium.
 */
import { describe, expect, it } from 'vitest';

import { mergeGiftDeltas, resolveGiftForAlignment, type GiftDef } from './bc-gifts.ts';

function makeGift(overrides: Partial<GiftDef> = {}): GiftDef {
    return {
        id: 'gift-test-001',
        name: 'Test Gift',
        baseDescription: 'A structural test gift.',
        riders: [],
        ...overrides,
    };
}

describe('resolveGiftForAlignment', () => {
    it('returns base-only resolution when unaligned and no rider applies', () => {
        const gift = makeGift({
            baseCharacteristicDelta: { s: 5 },
            baseTrait: 'trait.base',
            riders: [
                { alignment: 'khorne', description: 'k', characteristicDelta: { s: 5 }, trait: 'trait.khorne' },
                { alignment: 'slaanesh', description: 's', characteristicDelta: { ag: 5 }, trait: 'trait.slaanesh' },
            ],
        });

        const resolved = resolveGiftForAlignment(gift, 'unaligned');

        expect(resolved.id).toBe(gift.id);
        expect(resolved.baseDescription).toBe(gift.baseDescription);
        expect(resolved.characteristicDelta).toEqual({ s: 5 });
        expect(resolved.traits).toEqual(['trait.base']);
        expect(resolved.activeEffects).toEqual([]);
        expect(resolved.appliedAlignment).toBe('unaligned');
    });

    it('returns base-only resolution when the alignment has no matching rider', () => {
        const gift = makeGift({
            baseCharacteristicDelta: { t: 3 },
            riders: [{ alignment: 'tzeentch', description: 't', characteristicDelta: { int: 5 } }],
        });

        const resolved = resolveGiftForAlignment(gift, 'nurgle');

        expect(resolved.characteristicDelta).toEqual({ t: 3 });
        expect(resolved.appliedAlignment).toBe('unaligned');
    });

    it('merges base + Khorne rider when the holder is aligned to Khorne', () => {
        const gift = makeGift({
            baseDescription: 'base text',
            baseCharacteristicDelta: { s: 5 },
            baseTrait: 'trait.base',
            baseActiveEffect: 'ae.base',
            riders: [
                {
                    alignment: 'khorne',
                    description: 'khorne text',
                    characteristicDelta: { ws: 5 },
                    trait: 'trait.khorne',
                    activeEffect: 'ae.khorne',
                },
                { alignment: 'slaanesh', description: 's', characteristicDelta: { ag: 5 } },
            ],
        });

        const resolved = resolveGiftForAlignment(gift, 'khorne');

        expect(resolved.appliedAlignment).toBe('khorne');
        expect(resolved.characteristicDelta).toEqual({ s: 5, ws: 5 });
        expect(resolved.traits).toEqual(['trait.base', 'trait.khorne']);
        expect(resolved.activeEffects).toEqual(['ae.base', 'ae.khorne']);
    });

    it('sums rider characteristicDelta with base on shared keys', () => {
        const gift = makeGift({
            baseCharacteristicDelta: { s: 5, t: 3 },
            riders: [{ alignment: 'nurgle', description: 'n', characteristicDelta: { s: 5, wp: 5 } }],
        });

        const resolved = resolveGiftForAlignment(gift, 'nurgle');

        // Shared key `s` sums (5 + 5); unique keys are preserved.
        expect(resolved.characteristicDelta).toEqual({ s: 10, t: 3, wp: 5 });
    });

    it('appends the rider trait after the base trait and dedupes equal entries', () => {
        const gift = makeGift({
            baseTrait: 'trait.shared',
            riders: [{ alignment: 'tzeentch', description: 't', trait: 'trait.shared' }],
        });

        const resolved = resolveGiftForAlignment(gift, 'tzeentch');

        // Same identifier on base + rider → emitted once.
        expect(resolved.traits).toEqual(['trait.shared']);
    });

    it('keeps base trait first when rider adds a distinct trait', () => {
        const gift = makeGift({
            baseTrait: 'trait.base',
            riders: [{ alignment: 'slaanesh', description: 's', trait: 'trait.slaanesh' }],
        });

        const resolved = resolveGiftForAlignment(gift, 'slaanesh');

        expect(resolved.traits).toEqual(['trait.base', 'trait.slaanesh']);
    });
});

describe('mergeGiftDeltas', () => {
    it('returns an empty object for an empty input array', () => {
        expect(mergeGiftDeltas([])).toEqual({});
    });

    it('sums deltas across multiple gifts on shared and distinct keys', () => {
        const merged = mergeGiftDeltas([{ s: 5, t: 3 }, { s: 5, ws: 5 }, { t: 2 }]);

        expect(merged).toEqual({ s: 10, t: 5, ws: 5 });
    });

    it('preserves negative deltas', () => {
        const merged = mergeGiftDeltas([{ ag: -5, fel: 3 }, { ag: -2 }]);

        expect(merged).toEqual({ ag: -7, fel: 3 });
    });

    it('ignores non-finite values without crashing', () => {
        const merged = mergeGiftDeltas([
            { s: 5, t: Number.NaN },
            { s: Number.POSITIVE_INFINITY, ws: 3 },
        ]);

        expect(merged).toEqual({ s: 5, ws: 3 });
    });
});
