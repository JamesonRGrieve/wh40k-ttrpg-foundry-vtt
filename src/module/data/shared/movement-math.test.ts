import { describe, expect, it } from 'vitest';
import { computeMovement } from './movement-math.ts';

describe('computeMovement (#271)', () => {
    it('PC path (no floors): half/full/charge/run = baseMove × {1,2,3,6}', () => {
        // ab 4, size 4 → baseMove = 4
        expect(computeMovement(4, 4, false)).toEqual({ half: 4, full: 8, charge: 12, run: 24 });
    });

    it('NPC path applies the 1/2/3/6 minimum floors', () => {
        // ab 0, size 4 → baseMove = 0 → floored
        expect(computeMovement(0, 4, true)).toEqual({ half: 1, full: 2, charge: 3, run: 6 });
    });

    it('NPC path leaves above-floor values unchanged', () => {
        expect(computeMovement(5, 4, true)).toEqual({ half: 5, full: 10, charge: 15, run: 30 });
    });

    it('size shifts baseMove by (size - 4)', () => {
        // ab 3, size 6 → baseMove = 3 + 6 - 4 = 5
        expect(computeMovement(3, 6, false).half).toBe(5);
    });
});
