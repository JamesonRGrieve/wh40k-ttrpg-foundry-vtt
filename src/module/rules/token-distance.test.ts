import { describe, expect, it } from 'vitest';
import { ENGAGED_DISTANCE_METRES, figureDistance, measurePoints } from './token-distance.ts';

const SQUARE = { size: 100, square: true };
const at = (col: number, row: number, cells = 1): { x: number; y: number; width: number; height: number } => ({
    x: col * 100,
    y: row * 100,
    width: cells,
    height: cells,
});

describe('measurePoints', () => {
    it('measures single-cell tokens centre to centre', () => {
        expect(measurePoints(at(0, 0), at(3, 0), SQUARE)).toEqual({ from: { x: 50, y: 50 }, to: { x: 350, y: 50 }, adjacent: false });
    });

    it('measures to the nearest cell of a large token, not its top-left corner', () => {
        // A 3×3 target whose top-left is three cells up-left; its nearest cell is the one diagonally next to the shooter.
        const points = measurePoints(at(3, 3), at(0, 0, 3), SQUARE);
        expect(points.to).toEqual({ x: 250, y: 250 });
        expect(points.adjacent).toBe(true);
    });

    it('a diagonal neighbour is adjacent, one cell further is not', () => {
        expect(measurePoints(at(1, 1), at(2, 2), SQUARE).adjacent).toBe(true);
        expect(measurePoints(at(1, 1), at(3, 3), SQUARE).adjacent).toBe(false);
    });

    it('overlapping spans share a cell on that axis', () => {
        expect(measurePoints(at(0, 0, 2), at(1, 5), SQUARE)).toEqual({ from: { x: 150, y: 150 }, to: { x: 150, y: 550 }, adjacent: false });
    });

    it('measures centre to centre on a non-square grid', () => {
        expect(measurePoints(at(0, 0, 2), at(4, 0), { size: 100, square: false })).toEqual({
            from: { x: 100, y: 100 },
            to: { x: 450, y: 50 },
            adjacent: false,
        });
    });
});

describe('figureDistance', () => {
    it('neighbours on a metre grid are engaged, whatever the diagonal rule measured', () => {
        expect(figureDistance(2, 0, true, 1)).toBe(ENGAGED_DISTANCE_METRES);
        expect(figureDistance(1.41, 0, true, 1.5)).toBe(ENGAGED_DISTANCE_METRES);
    });

    it('neighbouring cells on a coarse map are as far apart as measured', () => {
        expect(figureDistance(5, 0, true, 5)).toBe(5);
    });

    it('a neighbour well above or below is not engaged', () => {
        expect(figureDistance(1, 4, true, 1)).toBe(4);
    });

    it('otherwise the whole metres of the 3D distance', () => {
        expect(figureDistance(3, 4, false, 1)).toBe(5);
        expect(figureDistance(2.9, 0, false, 1)).toBe(2);
    });
});
