import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    describeFateFormula,
    describeWoundsFormula,
    evaluateFateFormula,
    evaluateWoundsFormula,
    parseDiceRoll,
    parseTBMultiplier,
    type WoundsActorView,
} from './formula-evaluator.ts';

/**
 * Coverage for the formula utilities (previously untested). The pure
 * parsers/describers run directly; the two evaluators drive Foundry's Roll, so a
 * deterministic Roll stub captures the rolled formula and returns a fixed total.
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

describe('evaluateFateFormula (Roll-stubbed)', () => {
    let rollTotal = 0;

    beforeEach(() => {
        vi.stubGlobal(
            'Roll',
            class {
                evaluateSync(): { total: number } {
                    return { total: rollTotal };
                }
            },
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('returns the value of the 1d10 condition the roll falls in', () => {
        rollTotal = 3;
        expect(evaluateFateFormula('(1-5|=2),(6-10|=3)')).toBe(2);
        rollTotal = 8;
        expect(evaluateFateFormula('(1-5|=2),(6-10|=3)')).toBe(3);
    });

    it('returns 0 for empty or condition-less formulas', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(evaluateFateFormula('')).toBe(0);
        rollTotal = 5;
        expect(evaluateFateFormula('no conditions here')).toBe(0);
    });
});

describe('evaluateWoundsFormula (Roll-stubbed)', () => {
    let lastFormula = '';
    let rollTotal = 0;

    beforeEach(() => {
        lastFormula = '';
        vi.stubGlobal(
            'Roll',
            class {
                constructor(formula: string) {
                    lastFormula = formula;
                }
                evaluateSync(): { total: number } {
                    return { total: rollTotal };
                }
            },
        );
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const actor = (bonuses: Record<string, number>): WoundsActorView => ({
        system: { characteristics: Object.fromEntries(Object.entries(bonuses).map(([key, bonus]) => [key, { bonus }])) },
    });

    it('substitutes a multiplied characteristic bonus before rolling', () => {
        rollTotal = 12;
        const result = evaluateWoundsFormula('2xTB+1d5', actor({ toughness: 4 }));
        expect(lastFormula).toBe('8+1d5');
        expect(result).toBe(12);
    });

    it('substitutes multiple bonus references', () => {
        rollTotal = 7;
        evaluateWoundsFormula('TB+SB', actor({ toughness: 4, strength: 3 }));
        expect(lastFormula).toBe('4+3');
    });

    it('floors the result at 0 and short-circuits an empty formula', () => {
        rollTotal = -5;
        expect(evaluateWoundsFormula('TB', actor({ toughness: 4 }))).toBe(0);
        expect(evaluateWoundsFormula('', actor({}))).toBe(0);
    });
});
