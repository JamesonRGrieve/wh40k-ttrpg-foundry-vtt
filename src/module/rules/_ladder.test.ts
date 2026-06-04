import { describe, expect, it } from 'vitest';
import { compareLadder, stepLadder } from './_ladder.ts';

const RANKS = ['initiate', 'journeyman', 'master', 'grandmaster'] as const;

describe('stepLadder (#301)', () => {
    it('steps up and down the ladder', () => {
        expect(stepLadder(RANKS, 'initiate', 1)).toBe('journeyman');
        expect(stepLadder(RANKS, 'master', -1)).toBe('journeyman');
        expect(stepLadder(RANKS, 'initiate', 2)).toBe('master');
    });

    it('clamps at both ends', () => {
        expect(stepLadder(RANKS, 'initiate', -3)).toBe('initiate');
        expect(stepLadder(RANKS, 'grandmaster', 5)).toBe('grandmaster');
    });

    it('returns the value unchanged when it is not on the ladder', () => {
        expect(stepLadder(RANKS, 'unknown' as (typeof RANKS)[number], 1)).toBe('unknown');
    });

    it('a zero delta is a no-op', () => {
        expect(stepLadder(RANKS, 'journeyman', 0)).toBe('journeyman');
    });
});

describe('compareLadder (#301)', () => {
    it('orders by ladder position', () => {
        expect(compareLadder(RANKS, 'initiate', 'master')).toBe(-1);
        expect(compareLadder(RANKS, 'master', 'initiate')).toBe(1);
        expect(compareLadder(RANKS, 'master', 'master')).toBe(0);
    });

    it('returns 0 when either value is absent', () => {
        expect(compareLadder(RANKS, 'ghost' as (typeof RANKS)[number], 'master')).toBe(0);
    });
});
