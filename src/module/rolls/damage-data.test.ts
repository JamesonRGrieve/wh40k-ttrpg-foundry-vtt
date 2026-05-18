import { describe, expect, it } from 'vitest';
import { Hit, replaceDamageDieWithDoS, type DamageDieResult } from './damage-data.ts';

describe('replaceDamageDieWithDoS (#129)', () => {
    it('replaces the lowest active die by default', () => {
        const dice: DamageDieResult[] = [{ result: 7 }, { result: 2 }, { result: 5 }];
        const outcome = replaceDamageDieWithDoS(dice, 4);
        expect(outcome).toEqual({ replacedIndex: 1, previous: 2, delta: 2 });
        expect(dice[1]?.result).toBe(4);
    });

    it('replaces the attacker-selected die when an index is given', () => {
        const dice: DamageDieResult[] = [{ result: 7 }, { result: 2 }];
        const outcome = replaceDamageDieWithDoS(dice, 9, 0);
        expect(outcome).toEqual({ replacedIndex: 0, previous: 7, delta: 2 });
        expect(dice[0]?.result).toBe(9);
    });

    it('considers only active, non-discarded dice', () => {
        const dice: DamageDieResult[] = [
            { result: 1, discarded: true },
            { result: 6, active: false },
            { result: 5 },
        ];
        const outcome = replaceDamageDieWithDoS(dice, 3);
        expect(outcome?.replacedIndex).toBe(0);
        expect(dice[2]?.result).toBe(3);
    });

    it('returns null when there is no eligible die or DoS is negative', () => {
        expect(replaceDamageDieWithDoS([], 4)).toBeNull();
        expect(replaceDamageDieWithDoS([{ result: 2 }], -1)).toBeNull();
        expect(replaceDamageDieWithDoS([{ result: 2 }], 4, 5)).toBeNull();
    });
});

describe('Hit.replaceDamageDieWithDoS (#129)', () => {
    it('adjusts the running damage total by the replacement delta', () => {
        const hit = new Hit();
        hit.damage = 7 + 2 + 5;
        hit.damageRoll = {
            terms: [{ results: [{ result: 7, active: true }, { result: 2, active: true }, { result: 5, active: true }] }],
        } as unknown as Hit['damageRoll'];

        const replaced = hit.replaceDamageDieWithDoS(6);

        expect(replaced).toBe(true);
        expect(hit.damage).toBe(18);
        expect(hit.totalDamage).toBe(18);
    });

    it('returns false when the hit has no damage roll', () => {
        const hit = new Hit();
        expect(hit.replaceDamageDieWithDoS(5)).toBe(false);
    });
});
