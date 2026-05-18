import { describe, expect, it } from 'vitest';
import {
    type InventoryCandidate,
    collectProfiles,
    effectiveWeight,
    filterByProfile,
    generateInventory,
    seededRng,
    weightedSample,
} from './inventory-generator.ts';

/**
 * Pure selection logic — no Foundry globals, runs for real in happy-dom.
 * The compendium-querying orchestration (InventoryGeneratorManager) is
 * exercised by the Tier A integration suite; here we pin the deterministic
 * maths every story / sheet path relies on.
 */

const seeded = seededRng;

function candidate(overrides: Partial<InventoryCandidate> & { uuid: string; name: string }): InventoryCandidate {
    return {
        type: 'gear',
        img: 'icons/svg/item-bag.svg',
        availability: 'common',
        drawWeight: null,
        profiles: [],
        ...overrides,
    };
}

const POOL: InventoryCandidate[] = [
    candidate({ uuid: 'Compendium.x.Item.a', name: 'Alpha', profiles: ['armoury', 'hive-market'] }),
    candidate({ uuid: 'Compendium.x.Item.b', name: 'Bravo', profiles: ['armoury'], drawWeight: 5 }),
    candidate({ uuid: 'Compendium.x.Item.c', name: 'Charlie', profiles: ['hive-market'] }),
    candidate({ uuid: 'Compendium.x.Item.d', name: 'Delta', profiles: [] }),
];

describe('collectProfiles', () => {
    it('returns the distinct, sorted set of profile tags present in the pool', () => {
        expect(collectProfiles(POOL)).toEqual(['armoury', 'hive-market']);
    });

    it('trims and ignores blank tags', () => {
        const dirty = [candidate({ uuid: 'u', name: 'n', profiles: ['  spaced  ', '', '   '] })];
        expect(collectProfiles(dirty)).toEqual(['spaced']);
    });

    it('is empty for an untagged pool', () => {
        expect(collectProfiles([candidate({ uuid: 'u', name: 'n' })])).toEqual([]);
    });
});

describe('filterByProfile', () => {
    it('returns the whole pool for a null or blank profile', () => {
        expect(filterByProfile(POOL, null)).toHaveLength(POOL.length);
        expect(filterByProfile(POOL, '   ')).toHaveLength(POOL.length);
    });

    it('keeps only candidates published under the profile', () => {
        const names = filterByProfile(POOL, 'armoury').map((c) => c.name);
        expect(names).toEqual(['Alpha', 'Bravo']);
    });

    it('returns nothing for an unknown profile', () => {
        expect(filterByProfile(POOL, 'nonexistent')).toEqual([]);
    });
});

describe('effectiveWeight', () => {
    it('defaults a null / non-positive / non-finite weight to 1', () => {
        expect(effectiveWeight(candidate({ uuid: 'u', name: 'n', drawWeight: null }))).toBe(1);
        expect(effectiveWeight(candidate({ uuid: 'u', name: 'n', drawWeight: 0 }))).toBe(1);
        expect(effectiveWeight(candidate({ uuid: 'u', name: 'n', drawWeight: -3 }))).toBe(1);
        expect(effectiveWeight(candidate({ uuid: 'u', name: 'n', drawWeight: Number.NaN }))).toBe(1);
    });

    it('honours a positive weight', () => {
        expect(effectiveWeight(candidate({ uuid: 'u', name: 'n', drawWeight: 7 }))).toBe(7);
    });
});

describe('weightedSample', () => {
    it('draws distinct candidates without replacement', () => {
        const picked = weightedSample(POOL, 3, seeded(42));
        const uuids = picked.map((c) => c.uuid);
        expect(picked).toHaveLength(3);
        expect(new Set(uuids).size).toBe(3);
    });

    it('clamps the count to the pool size', () => {
        expect(weightedSample(POOL, 99, seeded(1))).toHaveLength(POOL.length);
        expect(weightedSample(POOL, -5, seeded(1))).toHaveLength(0);
    });

    it('is deterministic for a fixed seed', () => {
        const first = weightedSample(POOL, 3, seeded(123)).map((c) => c.uuid);
        const second = weightedSample(POOL, 3, seeded(123)).map((c) => c.uuid);
        expect(first).toEqual(second);
    });

    it('biases toward heavier candidates over many trials', () => {
        const pair: InventoryCandidate[] = [
            candidate({ uuid: 'light', name: 'Light', drawWeight: 1 }),
            candidate({ uuid: 'heavy', name: 'Heavy', drawWeight: 9 }),
        ];
        const rng = seeded(7);
        let heavyFirst = 0;
        for (let i = 0; i < 400; i++) {
            if (weightedSample(pair, 1, rng)[0]?.uuid === 'heavy') heavyFirst++;
        }
        expect(heavyFirst).toBeGreaterThan(280);
    });

    it('returns an empty list for an empty pool', () => {
        expect(weightedSample([], 5, seeded(1))).toEqual([]);
    });
});

describe('generateInventory', () => {
    it('filters by profile then samples', () => {
        const result = generateInventory(POOL, { profile: 'hive-market', count: 5, rng: seeded(9) });
        expect(result).toHaveLength(2);
        expect(result.map((c) => c.name).sort()).toEqual(['Alpha', 'Charlie']);
    });

    it('samples the whole pool when no profile is selected', () => {
        const result = generateInventory(POOL, { profile: null, count: 2, rng: seeded(9) });
        expect(result).toHaveLength(2);
    });
});
