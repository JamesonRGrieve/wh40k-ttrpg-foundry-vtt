import { describe, expect, it } from 'vitest';
import { describeFateFormula, describeWoundsFormula, parseDiceRoll, parseTBMultiplier } from './formula-evaluator.ts';

/**
 * Coverage for the pure formula parsers/describers (previously untested). The
 * two evaluators (evaluateWoundsFormula / evaluateFateFormula) roll dice and
 * read an actor, so they need a Roll/actor harness and are excluded here.
 */

describe('parseTBMultiplier', () => {
    it('reads an explicit "<n>xTB" multiplier (case-insensitive)', () => {
        expect(parseTBMultiplier('2xTB+1d5')).toBe(2);
        expect(parseTBMultiplier('3xTB')).toBe(3);
        expect(parseTBMultiplier('2xtb')).toBe(2);
    });

    it('defaults a bare TB reference to 1', () => {
        expect(parseTBMultiplier('TB+1d5')).toBe(1);
    });

    it('returns 0 when there is no TB term', () => {
        expect(parseTBMultiplier('1d10')).toBe(0);
        expect(parseTBMultiplier('SB+1d5')).toBe(0);
        expect(parseTBMultiplier('')).toBe(0);
    });
});

describe('parseDiceRoll', () => {
    it('extracts the dice notation including a flat modifier', () => {
        expect(parseDiceRoll('2xTB+1d5+2')).toBe('1d5+2');
        expect(parseDiceRoll('TB+1d10')).toBe('1d10');
        expect(parseDiceRoll('3xWB+1d10')).toBe('1d10');
    });

    it('returns null when there is no dice term', () => {
        expect(parseDiceRoll('TB')).toBeNull();
        expect(parseDiceRoll('')).toBeNull();
    });
});

describe('describeWoundsFormula', () => {
    it('renders multiplication and addition with readable symbols', () => {
        expect(describeWoundsFormula('2xTB+1d5+2')).toBe('2×TB + 1d5 + 2');
    });

    it('renders subtraction with a true minus sign', () => {
        expect(describeWoundsFormula('TB-1')).toBe('TB − 1');
    });

    it('returns "None" for an empty formula', () => {
        expect(describeWoundsFormula('')).toBe('None');
    });
});

describe('describeFateFormula', () => {
    it('summarises the 1d10 condition table', () => {
        expect(describeFateFormula('(1-5|=2),(6-10|=3)')).toBe('1d10: 1-5=2, 6-10=3');
    });

    it('returns the formula unchanged when it has no conditions', () => {
        expect(describeFateFormula('flat-3')).toBe('flat-3');
    });

    it('returns "None" for an empty formula', () => {
        expect(describeFateFormula('')).toBe('None');
    });
});
