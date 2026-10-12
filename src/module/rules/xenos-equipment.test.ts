import { describe, expect, it } from 'vitest';
import { DH2_ITEM_REPAIR_RULES } from '../config/game-systems/dh2-config.ts';
import { isXenosEquipment, readXenosRepairInsight, xenosRepairModifiers, type XenosRepairRules } from './xenos-equipment';

// Regression (#136): the module used to model an invented charge-based
// pristine/worn/degraded/ruined ladder. RAW (Enemies Without p. 42) is a Hard
// (−20) Forbidden Lore test, then the repair at −20 +5 per DoS on it.
const xenos: XenosRepairRules = (() => {
    const printed = DH2_ITEM_REPAIR_RULES.xenos;
    if (printed === null) throw new Error('DH2 prints the xenos repair rule');
    return printed;
})();

describe('DH2 xenos repair values (Enemies Without p. 42)', () => {
    it('is Hard (−20) lore, −20 repair, +5 per lore DoS', () => {
        expect(xenos).toEqual({ loreModifier: -20, repairModifier: -20, bonusPerLoreDegree: 5 });
    });
});

describe('xenosRepairModifiers', () => {
    it('pairs the alien-nature penalty with +5 per lore DoS', () => {
        expect(xenosRepairModifiers(xenos, 3)).toEqual({ alienNature: -20, loreInsight: 15 });
        expect(xenosRepairModifiers(xenos, 0)).toEqual({ alienNature: -20, loreInsight: 0 });
        expect(xenosRepairModifiers(xenos, -2)).toEqual({ alienNature: -20, loreInsight: 0 });
    });
});

describe('isXenosEquipment', () => {
    it('is weapons and armour typed xenos', () => {
        expect(isXenosEquipment({ type: 'weapon', system: { type: 'xenos' } })).toBe(true);
        expect(isXenosEquipment({ type: 'armour', system: { type: 'xenos' } })).toBe(true);
        expect(isXenosEquipment({ type: 'weapon', system: { type: 'las' } })).toBe(false);
        expect(isXenosEquipment({ type: 'gear', system: { type: 'xenos' } })).toBe(false);
    });
});

describe('readXenosRepairInsight', () => {
    it("reads only the roller's own insight", () => {
        const flag = { actorUuid: 'Actor.a', degrees: 2 };
        expect(readXenosRepairInsight(flag, 'Actor.a')).toEqual({ actorUuid: 'Actor.a', degrees: 2 });
        expect(readXenosRepairInsight(flag, 'Actor.b')).toBeNull();
    });
    it('reads malformed flags as no insight', () => {
        expect(readXenosRepairInsight(undefined, 'Actor.a')).toBeNull();
        expect(readXenosRepairInsight({ actorUuid: 'Actor.a', degrees: '2' }, 'Actor.a')).toBeNull();
    });
});
