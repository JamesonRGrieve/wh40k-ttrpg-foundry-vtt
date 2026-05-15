import { describe, expect, it } from 'vitest';

import { rollDifficulties } from './difficulties';

describe('rollDifficulties', () => {
    const map = rollDifficulties();

    it('covers the full DH2 ladder from +60 down to −60', () => {
        const keys = Object.keys(map).map(Number).sort((a, b) => b - a);
        expect(keys).toEqual([60, 50, 40, 30, 20, 10, 0, -10, -20, -30, -40, -50, -60]);
    });

    it('labels Trivial (+60), Elementary (+50), and Hellish (−60)', () => {
        expect(map['60']).toContain('Trivial');
        expect(map['50']).toContain('Elementary');
        expect(map['-60']).toContain('Hellish');
    });

    it('keeps Challenging at the +0 modifier', () => {
        expect(map['0']).toContain('Challenging');
    });
});
