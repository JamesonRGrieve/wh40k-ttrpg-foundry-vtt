import { describe, expect, it } from 'vitest';
import { chargeContactPosition, chargeReach } from './charge.ts';
import { engaged, type EngagementToken } from './engagement.ts';

const G = 100;
const at = (id: string, col: number, row: number, disposition: number, size = 1): EngagementToken => ({
    id,
    x: col * G,
    y: row * G,
    width: size,
    height: size,
    disposition,
});

describe('chargeReach (#806, RAW: at least 4 m away, within the Charge Move)', () => {
    it('in range between 4 m and the Charge Move, inclusive', () => {
        expect(chargeReach(4, 9)).toBe('in-range');
        expect(chargeReach(9, 9)).toBe('in-range');
    });
    it('too close under 4 m; too far past the Charge Move', () => {
        expect(chargeReach(3, 9)).toBe('too-close');
        expect(chargeReach(10, 9)).toBe('too-far');
    });
});

describe('chargeContactPosition', () => {
    it('stops on the side of the target facing the charger, engaged with it', () => {
        const charger = at('c', 0, 3, 1);
        const target = at('t', 6, 3, -1);
        const stop = chargeContactPosition(charger, target, G);
        expect(stop).toEqual({ x: 5 * G, y: 3 * G });
        expect(engaged({ ...charger, ...stop }, target, G)).toBe(true);
    });
    it('a diagonal approach ends on the near diagonal', () => {
        const stop = chargeContactPosition(at('c', 0, 0, 1), at('t', 6, 6, -1), G);
        expect(stop).toEqual({ x: 5 * G, y: 5 * G });
    });
    it('a large target: the charger stops beside its footprint, not inside it', () => {
        const target = at('t', 6, 3, -1, 2);
        const stop = chargeContactPosition(at('c', 0, 3, 1), target, G);
        expect(stop).toEqual({ x: 5 * G, y: 3 * G });
        expect(engaged({ ...at('c', 0, 3, 1), ...stop }, target, G)).toBe(true);
    });
});
