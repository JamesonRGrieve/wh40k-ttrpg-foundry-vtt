import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKEN_FOOTPRINT, prototypeTokenFootprintUpdate, tokenFootprintForSize } from './token-footprint.ts';

describe('tokenFootprintForSize', () => {
    it('maps the whole 1-10 size scale', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(tokenFootprintForSize)).toEqual([0.5, 0.75, 1, 1, 2, 2, 3, 3, 4, 4]);
    });

    it('sizes a Hulking creature at 2x2 — bigger than an Average PC, not equal', () => {
        // #501: the aberrants are size 5 and arrived 1x1 because the ladder
        // only ever ran from the NPC sheet.
        expect(tokenFootprintForSize(5)).toBe(2);
        expect(tokenFootprintForSize(4)).toBe(1);
    });

    it('falls back to 1x1 for absent, non-numeric or off-scale sizes', () => {
        expect(tokenFootprintForSize(undefined)).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize(null)).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize('5')).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize(Number.NaN)).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize(0)).toBe(DEFAULT_TOKEN_FOOTPRINT);
        expect(tokenFootprintForSize(11)).toBe(DEFAULT_TOKEN_FOOTPRINT);
    });
});

describe('prototypeTokenFootprintUpdate', () => {
    it('emits square dotted-path token dimensions', () => {
        expect(prototypeTokenFootprintUpdate(6)).toEqual({
            'prototypeToken.width': 2,
            'prototypeToken.height': 2,
        });
    });

    it('emits the default footprint when the size is unusable', () => {
        expect(prototypeTokenFootprintUpdate(undefined)).toEqual({
            'prototypeToken.width': 1,
            'prototypeToken.height': 1,
        });
    });
});
