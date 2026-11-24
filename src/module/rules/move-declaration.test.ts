import { describe, expect, it } from 'vitest';
import { actionCostOf, allowanceFor, movePrompt, type MoveRates } from './move-declaration.ts';

/** AB 3: Half 3 m, Full 6 m, Run 18 m. */
const RATES: MoveRates = { half: 3, full: 6, run: 18 };

describe('the first move of a turn (#805)', () => {
    it('within the Half Move: a Half Action, with Run offered', () => {
        expect(movePrompt('none', 0, 2, RATES)).toEqual({ kind: 'declare', choices: ['half', 'run'] });
    });
    it('past the Half Move: straight to a Full Action, with Run offered; no Half', () => {
        expect(movePrompt('none', 0, 5, RATES)).toEqual({ kind: 'declare', choices: ['full', 'run'] });
    });
    it('past the Full Move: only Run', () => {
        expect(movePrompt('none', 0, 12, RATES)).toEqual({ kind: 'declare', choices: ['run'] });
    });
    it('past the Run Move: refused', () => {
        expect(movePrompt('none', 0, 20, RATES)).toEqual({ kind: 'refuse', remaining: 18 });
    });
});

describe('moving again in the same turn', () => {
    it('within what the declaration allows: no prompt', () => {
        expect(movePrompt('half', 1, 2, RATES)).toEqual({ kind: 'allow' });
        expect(movePrompt('full', 4, 2, RATES)).toEqual({ kind: 'allow' });
        expect(movePrompt('run', 10, 8, RATES)).toEqual({ kind: 'allow' });
    });
    it('past a Half Move: the other Half Action, up to two Half Moves', () => {
        expect(movePrompt('half', 3, 2, RATES)).toEqual({ kind: 'secondHalf' });
        expect(movePrompt('twoHalves', 3, 3, RATES)).toEqual({ kind: 'allow' });
    });
    it('past two Half Moves, or past a Full Move or Run: refused with what is left', () => {
        expect(movePrompt('half', 3, 4, RATES)).toEqual({ kind: 'refuse', remaining: 0 });
        expect(movePrompt('full', 4, 3, RATES)).toEqual({ kind: 'refuse', remaining: 2 });
    });
    it('Disengage allows a Half Move', () => {
        expect(movePrompt('disengage', 0, 3, RATES)).toEqual({ kind: 'allow' });
        expect(movePrompt('disengage', 0, 4, RATES)).toEqual({ kind: 'refuse', remaining: 3 });
    });
});

describe('costs and allowances', () => {
    it('Half and the second Half cost a Half Action; Full and Run a Full Action', () => {
        expect([actionCostOf('half'), actionCostOf('secondHalf'), actionCostOf('full'), actionCostOf('run')]).toEqual(['half', 'half', 'full', 'full']);
    });
    it('each declaration allows its distance', () => {
        expect(['none', 'half', 'twoHalves', 'full', 'run', 'disengage'].map((d) => allowanceFor(d as Parameters<typeof allowanceFor>[0], RATES))).toEqual([
            0, 3, 6, 6, 18, 3,
        ]);
    });
});
