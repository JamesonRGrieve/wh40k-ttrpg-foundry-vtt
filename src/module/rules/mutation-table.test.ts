import { describe, expect, it } from 'vitest';
import { MUTATION_TABLE, TRACK_RANGES, findMutationByRoll, getMutationById, rollMutation } from './mutation-table';

describe('MUTATION_TABLE registry', () => {
    it('pins canonical RAW entries', () => {
        const bestial = getMutationById('bestial-hide');
        expect(bestial?.name).toBe('Bestial Hide');
        expect(bestial?.roll).toEqual({ min: 1, max: 6 });
        expect(bestial?.visible).toBe(true);

        const witchCurse = getMutationById('witch-curse');
        expect(witchCurse?.roll).toEqual({ min: 70, max: 77 });
        expect(witchCurse?.tracks).toEqual(['major']);
        expect(witchCurse?.visible).toBe(false);

        const manifest = getMutationById('warp-made-manifest');
        expect(manifest?.roll).toEqual({ min: 100, max: 100 });
        expect(manifest?.tracks).toEqual(['major']);
    });

    it('has 10 entries spanning the low-roll and high-roll bands', () => {
        expect(MUTATION_TABLE).toHaveLength(10);
        const lowest = Math.min(...MUTATION_TABLE.map((m) => m.roll.min));
        const highest = Math.max(...MUTATION_TABLE.map((m) => m.roll.max));
        expect(lowest).toBe(1);
        expect(highest).toBe(100);
    });

    it('ranges are non-overlapping and within 1-100', () => {
        for (const m of MUTATION_TABLE) {
            expect(m.roll.min).toBeGreaterThanOrEqual(1);
            expect(m.roll.max).toBeLessThanOrEqual(100);
            expect(m.roll.min).toBeLessThanOrEqual(m.roll.max);
        }
        for (let i = 0; i < MUTATION_TABLE.length; i += 1) {
            for (let j = i + 1; j < MUTATION_TABLE.length; j += 1) {
                const a = MUTATION_TABLE[i];
                const b = MUTATION_TABLE[j];
                if (a === undefined || b === undefined) throw new Error('MUTATION_TABLE index out of range');
                const overlap = a.roll.min <= b.roll.max && b.roll.min <= a.roll.max;
                expect(overlap, `${a.id} vs ${b.id} ranges overlap`).toBe(false);
            }
        }
    });
});

describe('findMutationByRoll', () => {
    it('matches the row containing the roll for the requested track', () => {
        expect(findMutationByRoll(3, 'minor')?.id).toBe('bestial-hide');
        expect(findMutationByRoll(25, 'minor')?.id).toBe('swollen-brute');
        expect(findMutationByRoll(54, 'major')?.id).toBe('wings');
    });

    it('returns null when no row covers the roll on the minor track even if a major-only entry would match', () => {
        expect(findMutationByRoll(75, 'minor')).toBeNull();
        expect(findMutationByRoll(75, 'major')?.id).toBe('witch-curse');
        expect(findMutationByRoll(100, 'minor')).toBeNull();
        expect(findMutationByRoll(100, 'major')?.id).toBe('warp-made-manifest');
    });

    it('clamps rolls outside 1-100 before searching', () => {
        expect(findMutationByRoll(0, 'minor')?.id).toBe('bestial-hide');
        expect(findMutationByRoll(150, 'major')?.id).toBe('warp-made-manifest');
    });
});

describe('rollMutation', () => {
    it('uses an injectable RNG and clamps to the track range', () => {
        const minor = rollMutation('minor', () => 3);
        expect(minor.track).toBe('minor');
        expect(minor.roll).toBe(3);
        expect(minor.mutation?.id).toBe('bestial-hide');

        // Major-roll on a major-only row.
        const major = rollMutation('major', () => 100);
        expect(major.mutation?.id).toBe('warp-made-manifest');

        // Minor-track clamps high rolls down to its max (60).
        const clamped = rollMutation('minor', () => 99);
        expect(clamped.roll).toBe(TRACK_RANGES.minor.max);
        expect(clamped.mutation?.id).toBe('wings');
    });

    it('produces a result whose roll always falls inside the track range', () => {
        let seed = 1;
        const rng = (): number => {
            seed = (seed * 9301 + 49297) % 233280;
            return Math.floor((seed / 233280) * 100) + 1;
        };
        for (let i = 0; i < 200; i += 1) {
            const r = rollMutation('minor', rng);
            expect(r.roll).toBeGreaterThanOrEqual(TRACK_RANGES.minor.min);
            expect(r.roll).toBeLessThanOrEqual(TRACK_RANGES.minor.max);
        }
    });

    it('returns null mutation when the clamped roll lands in a gap row', () => {
        // Roll 32 sits between deathsight (26-30) and razor-fangs (37-43) — a RAW gap row not in our subset.
        const result = rollMutation('major', () => 32);
        expect(result.roll).toBe(32);
        expect(result.mutation).toBeNull();
    });
});
