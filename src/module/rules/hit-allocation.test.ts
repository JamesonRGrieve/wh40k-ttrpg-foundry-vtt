import { describe, expect, it } from 'vitest';
import { type AllocationTarget, allocateHits, groupHitsByTarget } from './hit-allocation';

const CULTIST: AllocationTarget = { id: 'cultist', name: 'Cultist' };
const CHAMPION: AllocationTarget = { id: 'champion', name: 'Champion' };
const HERETEK: AllocationTarget = { id: 'heretek', name: 'Heretek' };

describe('allocateHits', () => {
    it('puts every hit on the declared target by default — the single-target case is unchanged', () => {
        const hits = allocateHits({ hitCount: 3, originalTarget: CULTIST, extraTargets: [], strategy: 'original' });
        expect(hits.map((h) => h.target.id)).toEqual(['cultist', 'cultist', 'cultist']);
        expect(hits.map((h) => h.hitIndexForTarget)).toEqual([0, 1, 2]);
    });

    it('pins the FIRST hit to the declared target even when spreading', () => {
        // RAW moves the EXTRA hits: "Extra hits can either be allocated to the
        // original target or any other targets within two metres".
        const hits = allocateHits({ hitCount: 3, originalTarget: CULTIST, extraTargets: [CHAMPION], strategy: 'spread' });
        expect(hits[0]?.target.id).toBe('cultist');
    });

    it('rotates the extra hits across the declared target and the eligible extras', () => {
        const hits = allocateHits({ hitCount: 4, originalTarget: CULTIST, extraTargets: [CHAMPION, HERETEK], strategy: 'spread' });
        expect(hits.map((h) => h.target.id)).toEqual(['cultist', 'champion', 'heretek', 'cultist']);
    });

    it('restarts Table 7-2 per target — a moved hit is that target’s FIRST hit', () => {
        // The load-bearing rule: a hit moved onto a second target does not inherit
        // the original target's position in the location walk.
        const hits = allocateHits({ hitCount: 4, originalTarget: CULTIST, extraTargets: [CHAMPION], strategy: 'spread' });
        expect(hits.map((h) => [h.target.id, h.hitIndexForTarget])).toEqual([
            ['cultist', 0],
            ['champion', 0],
            ['cultist', 1],
            ['champion', 1],
        ]);
    });

    it('falls back to the declared target when spreading with no eligible extras', () => {
        const hits = allocateHits({ hitCount: 3, originalTarget: CULTIST, extraTargets: [], strategy: 'spread' });
        expect(hits.every((h) => h.target.id === 'cultist')).toBe(true);
        expect(hits.map((h) => h.hitIndexForTarget)).toEqual([0, 1, 2]);
    });

    it('returns nothing for a miss', () => {
        expect(allocateHits({ hitCount: 0, originalTarget: CULTIST, extraTargets: [CHAMPION], strategy: 'spread' })).toEqual([]);
    });

    it('tolerates a malformed hit count rather than throwing', () => {
        expect(allocateHits({ hitCount: -2, originalTarget: CULTIST, extraTargets: [], strategy: 'original' })).toEqual([]);
        expect(allocateHits({ hitCount: Number.NaN, originalTarget: CULTIST, extraTargets: [], strategy: 'original' })).toEqual([]);
    });

    it('a single hit never leaves the declared target, whatever the strategy', () => {
        const hits = allocateHits({ hitCount: 1, originalTarget: CULTIST, extraTargets: [CHAMPION, HERETEK], strategy: 'spread' });
        expect(hits).toHaveLength(1);
        expect(hits[0]?.target.id).toBe('cultist');
    });
});

describe('groupHitsByTarget', () => {
    it('groups per target, keeping first-appearance order and each target’s hit order', () => {
        const hits = allocateHits({ hitCount: 5, originalTarget: CULTIST, extraTargets: [CHAMPION], strategy: 'spread' });
        const groups = groupHitsByTarget(hits);
        expect(groups.map((g) => g.target.id)).toEqual(['cultist', 'champion']);
        expect(groups[0]?.hits.map((h) => h.hitIndexForTarget)).toEqual([0, 1, 2]);
        expect(groups[1]?.hits.map((h) => h.hitIndexForTarget)).toEqual([0, 1]);
    });

    it('is a single group for a single-target attack', () => {
        const groups = groupHitsByTarget(allocateHits({ hitCount: 3, originalTarget: CULTIST, extraTargets: [], strategy: 'original' }));
        expect(groups).toHaveLength(1);
        expect(groups[0]?.hits).toHaveLength(3);
    });

    it('is empty for a miss', () => {
        expect(groupHitsByTarget([])).toEqual([]);
    });
});
