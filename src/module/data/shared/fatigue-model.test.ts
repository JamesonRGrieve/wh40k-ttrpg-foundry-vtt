import { afterEach, describe, expect, it, vi } from 'vitest';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import { fatigueModelForLine } from './fatigue-model.ts';

/** The fatigue model a line's PCs and NPCs share (#114, #420). */
describe('fatigueModelForLine', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('gives each line its RAW model: halving for DH1 / DH2, flat for RT / DW / BC / OW, the condition for IM', () => {
        expect(['dh1', 'dh2'].map((line) => fatigueModelForLine(line).model)).toEqual(['halving', 'halving']);
        expect(['rt', 'dw', 'bc', 'ow'].map((line) => fatigueModelForLine(line).model)).toEqual(['flat', 'flat', 'flat', 'flat']);
        expect(fatigueModelForLine('im').model).toBe('condition');
    });

    it('falls back to the flat model for an unknown or missing line', () => {
        expect(fatigueModelForLine('nope')).toEqual(FATIGUE_MODES.flat);
        expect(fatigueModelForLine(undefined)).toEqual(FATIGUE_MODES.flat);
    });

    it('takes the model the world setting forces', () => {
        vi.stubGlobal('game', { settings: { get: () => 'flat' } });
        expect(fatigueModelForLine('dh2')).toEqual(FATIGUE_MODES.flat);
    });
});
