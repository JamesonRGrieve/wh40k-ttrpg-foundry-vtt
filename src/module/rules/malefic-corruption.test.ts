import { describe, expect, it } from 'vitest';
import { getMaleficCorruptionCost } from './malefic-corruption';

describe('getMaleficCorruptionCost', () => {
    it('returns 0 for a failed manifestation', () => {
        expect(getMaleficCorruptionCost('malefic', 4, false)).toBe(0);
    });
    it('returns PR for a successful malefic manifestation', () => {
        expect(getMaleficCorruptionCost('malefic', 4, true)).toBe(4);
    });
    it('returns 0 for non-malefic disciplines', () => {
        for (const d of ['biomancy', 'divination', 'pyromancy', 'telekinesis', 'telepathy', 'sanctic', 'daemonology', 'minor'] as const) {
            expect(getMaleficCorruptionCost(d, 5, true)).toBe(0);
        }
    });
    it('reflects fettered (half-PR) cost correctly when caller passes effectivePR', () => {
        // Fettered halves PR via resolvePsyMode; the caller passes that
        // value here. Cost equals what was passed.
        expect(getMaleficCorruptionCost('malefic', 2, true)).toBe(2);
    });
    it('reflects pushed (PR+L) cost correctly', () => {
        expect(getMaleficCorruptionCost('malefic', 6, true)).toBe(6);
    });
});
