import { describe, expect, it } from 'vitest';
import { centredSubSquarePosition } from './token-snap.ts';

describe('centring sub-square tokens (#774)', () => {
    it('centres a 0.75 token in the square its centre is in', () => {
        // Dropped at the corner of square (47, 17): centre lands at 4737.5, 1737.5.
        expect(centredSubSquarePosition({ x: 4700, y: 1700, width: 0.75, height: 0.75 }, 100)).toEqual({ x: 4712.5, y: 1712.5 });
    });

    it("follows the token's centre into the next square", () => {
        expect(centredSubSquarePosition({ x: 4770, y: 1700, width: 0.75, height: 0.75 }, 100)).toEqual({ x: 4812.5, y: 1712.5 });
    });

    it('is idempotent on an already centred token', () => {
        expect(centredSubSquarePosition({ x: 4712.5, y: 1712.5, width: 0.75, height: 0.75 }, 100)).toEqual({ x: 4712.5, y: 1712.5 });
    });

    it('leaves a token a square or larger to core snapping', () => {
        expect(centredSubSquarePosition({ x: 4700, y: 1700, width: 1, height: 1 }, 100)).toBeNull();
        expect(centredSubSquarePosition({ x: 4700, y: 1700, width: 0.5, height: 2 }, 100)).toBeNull();
    });

    it('works for a half-square token', () => {
        expect(centredSubSquarePosition({ x: 0, y: 0, width: 0.5, height: 0.5 }, 100)).toEqual({ x: 25, y: 25 });
    });
});
