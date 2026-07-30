import { describe, expect, it } from 'vitest';
import { buildScatterVector, DIRECTION_LABELS, labelForDirection, rollScatterDirection, scaleScatterForArea, scatterDirection } from './scatter';

describe('buildScatterVector (#112)', () => {
    it('returns valid {direction, metres} for in-range inputs', () => {
        expect(buildScatterVector(5, 3)).toEqual({ direction: 5, metres: 3 });
        expect(buildScatterVector(1, 1)).toEqual({ direction: 1, metres: 1 });
        expect(buildScatterVector(10, 5)).toEqual({ direction: 10, metres: 5 });
    });
    it('clamps direction into 1..10', () => {
        expect(buildScatterVector(0, 3)).toEqual({ direction: 1, metres: 3 });
        expect(buildScatterVector(-5, 3)).toEqual({ direction: 1, metres: 3 });
        expect(buildScatterVector(11, 3)).toEqual({ direction: 10, metres: 3 });
        expect(buildScatterVector(99, 3)).toEqual({ direction: 10, metres: 3 });
    });
    it('clamps metres into 1..5', () => {
        expect(buildScatterVector(5, 0).metres).toBe(1);
        expect(buildScatterVector(5, -3).metres).toBe(1);
        expect(buildScatterVector(5, 7).metres).toBe(5);
    });
    it('non-finite inputs default to direction 1 / metres 1', () => {
        expect(buildScatterVector(Number.NaN, Number.NaN)).toEqual({ direction: 1, metres: 1 });
    });
});

describe('scaleScatterForArea (#112)', () => {
    it('doubles metres for Blast / Spray template scatter', () => {
        expect(scaleScatterForArea(1)).toBe(2);
        expect(scaleScatterForArea(3)).toBe(6);
        expect(scaleScatterForArea(5)).toBe(10);
    });
    it('caps at 10 metres', () => {
        expect(scaleScatterForArea(50)).toBe(10);
    });
});

describe('DIRECTION_LABELS / labelForDirection (#112)', () => {
    it('exposes 10 distinct labels (one per direction roll)', () => {
        expect(DIRECTION_LABELS).toHaveLength(10);
    });

    it('labelForDirection returns the matching label for valid input', () => {
        expect(labelForDirection(1)).toBe('Behind (1)');
        expect(labelForDirection(7)).toBe('Forward (7)');
        expect(labelForDirection(10)).toBe('Left (10)');
    });
});

describe('rollScatterDirection / scatterDirection — the ONE resolver the chat cards call', () => {
    it('maps the 1d10 draw onto all ten diagram directions', () => {
        // rng() in [0,1) → floor(rng*10)+1, so the tenth of the range picks the direction.
        const rolled = Array.from({ length: 10 }, (_, i) => rollScatterDirection(() => i / 10));
        expect(rolled).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('labels every direction distinctly (the deleted compass copy collapsed 6+7 and 9+10)', () => {
        const labels = Array.from({ length: 10 }, (_, i) => scatterDirection(() => i / 10));
        expect(labels).toEqual([...DIRECTION_LABELS]);
        expect(new Set(labels).size).toBe(10);
    });

    it('clamps a degenerate rng into the diagram', () => {
        expect(rollScatterDirection(() => 0)).toBe(1);
        expect(rollScatterDirection(() => 0.999999)).toBe(10);
        expect(rollScatterDirection(() => Number.NaN)).toBe(1);
    });

    it('defaults to Math.random and always yields a known label', () => {
        for (let i = 0; i < 50; i++) {
            expect(DIRECTION_LABELS).toContain(scatterDirection());
        }
    });
});
