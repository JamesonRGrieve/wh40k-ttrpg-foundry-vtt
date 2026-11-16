import { describe, expect, it } from 'vitest';
import { bandForRoll, bandRangeLabel, isRollBandFormula, parseRollBands } from './roll-bands.ts';

describe('banded d10 lookups', () => {
    it('reads ranges and a single-face band (RT Forge World and Noble Born print "(10|=4)")', () => {
        const bands = parseRollBands('(1-5|=2),(6-9|=3),(10|=4)');
        expect(bands).toEqual([
            { min: 1, max: 5, value: 2 },
            { min: 6, max: 9, value: 3 },
            { min: 10, max: 10, value: 4 },
        ]);
        expect(bandForRoll(bands, 10)?.value).toBe(4);
        expect(bandForRoll(bands, 7)?.value).toBe(3);
        expect(bandRangeLabel(bands[2] ?? { min: 0, max: 0, value: 0 })).toBe('10');
        expect(bandRangeLabel(bands[1] ?? { min: 0, max: 0, value: 0 })).toBe('6-9');
    });

    it('finds no band outside the table, and tells a flat or dice formula from a lookup', () => {
        expect(bandForRoll(parseRollBands('(1-5|=2)'), 8)).toBeUndefined();
        expect(isRollBandFormula('(1-4|=1),(5-8|=2),(9-10|=2)')).toBe(true);
        expect(isRollBandFormula('3')).toBe(false);
        expect(isRollBandFormula('9+1d5')).toBe(false);
    });
});
