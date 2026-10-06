import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    extremeResultIndex,
    isRollKeepMode,
    keepModeCardNote,
    keepModeDice,
    keepModeFormula,
    keepModeOptions,
    registerKeepExtremeModifier,
} from './roll-keep.ts';

/**
 * Homebrew roll-twice-keep-one tests: Advantage keeps the lower d100, Disadvantage
 * the higher, Emphasis the result furthest from 50 (first die on a tie).
 */

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('keepModeFormula', () => {
    it('rolls one d100 normally and two dice for every keep mode', () => {
        expect(keepModeFormula('normal')).toBe('1d100');
        expect(keepModeFormula('advantage')).toBe('2d100kl');
        expect(keepModeFormula('disadvantage')).toBe('2d100kh');
        expect(keepModeFormula('emphasis')).toBe('2d100ke');
    });
});

describe('extremeResultIndex — Emphasis keeps the result furthest from 50', () => {
    it('keeps the more extreme roll at either end', () => {
        expect(extremeResultIndex([45, 92])).toBe(1);
        expect(extremeResultIndex([8, 60])).toBe(0);
        expect(extremeResultIndex([51, 49])).toBe(0);
    });

    it('keeps the first die on a tie', () => {
        expect(extremeResultIndex([30, 70])).toBe(0);
        expect(extremeResultIndex([70, 30])).toBe(0);
    });

    it('returns -1 for no dice', () => {
        expect(extremeResultIndex([])).toBe(-1);
    });
});

describe('the `ke` die modifier', () => {
    it('registers on core Die.MODIFIERS and discards every result but the most extreme', () => {
        interface Term {
            results: Array<{ result: number; active: boolean; discarded?: boolean }>;
        }
        const modifiers: Record<string, string | ((this: Term, modifier: string) => void)> = {};
        vi.stubGlobal('foundry', { dice: { terms: { Die: { MODIFIERS: modifiers } } } });
        registerKeepExtremeModifier();
        expect(modifiers['ke']).toBeTypeOf('function');
        const keepExtreme = modifiers['ke'] as (this: Term, modifier: string) => void;

        const term: Term = {
            results: [
                { result: 40, active: true },
                { result: 3, active: true },
            ],
        };
        keepExtreme.call(term, 'ke');
        expect(term.results).toEqual([
            { result: 40, active: false, discarded: true },
            { result: 3, active: true },
        ]);
    });
});

describe('reading the dice back for the card', () => {
    const resolved = [
        { result: 34, active: true },
        { result: 71, active: false, discarded: true },
    ];

    it('names the kept and discarded dice', () => {
        expect(keepModeDice(resolved)).toEqual({ kept: 34, discarded: [71] });
    });

    it('has no dice note for a single-die roll', () => {
        expect(keepModeDice([{ result: 34, active: true }])).toBeNull();
    });

    it('writes a card line for a keep mode and none for a normal roll', () => {
        vi.stubGlobal('game', {
            i18n: {
                localize: (key: string): string => key.split('.').pop() ?? key,
                format: (_key: string, data: Record<string, string>): string => `${data['mode'] ?? ''}: ${data['kept'] ?? ''}/${data['discarded'] ?? ''}`,
            },
        });
        expect(keepModeCardNote('advantage', { dice: [{ results: resolved }] })).toBe('Advantage: 34/71');
        expect(keepModeCardNote('normal', { dice: [{ results: resolved }] })).toBe('');
    });
});

describe('the roll dialog selector', () => {
    it('lists every mode with langpack keys, marking the selected one active', () => {
        const options = keepModeOptions('emphasis');
        expect(options.map((o) => [o.mode, o.active])).toEqual([
            ['normal', false],
            ['advantage', false],
            ['disadvantage', false],
            ['emphasis', true],
        ]);
        expect(options[3]?.labelKey).toBe('WH40K.Roll.KeepMode.Emphasis');
        expect(options[3]?.hintKey).toBe('WH40K.Roll.KeepMode.EmphasisHint');
    });

    it('accepts only known modes from the button data', () => {
        expect(isRollKeepMode('disadvantage')).toBe(true);
        expect(isRollKeepMode('triumph')).toBe(false);
    });
});
