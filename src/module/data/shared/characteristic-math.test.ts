import { describe, expect, it } from 'vitest';
import { applyCharacteristicRollData, applyEffectiveCharacteristicFields, computeCharacteristicTotals } from './characteristic-math.ts';

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

    it('prefers the effective value/bonus when present (#415)', () => {
        const data: Record<string, number> = {};
        applyCharacteristicRollData(data, {
            strength: { short: 'S', total: 40, bonus: 4, effectiveValue: 40, effectiveBonus: 6 },
        });
        // Effective bonus (+2 bonus-only) flows into the roll-data bag.
        expect(data['SB']).toBe(6);
        expect(data['S']).toBe(40);
        expect(data['strength']).toBe(40);
    });
});

describe('applyEffectiveCharacteristicFields (#415)', () => {
    it('mirrors total into effectiveValue and adds no bonus by default', () => {
        const char = { total: 42, bonus: 4, effectiveValue: 0, bonusModifier: 0, effectiveBonus: 0 };
        applyEffectiveCharacteristicFields(char);
        expect(char).toEqual({ total: 42, bonus: 4, effectiveValue: 42, bonusModifier: 0, effectiveBonus: 4 });
    });

    it('folds a bonus-only modifier into the effective bonus without touching the value', () => {
        const char = { total: 40, bonus: 4, effectiveValue: 0, bonusModifier: 0, effectiveBonus: 0 };
        applyEffectiveCharacteristicFields(char, 2);
        expect(char.effectiveValue).toBe(40); // value unchanged by a bonus-only modifier
        expect(char.bonusModifier).toBe(2);
        expect(char.effectiveBonus).toBe(6); // 4 base + 2 bonus-only
    });

    it('supports a negative bonus-only modifier', () => {
        const char = { total: 50, bonus: 5, effectiveValue: 0, bonusModifier: 0, effectiveBonus: 0 };
        applyEffectiveCharacteristicFields(char, -1);
        expect(char.effectiveBonus).toBe(4);
    });
});
