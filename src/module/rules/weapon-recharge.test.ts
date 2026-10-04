import { afterEach, describe, expect, it } from 'vitest';
import { setWeaponQualityPayloadsForTesting } from './weapon-quality-payloads.ts';
import { attackTriggersRecharge, isRecharging } from './weapon-recharge.ts';

/**
 * Recharge: a weapon fired in round N may not fire in round N + 1. Triggered by a
 * quality the weapon carries (`mechanics.recharge`) or one the attacker chose for
 * the shot (`mechanics.triggersRecharge`, Maximal). Nothing enforced it before.
 */

afterEach(() => {
    setWeaponQualityPayloadsForTesting({});
});

describe('attackTriggersRecharge', () => {
    it('is triggered by a carried Recharge-type quality', () => {
        setWeaponQualityPayloadsForTesting({ recharge: { type: 'attack', recharge: true } });
        expect(attackTriggersRecharge(['recharge'], [])).toBe(true);
    });

    it('is triggered by a chosen quality only when it was chosen', () => {
        setWeaponQualityPayloadsForTesting({ maximal: { type: 'damage', selectable: true, triggersRecharge: true } });
        expect(attackTriggersRecharge(['maximal'], [])).toBe(false);
        expect(attackTriggersRecharge(['maximal'], ['maximal'])).toBe(true);
    });

    it('is not triggered by ordinary qualities', () => {
        setWeaponQualityPayloadsForTesting({ tearing: { type: 'damage' } });
        expect(attackTriggersRecharge(['tearing'], [])).toBe(false);
    });
});

describe('isRecharging', () => {
    const fired = { combatId: 'c1', round: 3 };
    it('blocks the round after firing, in the same combat', () => {
        expect(isRecharging(fired, { id: 'c1', round: 3 })).toBe(true);
        expect(isRecharging(fired, { id: 'c1', round: 4 })).toBe(true);
    });
    it('is ready again two rounds after firing', () => {
        expect(isRecharging(fired, { id: 'c1', round: 5 })).toBe(false);
    });
    it('never blocks outside combat, in another combat, or with no mark', () => {
        expect(isRecharging(fired, null)).toBe(false);
        expect(isRecharging(fired, { id: 'c2', round: 4 })).toBe(false);
        expect(isRecharging({ combatId: '', round: null }, { id: 'c1', round: 4 })).toBe(false);
    });
});
