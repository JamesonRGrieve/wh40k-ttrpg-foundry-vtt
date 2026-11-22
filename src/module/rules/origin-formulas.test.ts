import { describe, expect, it } from 'vitest';
import { fateForRoll, parseFateFormula, woundsRollFormula } from './origin-formulas.ts';

describe('origin Wounds and Fate formulas (#760)', () => {
    it('a fixed Wounds formula rolls as printed', () => {
        expect(woundsRollFormula('8+1d5', 4)).toBe('8+1d5');
    });

    it('NxTB becomes N times the Toughness bonus', () => {
        expect(woundsRollFormula('2xTB+1d5+2', 4)).toBe('8+1d5+2');
        expect(woundsRollFormula('2xtb+1d5', 3)).toBe('6+1d5');
    });

    it('a fixed Fate formula needs no roll', () => {
        expect(parseFateFormula('3')).toEqual({ kind: 'fixed', value: 3 });
        expect(fateForRoll('3', 9)).toBe(3);
    });

    it('a banded Fate formula reads the d10', () => {
        const formula = '(1-5|=2),(6-9|=3),(10|=4)';
        expect(parseFateFormula(formula).kind).toBe('d10');
        expect(fateForRoll(formula, 5)).toBe(2);
        expect(fateForRoll(formula, 6)).toBe(3);
        expect(fateForRoll(formula, 10)).toBe(4);
    });

    it('an empty or unreadable Fate formula gives none', () => {
        expect(parseFateFormula('')).toEqual({ kind: 'none' });
        expect(fateForRoll('', 7)).toBe(0);
    });
});
