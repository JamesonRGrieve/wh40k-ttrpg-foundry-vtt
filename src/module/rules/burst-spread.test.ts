import { describe, expect, it } from 'vitest';
import { eligibleSpreadTargets, SPREAD_RADIUS_METRES, type SpreadCandidate } from './burst-spread.ts';

/**
 * RAW eligibility for a burst's extra hits (#513).
 *
 * "Extra hits can either be allocated to the original target or any other targets
 * within two metres, provided none of the new targets would have been harder to
 * hit than the original target."
 */

/** Build a candidate with sensible defaults, overriding only what a case cares about. */
function candidate(o: Partial<SpreadCandidate> & { id: string }): SpreadCandidate {
    return { name: o.id, metresFromOriginal: 1, toHitModifier: 0, ...o };
}

describe('eligibleSpreadTargets (#513)', () => {
    it('accepts a target inside the two-metre radius', () => {
        const out = eligibleSpreadTargets({ originalToHitModifier: 0, candidates: [candidate({ id: 'cultist', metresFromOriginal: 2 })] });
        expect(out).toEqual([{ id: 'cultist', name: 'cultist' }]);
    });

    it('rejects a target beyond the radius', () => {
        const out = eligibleSpreadTargets({ originalToHitModifier: 0, candidates: [candidate({ id: 'far', metresFromOriginal: 2.5 })] });
        expect(out).toEqual([]);
    });

    it('rejects a target that would have been harder to hit', () => {
        // A smaller enemy imposes a worse modifier, so RAW forbids moving hits onto it.
        const out = eligibleSpreadTargets({ originalToHitModifier: 0, candidates: [candidate({ id: 'grot', toHitModifier: -10 })] });
        expect(out).toEqual([]);
    });

    it('accepts a target EQUALLY hard to hit — RAW forbids only harder ones', () => {
        // The commonest real case: a second identical enemy beside the first. A
        // strict `>` comparison would wrongly exclude it.
        const out = eligibleSpreadTargets({ originalToHitModifier: -10, candidates: [candidate({ id: 'twin', toHitModifier: -10 })] });
        expect(out).toEqual([{ id: 'twin', name: 'twin' }]);
    });

    it('accepts a target easier to hit than the original', () => {
        const out = eligibleSpreadTargets({ originalToHitModifier: -10, candidates: [candidate({ id: 'ogryn', toHitModifier: 10 })] });
        expect(out).toEqual([{ id: 'ogryn', name: 'ogryn' }]);
    });

    it('orders eligible targets nearest-first', () => {
        const out = eligibleSpreadTargets({
            originalToHitModifier: 0,
            candidates: [
                candidate({ id: 'far', metresFromOriginal: 2 }),
                candidate({ id: 'near', metresFromOriginal: 0.5 }),
                candidate({ id: 'mid', metresFromOriginal: 1.5 }),
            ],
        });
        expect(out.map((t) => t.id)).toEqual(['near', 'mid', 'far']);
    });

    it('drops candidates with a non-finite distance rather than treating them as adjacent', () => {
        const out = eligibleSpreadTargets({ originalToHitModifier: 0, candidates: [candidate({ id: 'unplaced', metresFromOriginal: Number.NaN })] });
        expect(out).toEqual([]);
    });

    it('pins the RAW radius so a silent change to it is caught', () => {
        expect(SPREAD_RADIUS_METRES).toBe(2);
    });
});
