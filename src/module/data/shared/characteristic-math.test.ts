import { describe, expect, it } from 'vitest';
import { applyCharacteristicRollData, computeCharacteristicTotals } from './characteristic-math.ts';

describe('computeCharacteristicTotals (#271)', () => {
    it('NPC path: total = base + modifier, bonus = tens digit', () => {
        expect(computeCharacteristicTotals(45, 5, 0)).toEqual({ total: 50, bonus: 5 });
        expect(computeCharacteristicTotals(38, 0, 0)).toEqual({ total: 38, bonus: 3 });
    });

    it('PC extra term folds in advance*5 - damage', () => {
        // base 30 + modifier 0 + (advance 2 * 5 - damage 0) = 40 → bonus 4
        expect(computeCharacteristicTotals(30, 0, 0, 2 * 5 - 0)).toEqual({ total: 40, bonus: 4 });
        // damage subtracts: base 40 + (advance 0) - damage 5 = 35 → bonus 3
        expect(computeCharacteristicTotals(40, 0, 0, -5)).toEqual({ total: 35, bonus: 3 });
    });

    it('unnatural >= 2 multiplies the bonus; 0/1 leave it untouched', () => {
        expect(computeCharacteristicTotals(50, 0, 2)).toEqual({ total: 50, bonus: 10 });
        expect(computeCharacteristicTotals(50, 0, 3)).toEqual({ total: 50, bonus: 15 });
        expect(computeCharacteristicTotals(50, 0, 1).bonus).toBe(5);
    });
});

describe('applyCharacteristicRollData (#271)', () => {
    it('spreads short/key → total and shortB → bonus', () => {
        const data: Record<string, number> = {};
        applyCharacteristicRollData(data, { weaponSkill: { short: 'WS', total: 45, bonus: 4 } });
        expect(data['WS']).toBe(45);
        expect(data['WSB']).toBe(4);
        expect(data['weaponSkill']).toBe(45);
    });
});
