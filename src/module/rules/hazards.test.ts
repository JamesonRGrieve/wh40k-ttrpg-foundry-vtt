import { describe, expect, it } from 'vitest';
import { ALL_SYSTEM_IDS } from '../config/game-systems/types.ts';
import {
    FALLING_DAMAGE_TYPE,
    FALLING_IGNORES_ARMOUR,
    HAZARD_RULES,
    SUFFOCATION_ENDGAME_DAMAGE,
    SUFFOCATION_FATIGUE_PER_FAILURE,
    SUFFOCATION_TEST_DIFFICULTY,
    fallingRuleKind,
    getFallingDamageBonus,
    getFallingDamageFormula,
    resolveSuffocation,
} from './hazards';

const PER_METRE_LINES = ['dh2', 'rt', 'dw', 'bc', 'ow'] as const;

describe('Falling (#118)', () => {
    it.each(PER_METRE_LINES)('%s: 1d10 plus 1 per metre fallen', (line) => {
        expect(getFallingDamageFormula(1, line)).toBe('1d10+1');
        expect(getFallingDamageFormula(2, line)).toBe('1d10+2');
        expect(getFallingDamageFormula(10, line)).toBe('1d10+10');
    });

    // Regression: the first cut rolled 1d10 per 2 metres, which no line prints.
    it('dh2: a 10m fall is 1d10+10, not 5d10', () => {
        expect(getFallingDamageFormula(10, 'dh2')).not.toBe('5d10');
    });

    it('truncates fractional metres and deals nothing for a zero or negative fall', () => {
        expect(getFallingDamageFormula(4.9, 'dh2')).toBe('1d10+4');
        expect(getFallingDamageFormula(0, 'dh2')).toBe('');
        expect(getFallingDamageFormula(-3, 'rt')).toBe('');
    });

    it('dh1: reads Table 7-27 by bracket', () => {
        expect(getFallingDamageFormula(2, 'dh1')).toBe('');
        expect(getFallingDamageFormula(3, 'dh1')).toBe('1d10+3');
        expect(getFallingDamageFormula(5, 'dh1')).toBe('1d10+3');
        expect(getFallingDamageFormula(6, 'dh1')).toBe('1d10+5');
        expect(getFallingDamageFormula(24, 'dh1')).toBe('1d10+17');
        expect(getFallingDamageFormula(25, 'dh1')).toBe('1d10+20');
        expect(getFallingDamageFormula(80, 'dh1')).toBe('1d10+20');
    });

    it('im: not modelled, so no formula', () => {
        expect(getFallingDamageFormula(10, 'im')).toBe('');
        expect(getFallingDamageBonus(10, 'im')).toBeNull();
        expect(fallingRuleKind('im')).toBeNull();
    });

    it('exposes the flat bonus and how the line derives it', () => {
        expect(getFallingDamageBonus(7, 'dh2')).toBe(7);
        expect(fallingRuleKind('dh2')).toBe('perMetre');
        expect(getFallingDamageBonus(7, 'dh1')).toBe(5);
        expect(fallingRuleKind('dh1')).toBe('table');
        expect(getFallingDamageBonus(1, 'dh1')).toBeNull();
    });

    it('falls are Impact damage that ignores armour', () => {
        expect(FALLING_DAMAGE_TYPE).toBe('Impact');
        expect(FALLING_IGNORES_ARMOUR).toBe(true);
    });

    it('declares a rule entry for every system id', () => {
        expect(Object.keys(HAZARD_RULES).sort()).toEqual([...ALL_SYSTEM_IDS].sort());
    });
});

describe('Suffocation (#118)', () => {
    it('conserving oxygen: minutes equal to Toughness Bonus', () => {
        expect(resolveSuffocation({ toughnessBonus: 4, strenuous: false, line: 'dh2' })?.allotment).toEqual({
            count: 4,
            unit: 'minute',
            strenuousUnsupported: false,
        });
    });

    // Regression: the first cut held breath for TB + WPB seconds, which no line prints.
    it('strenuous activity: rounds equal to twice Toughness Bonus', () => {
        expect(resolveSuffocation({ toughnessBonus: 4, strenuous: true, line: 'dh2' })?.allotment).toEqual({
            count: 8,
            unit: 'round',
            strenuousUnsupported: false,
        });
    });

    it('dh1 prints only the conserving allotment and flags a strenuous request', () => {
        expect(resolveSuffocation({ toughnessBonus: 3, strenuous: true, line: 'dh1' })?.allotment).toEqual({
            count: 3,
            unit: 'minute',
            strenuousUnsupported: true,
        });
    });

    it.each(['dh2', 'bc', 'ow'] as const)('%s: Unconscious and deprived of oxygen, dies after TB rounds', (line) => {
        const outcome = resolveSuffocation({ toughnessBonus: 5, strenuous: false, line });
        expect(outcome?.endgame).toBe('diesAfterTbRounds');
        expect(outcome?.roundsUntilDeath).toBe(5);
    });

    it.each(['dh1', 'rt', 'dw'] as const)('%s: Unconscious and deprived of oxygen, takes 1d10 a round', (line) => {
        const outcome = resolveSuffocation({ toughnessBonus: 5, strenuous: false, line });
        expect(outcome?.endgame).toBe('damagePerRound');
        expect(outcome?.roundsUntilDeath).toBe(0);
        expect(SUFFOCATION_ENDGAME_DAMAGE).toBe('1d10');
    });

    it('floors a negative Toughness Bonus at zero', () => {
        expect(resolveSuffocation({ toughnessBonus: -2, strenuous: true, line: 'rt' })?.allotment.count).toBe(0);
    });

    it('im: not modelled', () => {
        expect(resolveSuffocation({ toughnessBonus: 4, strenuous: false, line: 'im' })).toBeNull();
    });

    it('the per-interval test is Challenging (+0) and a failure costs 1 Fatigue', () => {
        expect(SUFFOCATION_TEST_DIFFICULTY).toBe(0);
        expect(SUFFOCATION_FATIGUE_PER_FAILURE).toBe(1);
    });
});
