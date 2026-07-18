import { describe, expect, it } from 'vitest';
import type { DynamicModifierEntry } from '../data/shared/modifiers-template.ts';
import type { DynamicModifierItemLike } from '../rules/dynamic-modifiers.ts';
import { type AttackDataLike, Hit, replaceDamageDieWithDoS, type DamageDieResult } from './damage-data.ts';

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
        const dice: DamageDieResult[] = [{ result: 1, discarded: true }, { result: 6, active: false }, { result: 5 }];
        const outcome = replaceDamageDieWithDoS(dice, 3);
        expect(outcome?.replacedIndex).toBe(0);
        expect(dice[2]?.result).toBe(3);
    });

    it('returns null when there is no eligible die or DoS is negative', () => {
        expect(replaceDamageDieWithDoS([], 4)).toBeNull();
        expect(replaceDamageDieWithDoS([{ result: 2 }], -1)).toBeNull();
        expect(replaceDamageDieWithDoS([{ result: 2 }], 4, 5)).toBeNull();
    });

    it('still mutates when DoS equals or is below the lowest die (negative delta is on the caller)', () => {
        // Per core.md L10398-10414 the replacement is the attacker's choice;
        // the rules engine does not gate on profitability. The mutation
        // applies and the delta is reported so callers can decide whether
        // to commit.
        const dice: DamageDieResult[] = [{ result: 7 }, { result: 5 }, { result: 9 }];
        const outcome = replaceDamageDieWithDoS(dice, 3);
        expect(outcome).toEqual({ replacedIndex: 1, previous: 5, delta: -2 });
        expect(dice[1]?.result).toBe(3);
    });
});

describe('Hit.replaceDamageDieWithDoS (#129)', () => {
    it('adjusts the running damage total by the replacement delta', () => {
        const hit = new Hit();
        hit.damage = 7 + 2 + 5;
        // Hit.damageRoll is Foundry's Roll | undefined; the implementation only
        // reads `terms[].results[]`, so a structural mock with just that shape
        // is what the test exercises. Assigning via Object.assign keeps the
        // structural cast inside one statement without a chained `as unknown`.
        const mockRoll = {
            terms: [
                {
                    results: [
                        { result: 7, active: true },
                        { result: 2, active: true },
                        { result: 5, active: true },
                    ],
                },
            ],
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's RollTerm union doesn't surface DiceTerm.results on its public type; structural mock matches the runtime shape Hit.replaceDamageDieWithDoS reads
        hit.damageRoll = mockRoll as unknown as Hit['damageRoll'];

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

describe('Hit.applyDynamicModifiers — data-driven damage hooks (Direction #7)', () => {
    function scale(o: Partial<DynamicModifierEntry['scale']>): DynamicModifierEntry['scale'] {
        return { source: '', field: 'bonus', factor: 1, round: 'up', multiplier: '', min: null, max: null, ...o };
    }
    function makeHook(overrides: Partial<DynamicModifierEntry> = {}): DynamicModifierEntry {
        return {
            target: 'damage',
            targetKey: '',
            side: 'attacker',
            mode: 'add',
            value: 0,
            valueFormula: '',
            scale: scale({}),
            when: 'always',
            condition: '',
            conditionValue: '',
            duration: {
                unit: 'instant',
                value: 0,
                valueFormula: '',
                sustained: false,
                upkeep: '',
                stacking: 'none',
                save: { characteristic: '', difficulty: 0 },
                aftereffect: { target: 'characteristic', targetKey: '', value: 0, valueFormula: '', durationUnit: 'instant', durationValue: 0 },
            },
            formula: '',
            label: '',
            ...overrides,
        };
    }
    function item(name: string, hooks: DynamicModifierEntry[]): DynamicModifierItemLike {
        return { name, system: { modifiers: { dynamicModifiers: hooks } } };
    }
    /** A minimal AttackDataLike whose actor exposes fuzzy characteristic bonuses (WS 4, BS 3, else 2) + owned items. */
    function attackData(items: DynamicModifierItemLike[], opts: { isMelee?: boolean; isRanged?: boolean; dos?: number } = {}): AttackDataLike {
        const bonus = (key: string): number => (key === 'WeaponSkill' ? 4 : key === 'BallisticSkill' ? 3 : 2);
        return {
            rollData: {
                weapon: { system: {}, isMelee: opts.isMelee ?? true, isRanged: opts.isRanged ?? false },
                sourceActor: {
                    getCharacteristicFuzzy: (key: string) => ({ bonus: bonus(key) }),
                    hasTalent: () => false,
                    hasTalentFuzzyWords: () => false,
                    items,
                },
                roll: null,
                action: 'Standard Attack',
                rangeName: '',
                attackSpecials: [],
                dos: opts.dos ?? 3,
                eyeOfVengeance: false,
                hasAttackSpecial: () => false,
                getAttackSpecial: () => ({ level: 0 }),
            },
        };
    }

    it('merges a melee half-WSB damage hook (Crushing Blow shape) into the modifier map', async () => {
        const crushing = item('Crushing Blow', [makeHook({ target: 'damage', condition: 'melee', scale: scale({ source: 'ws', factor: 0.5, round: 'up' }) })]);
        const hit = new Hit();
        hit.penetration = 4;
        await hit.applyDynamicModifiers(attackData([crushing], { isMelee: true }));
        expect(hit.modifiers['crushing blow']).toBe(2); // ceil(4 / 2)
    });

    it('routes a penetration hook into the penetration map', async () => {
        const hammer = item('Hammer Blow', [makeHook({ target: 'penetration', scale: scale({ source: 's', factor: 0.5, round: 'up' }) })]);
        const hit = new Hit();
        await hit.applyDynamicModifiers(attackData([hammer]));
        expect(hit.penetrationModifiers['hammer blow']).toBe(1); // ceil(2 / 2)
    });

    it('skips a ranged-only hook on a melee attack, and is a no-op for hookless items', async () => {
        const mighty = item('Mighty Shot', [makeHook({ target: 'damage', condition: 'ranged', scale: scale({ source: 'bs', factor: 0.5, round: 'up' }) })]);
        const bare: DynamicModifierItemLike = { name: 'Plain', system: {} };
        const hit = new Hit();
        await hit.applyDynamicModifiers(attackData([mighty, bare], { isMelee: true, isRanged: false }));
        expect(hit.modifiers['mighty shot']).toBeUndefined();
        expect(Object.keys(hit.modifiers)).toEqual([]);
    });
});
