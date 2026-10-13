import { describe, expect, it } from 'vitest';
import { currentCombatRound, parryingWeapon, reactionHookSources } from './counter-attack-flow.ts';

describe('reactionHookSources (#603)', () => {
    it('collects the hooks each talent declares, and nothing from other items', () => {
        const hook = { trigger: 'parrySuccess', grants: 'attack', limit: 'perRound', attackModifier: -20 } as const;
        const items = [
            { type: 'talent', name: 'Counter Attack', system: { reactionHooks: [hook] } },
            { type: 'talent', name: 'Ambidextrous', system: { reactionHooks: [] } },
            { type: 'weapon', name: 'Sword', system: {} },
        ];
        expect(reactionHookSources(items)).toEqual([{ name: 'Counter Attack', hooks: [hook] }]);
    });
});

describe('currentCombatRound', () => {
    it('stamps a started combat’s round (not the combatant turn); nothing out of combat', () => {
        expect(currentCombatRound({ id: 'c1', started: true, round: 2 })).toEqual({ combatId: 'c1', round: 2 });
        expect(currentCombatRound({ id: 'c1', started: false, round: 0 })).toBeNull();
        expect(currentCombatRound(null)).toBeNull();
    });
});

describe('parryingWeapon', () => {
    it('picks the first equipped melee weapon that can parry; bare hands otherwise', () => {
        const maul = { id: 'maul', isMelee: true, equipped: true, system: { special: new Set(['unwieldy']) } };
        const sword = { id: 'sword', isMelee: true, equipped: true, system: { special: new Set(['balanced']) } };
        const pistol = { id: 'pistol', isMelee: false, equipped: true, system: { special: new Set<string>() } };
        expect(parryingWeapon([pistol, maul, sword])).toBe(sword);
        expect(parryingWeapon([pistol, maul])).toBeNull();
    });
});
