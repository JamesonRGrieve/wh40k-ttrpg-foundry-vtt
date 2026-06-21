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

    it('clampTotalToZero floors the total at 0 before deriving the bonus (#365)', () => {
        // Default (no clamp) leaves a negative total negative.
        expect(computeCharacteristicTotals(10, 0, 0, -30)).toEqual({ total: -20, bonus: -2 });
        // Clamped: total floors at 0 → bonus 0.
        expect(computeCharacteristicTotals(10, 0, 0, -30, true)).toEqual({ total: 0, bonus: 0 });
        // Clamp is a no-op when the total is already non-negative.
        expect(computeCharacteristicTotals(45, 0, 0, 5, true)).toEqual({ total: 50, bonus: 5 });
    });

    it('post-item recompute (#365) matches the helper, incl. clamp and unnatural', () => {
        // Mirror creature.ts `_applyModifiersToCharacteristics`: extra folds in
        // advance*5 - damage + (originPath + item) modifier; total clamps at 0.
        const recompute = (
            char: { base: number; modifier: number; unnatural: number; advance: number; damage: number },
            totalMod: number,
        ): { total: number; bonus: number } => {
            const baseTotal = char.base + char.advance * 5 + char.modifier;
            const total = Math.max(0, baseTotal + totalMod - char.damage);
            const baseBonus = Math.floor(total / 10);
            const bonus = char.unnatural >= 2 ? baseBonus * char.unnatural : baseBonus;
            return { total, bonus };
        };
        const cases: Array<[{ base: number; modifier: number; unnatural: number; advance: number; damage: number }, number]> = [
            [{ base: 30, modifier: 0, unnatural: 0, advance: 2, damage: 0 }, 5],
            [{ base: 40, modifier: 5, unnatural: 0, advance: 0, damage: 8 }, -3],
            [{ base: 35, modifier: 0, unnatural: 3, advance: 1, damage: 0 }, 10],
            [{ base: 10, modifier: 0, unnatural: 2, advance: 0, damage: 0 }, -40], // clamps to 0
        ];
        for (const [char, totalMod] of cases) {
            const viaHelper = computeCharacteristicTotals(char.base, char.modifier, char.unnatural, char.advance * 5 - char.damage + totalMod, true);
            expect(viaHelper).toEqual(recompute(char, totalMod));
        }
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
