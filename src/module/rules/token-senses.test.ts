import { describe, expect, it } from 'vitest';
import { resolveSenses, type SenseEntry, senseBearersOf, tokenSensesUpdate } from './token-senses.ts';

const darkSight: SenseEntry = { kind: 'vision', mode: 'darkvision', range: null, rangeSource: '' };
const unnaturalSenses: SenseEntry = { kind: 'detection', mode: 'senseAll', range: 15, rangeSource: 'specialization' };

describe('resolveSenses', () => {
    it('is empty for an actor with no hooks', () => {
        expect(resolveSenses([])).toEqual({ vision: null, detection: {} });
    });

    it('takes a vision mode and its unlimited range', () => {
        expect(resolveSenses([{ senses: [darkSight] }]).vision).toEqual({ mode: 'darkvision', range: null });
    });

    it('reads an "(X)" range from the owned item specialization', () => {
        expect(resolveSenses([{ senses: [unnaturalSenses], specialization: '40m' }]).detection).toEqual({ senseAll: 40 });
        expect(resolveSenses([{ senses: [unnaturalSenses], specialization: 'Unnatural Senses (30 metres)' }]).detection).toEqual({ senseAll: 30 });
    });

    it('falls back to the authored range when the specialization carries no number', () => {
        expect(resolveSenses([{ senses: [unnaturalSenses], specialization: '' }]).detection).toEqual({ senseAll: 15 });
    });

    it('reads a level-sourced range, falling back when the level is 0', () => {
        const byLevel: SenseEntry = { kind: 'detection', mode: 'feelTremor', range: 5, rangeSource: 'level' };
        expect(resolveSenses([{ senses: [byLevel], level: 12 }]).detection).toEqual({ feelTremor: 12 });
        expect(resolveSenses([{ senses: [byLevel], level: 0 }]).detection).toEqual({ feelTremor: 5 });
    });

    it('keeps the widest range when two items declare the same mode (unlimited wins)', () => {
        const a = { senses: [unnaturalSenses], specialization: '10' };
        const b = { senses: [unnaturalSenses], specialization: '40' };
        expect(resolveSenses([a, b]).detection).toEqual({ senseAll: 40 });
        const limited: SenseEntry = { kind: 'vision', mode: 'darkvision', range: 20, rangeSource: '' };
        expect(resolveSenses([{ senses: [limited] }, { senses: [darkSight] }]).vision).toEqual({ mode: 'darkvision', range: null });
    });

    it('ignores a hook with a blank mode', () => {
        expect(resolveSenses([{ senses: [{ kind: 'vision', mode: '', range: 10, rangeSource: '' }] }]).vision).toBeNull();
    });
});

describe('tokenSensesUpdate', () => {
    it('always enables sight, leaving the vision mode alone without a hook', () => {
        expect(tokenSensesUpdate({ vision: null, detection: {} })).toEqual({ 'sight.enabled': true });
    });

    it('applies the vision mode and range and each detection mode', () => {
        expect(tokenSensesUpdate({ vision: { mode: 'darkvision', range: null }, detection: { senseAll: 40 } })).toEqual({
            'sight.enabled': true,
            'sight.visionMode': 'darkvision',
            'sight.range': null,
            'detectionModes.senseAll': { enabled: true, range: 40 },
        });
    });
});

describe('senseBearersOf', () => {
    it('collects only items that carry sense hooks, with their specialization and level', () => {
        const items = [
            { system: { modifiers: { senses: [unnaturalSenses] }, specialization: '40m', level: 0 } },
            { system: { modifiers: { senses: [] } } },
            { system: { damage: '1d10' } },
            { system: { modifiers: { combat: {} } } },
        ];
        expect(senseBearersOf(items)).toEqual([{ senses: [unnaturalSenses], specialization: '40m', level: 0 }]);
    });
});
