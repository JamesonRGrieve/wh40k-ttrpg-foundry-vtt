import { describe, expect, it } from 'vitest';
import { adjustedAllocation, pointBuySpent, setAllocation, type PointBuyRules } from './point-buy.ts';

const CHARS = ['weaponSkill', 'strength', 'agility'];
const rules = (over: Partial<PointBuyRules> = {}): PointBuyRules => ({ characteristics: CHARS, pool: 20, cap: 40, baseFor: () => 25, ...over });

describe('point-buy rules (#717)', () => {
    it('sums spends over the generated characteristics, counting negatives as 0', () => {
        expect(pointBuySpent({ weaponSkill: 5, strength: -3, agility: 4, influence: 9 }, CHARS)).toBe(9);
    });

    it('raises an allocation no further than the remaining pool', () => {
        expect(adjustedAllocation(rules({ cap: 99 }), { weaponSkill: 15, strength: 0 }, 'strength', 10)).toBe(5);
    });

    it('raises an allocation no further than the cap over the base', () => {
        expect(adjustedAllocation(rules(), { strength: 10 }, 'strength', 10)).toBe(15);
    });

    it('lowers an allocation no further than 0', () => {
        expect(adjustedAllocation(rules(), { agility: 3 }, 'agility', -10)).toBe(0);
    });

    it('leaves a key outside the generated characteristics alone', () => {
        expect(adjustedAllocation(rules(), { influence: 4 }, 'influence', 5)).toBe(4);
        expect(setAllocation(rules(), {}, 'influence', 5)).toBe(0);
    });

    it('sets an allocation outright, refunding its own spend before the pool check', () => {
        expect(setAllocation(rules({ cap: 99 }), { weaponSkill: 10, strength: 8 }, 'strength', 12)).toBe(10);
    });

    it('caps an outright set at the cap and floors bad input at 0', () => {
        expect(setAllocation(rules({ pool: 99 }), {}, 'agility', 30)).toBe(15);
        expect(setAllocation(rules(), {}, 'agility', Number.NaN)).toBe(0);
        expect(setAllocation(rules(), {}, 'agility', 3.9)).toBe(3);
    });
});
