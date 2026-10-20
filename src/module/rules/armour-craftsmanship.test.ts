import { describe, expect, it } from 'vitest';
import { armourCraftsmanshipFor } from '../config/game-systems/index.ts';
import { type ArmourCraftsmanshipTier, armourCraftsmanshipTier } from './armour-craftsmanship.ts';
import { CRAFTSMANSHIP_TIERS, getArmourCraftsmanshipEffect } from './ow-craftsmanship.ts';

/** Each line's printed armour craftsmanship (#679), as `[line, tier, agility, first-attack AP, half weight, AP]`. */
const PRINTED: ReadonlyArray<readonly [string, ArmourCraftsmanshipTier, number, number, boolean, number]> = [
    // DH1 core p. 144, RT core p. 137, OW core: the same table.
    ...(['dh1', 'rt', 'ow'] as const).flatMap(
        (line) =>
            [
                [line, 'poor', -10, 0, false, 0],
                [line, 'common', 0, 0, false, 0],
                [line, 'good', 0, 1, false, 0],
                [line, 'best', 0, 0, true, 1],
            ] as const,
    ),
    // DH2 core p. 141: Best +1 AP at each covered location; Maximum Agility is not modelled here.
    ['dh2', 'poor', 0, 0, false, 0],
    ['dh2', 'good', 0, 0, false, 0],
    ['dh2', 'best', 0, 0, false, 1],
    // BC core: Poor −10 Agility, Good a social bonus, Best half weight and +1 AP.
    ['bc', 'poor', -10, 0, false, 0],
    ['bc', 'good', 0, 0, false, 0],
    ['bc', 'best', 0, 0, true, 1],
    // DW core: Exceptional (Good) and Master-Crafted (Best); no Poor armour.
    ['dw', 'poor', 0, 0, false, 0],
    ['dw', 'good', 0, 1, false, 0],
    ['dw', 'best', 0, 0, true, 1],
];

describe('armourCraftsmanshipFor — each line as printed', () => {
    it.each(PRINTED)('%s %s armour', (line, tier, agilityModifier, apFirstHit, halfWeight, flatApBonus) => {
        expect(armourCraftsmanshipFor(line, tier)).toEqual({ agilityModifier, apFirstHit, halfWeight, flatApBonus });
    });

    it('gives Best armour +1 AP in every line', () => {
        for (const line of ['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow']) expect(armourCraftsmanshipFor(line, 'best').flatApBonus).toBe(1);
    });

    it('gives an unknown line, or none, no effect', () => {
        expect(armourCraftsmanshipFor(undefined, 'best')).toEqual({ agilityModifier: 0, apFirstHit: 0, halfWeight: false, flatApBonus: 0 });
        expect(armourCraftsmanshipFor('nope', 'best').flatApBonus).toBe(0);
    });

    it("is the very table Only War's craftsmanship panel reads (#158)", () => {
        for (const tier of CRAFTSMANSHIP_TIERS) expect(armourCraftsmanshipFor('ow', tier)).toBe(getArmourCraftsmanshipEffect(tier));
    });
});

describe('armourCraftsmanshipTier', () => {
    it('reads the four shared tiers as themselves', () => {
        for (const tier of ['poor', 'common', 'good', 'best'] as const) expect(armourCraftsmanshipTier(tier)).toBe(tier);
    });

    it("reads DW's Exceptional as Good and Master-Crafted as Best", () => {
        expect(armourCraftsmanshipTier('exceptional')).toBe('good');
        expect(armourCraftsmanshipTier('master')).toBe('best');
        expect(armourCraftsmanshipTier('master-crafted')).toBe('best');
    });

    it('reads anything else as Common', () => {
        expect(armourCraftsmanshipTier(undefined)).toBe('common');
        expect(armourCraftsmanshipTier('cheap')).toBe('common');
    });

    it('gives DW Exceptional armour the first-attack AP and Master-Crafted the +1 AP', () => {
        expect(armourCraftsmanshipFor('dw', 'exceptional').apFirstHit).toBe(1);
        expect(armourCraftsmanshipFor('dw', 'master').flatApBonus).toBe(1);
    });
});
