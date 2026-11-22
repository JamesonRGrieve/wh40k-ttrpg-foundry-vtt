import { describe, expect, it } from 'vitest';
import {
    type CharacteristicGenerationRules,
    characteristicDice,
    characteristicRollFormula,
    DEFAULT_CHARACTERISTIC_GENERATION,
    flatGeneration,
    originModifierAddsToRoll,
    pointBuyStart,
    rolledCharacteristic,
    withExperienced,
} from './characteristic-generation.ts';

// DH2 as its core rulebook prints it (Generating Characteristics; Allocating Points).
const DH2: CharacteristicGenerationRules = {
    roll: { dice: '2d10', base: 20, originModifiers: 'keep-dice', keepDice: '3d10' },
    pointBuy: { base: 25, pool: 60, cap: 40, raw: true },
    experienced: { rollBase: 25, pointBuyBase: 30, cap: 45 },
};

describe('characteristic generation (#760)', () => {
    it('a flat line adds the origin modifier to 2d10 plus its base', () => {
        const rt = flatGeneration(25);
        expect(characteristicDice(rt, 5)).toBe('2d10');
        expect(characteristicRollFormula(rt, 5)).toBe('2d10 + 25 + 5');
        expect(characteristicRollFormula(rt, -5)).toBe('2d10 + 25 - 5');
        expect(characteristicRollFormula(rt, 0)).toBe('2d10 + 25');
        expect(rolledCharacteristic(rt, 25, 11, 5)).toBe(41);
    });

    it("DH2's home world + rolls 3d10 keep the highest two, − the lowest two, and adds nothing", () => {
        expect(characteristicDice(DH2, 5)).toBe('3d10kh2');
        expect(characteristicDice(DH2, -5)).toBe('3d10kl2');
        expect(characteristicDice(DH2, 0)).toBe('2d10');
        expect(characteristicRollFormula(DH2, 5)).toBe('3d10kh2 + 20');
        expect(characteristicRollFormula(DH2, -5)).toBe('3d10kl2 + 20');
        expect(originModifierAddsToRoll(DH2, 5)).toBe(false);
        expect(rolledCharacteristic(DH2, 20, 15, 5)).toBe(35);
    });

    it('point buy starts a + characteristic at 30 and a − at 20 in DH2', () => {
        expect(pointBuyStart(DH2.pointBuy.base, 5)).toBe(30);
        expect(pointBuyStart(DH2.pointBuy.base, -5)).toBe(20);
        expect(pointBuyStart(DH2.pointBuy.base, 0)).toBe(25);
    });

    it("DH2's experienced variant rolls on 25 and allocates from 30 to a cap of 45", () => {
        const exp = withExperienced(DH2);
        expect(exp.roll.base).toBe(25);
        expect(exp.pointBuy).toMatchObject({ base: 30, cap: 45, pool: 60 });
        expect(withExperienced(flatGeneration(30))).toEqual(flatGeneration(30));
    });

    it('a line without its own rules rolls 2d10 + 25, with unofficial point buy', () => {
        expect(DEFAULT_CHARACTERISTIC_GENERATION.roll).toMatchObject({ dice: '2d10', base: 25, originModifiers: 'flat' });
        expect(DEFAULT_CHARACTERISTIC_GENERATION.pointBuy.raw).toBe(false);
    });
});
