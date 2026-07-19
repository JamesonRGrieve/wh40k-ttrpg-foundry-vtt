import { describe, expect, it, vi } from 'vitest';
import {
    type DieRoller,
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
 * parsers/describers run directly; the two evaluators own their dice through an
 * injectable {@link DieRoller} seam (Foundry's Roll#evaluateSync cannot roll a
 * die synchronously — the historic bug this seam fixes), so tests inject a
 * deterministic roller and assert both the substituted terms and the total.
 */

/** A die roller that always yields `fixed` (regardless of faces). */
const fixedDie =
    (fixed: number): DieRoller =>
    () =>
        fixed;

/** A die roller that records the faces it was asked to roll, returning `fixed`. */
function recordingDie(fixed: number): { roll: DieRoller; faces: number[] } {
    const faces: number[] = [];
    return {
        roll: (f) => {
            faces.push(f);
            return fixed;
        },
        faces,
    };
}

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

describe('evaluateFateFormula', () => {
    it('rolls 1d10 and returns the value of the condition it falls in', () => {
        const d10 = recordingDie(3);
        expect(evaluateFateFormula('(1-5|=2),(6-10|=3)', d10.roll)).toBe(2);
        expect(d10.faces).toEqual([10]); // rolls exactly one d10
        expect(evaluateFateFormula('(1-5|=2),(6-10|=3)', fixedDie(8))).toBe(3);
    });

    it('honours boundary rolls at both ends of a range', () => {
        expect(evaluateFateFormula('(1-5|=2),(6-10|=3)', fixedDie(5))).toBe(2);
        expect(evaluateFateFormula('(1-5|=2),(6-10|=3)', fixedDie(6))).toBe(3);
        expect(evaluateFateFormula('(1-8|=3),(9-10|=4)', fixedDie(10))).toBe(4);
    });

    it('returns 0 for empty or condition-less formulas', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(evaluateFateFormula('')).toBe(0);
        expect(evaluateFateFormula('no conditions here', fixedDie(5))).toBe(0);
    });

    // Regression: the evaluator used to call `new Roll('1d10').evaluateSync()`,
    // which throws under Foundry V14 (a die cannot be rolled synchronously) and
    // silently returned 0 for every fate formula. With the default roller it must
    // now produce a real, in-range condition value without throwing.
    it('default roller resolves a condition without throwing (V14 sync-die regression)', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        for (let i = 0; i < 50; i++) {
            const value = evaluateFateFormula('(1-5|=2),(6-10|=3)');
            expect([2, 3]).toContain(value);
        }
        expect(errSpy).not.toHaveBeenCalled();
    });
});

describe('evaluateWoundsFormula', () => {
    const actor = (bonuses: Record<string, number>): WoundsActorView => ({
        system: { characteristics: Object.fromEntries(Object.entries(bonuses).map(([key, bonus]) => [key, { bonus }])) },
    });

    it('substitutes a multiplied characteristic bonus, then rolls the dice term', () => {
        // 2xTB with TB=4 → "8+1d5"; the d5 rolls 5 → 8 + 5 = 13.
        const d = recordingDie(5);
        expect(evaluateWoundsFormula('2xTB+1d5', actor({ toughness: 4 }), d.roll)).toBe(13);
        expect(d.faces).toEqual([5]); // exactly one d5 rolled, on the correct faces
    });

    it('substitutes multiple bonus references and needs no dice', () => {
        const d = recordingDie(99);
        // TB=4, SB=3 → "4+3" = 7; no dice term, so the roller is never called.
        expect(evaluateWoundsFormula('TB+SB', actor({ toughness: 4, strength: 3 }), d.roll)).toBe(7);
        expect(d.faces).toEqual([]);
    });

    it('sums multiple dice of the same term (NdM)', () => {
        // "3d5" with each die = 2 → 6.
        expect(evaluateWoundsFormula('3d5', actor({}), fixedDie(2))).toBe(6);
    });

    it('floors a negative result at 0 and short-circuits an empty formula', () => {
        // TB=4 → "4-10" = -6, floored to 0.
        expect(evaluateWoundsFormula('TB-10', actor({ toughness: 4 }), fixedDie(1))).toBe(0);
        expect(evaluateWoundsFormula('', actor({}))).toBe(0);
    });

    // Regression: line-92 `new Roll(evaluated).evaluateSync()` carried the same
    // V14 sync-die throw as the fate path — every wounds formula with a dice term
    // returned 0. The default roller must roll a real, in-range wounds value.
    it('default roller rolls a real wounds value without throwing (V14 sync-die regression)', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        for (let i = 0; i < 50; i++) {
            const value = evaluateWoundsFormula('2xTB+1d5+2', actor({ toughness: 4 }));
            // 8 + [1..5] + 2 → 11..15
            expect(value).toBeGreaterThanOrEqual(11);
            expect(value).toBeLessThanOrEqual(15);
        }
        expect(errSpy).not.toHaveBeenCalled();
    });

    it('returns 0 on a malformed dice expression (caught, not thrown)', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(evaluateWoundsFormula('TB + garbage!!', actor({ toughness: 4 }), fixedDie(1))).toBe(0);
    });
});
