import { describe, expect, it } from 'vitest';
import {
    FATIGUE_MODES,
    getFatigueAfterRest,
    getFatigueAfterWaking,
    getFatigueConditionModifier,
    getFatigueConditionTier,
    getFatigueHalvedCharacteristic,
    getFatigueTestModifier,
    getFatigueThreshold,
    getFatigueUnconsciousMinutes,
    getFlatFatiguePenalty,
    isCharacteristicHalvedByFatigue,
    isFatigueDeath,
    isFatigueUnconscious,
    resolveFatigueModel,
} from './fatigue';

const HALVING = FATIGUE_MODES.halving;
const FLAT = FATIGUE_MODES.flat;
const CONDITION = FATIGUE_MODES.condition;

describe('FATIGUE_MODES (#114) — canonical per-model rule sets', () => {
    it('halving = TB+WPB threshold, death at 2×, revert-to-tb, 6h', () => {
        expect(HALVING).toEqual({
            model: 'halving',
            threshold: 'tb+wpb',
            flatPenalty: 0,
            deathAtDoubleThreshold: true,
            wakeBehavior: 'revert-to-tb',
            fullRecoveryHours: 6,
        });
    });
    it('flat = TB threshold, −10, no death, revert-to-tb, 6h', () => {
        expect(FLAT).toEqual({
            model: 'flat',
            threshold: 'tb',
            flatPenalty: -10,
            deathAtDoubleThreshold: false,
            wakeBehavior: 'revert-to-tb',
            fullRecoveryHours: 6,
        });
    });
    it('condition = no threshold, no death, no wake revert', () => {
        expect(CONDITION).toEqual({
            model: 'condition',
            threshold: 'none',
            flatPenalty: 0,
            deathAtDoubleThreshold: false,
            wakeBehavior: 'none',
            fullRecoveryHours: 6,
        });
    });
});

describe('resolveFatigueModel (#114) — world setting overrides the system default', () => {
    it('auto uses the system default', () => {
        expect(resolveFatigueModel(HALVING, 'auto')).toBe(HALVING);
        expect(resolveFatigueModel(FLAT, 'auto')).toBe(FLAT);
    });
    it('a forced mode overrides the default', () => {
        expect(resolveFatigueModel(HALVING, 'flat')).toBe(FLAT);
        expect(resolveFatigueModel(FLAT, 'halving')).toBe(HALVING);
        expect(resolveFatigueModel(FLAT, 'condition')).toBe(CONDITION);
    });
});

describe('getFatigueThreshold (#114) — per model', () => {
    const input = { toughnessBonus: 4, willpowerBonus: 3 };
    it('halving = TB + WPB', () => {
        expect(getFatigueThreshold(input, HALVING)).toBe(7);
    });
    it('flat = TB only', () => {
        expect(getFatigueThreshold(input, FLAT)).toBe(4);
    });
    it('condition = 0 (no numeric threshold)', () => {
        expect(getFatigueThreshold(input, CONDITION)).toBe(0);
    });
});

describe('isFatigueUnconscious (#114)', () => {
    it('halving: unconscious once fatigue > TB+WPB (=7)', () => {
        const p = { toughnessBonus: 4, willpowerBonus: 3 };
        expect(isFatigueUnconscious({ ...p, fatigueLevel: 7 }, HALVING)).toBe(false);
        expect(isFatigueUnconscious({ ...p, fatigueLevel: 8 }, HALVING)).toBe(true);
    });
    it('flat: unconscious once fatigue > TB (=4)', () => {
        const p = { toughnessBonus: 4, willpowerBonus: 3 };
        expect(isFatigueUnconscious({ ...p, fatigueLevel: 4 }, FLAT)).toBe(false);
        expect(isFatigueUnconscious({ ...p, fatigueLevel: 5 }, FLAT)).toBe(true);
    });
    it('condition: never (no threshold)', () => {
        expect(isFatigueUnconscious({ toughnessBonus: 4, willpowerBonus: 3, fatigueLevel: 99 }, CONDITION)).toBe(false);
    });
});

describe('isFatigueDeath (#114) — only halving-model lines have fatigue-death', () => {
    const p = { toughnessBonus: 4, willpowerBonus: 3 }; // halving threshold 7, 2× = 14
    it('halving: death once fatigue > 2× threshold (=14)', () => {
        expect(isFatigueDeath({ ...p, fatigueLevel: 14 }, HALVING)).toBe(false);
        expect(isFatigueDeath({ ...p, fatigueLevel: 15 }, HALVING)).toBe(true);
    });
    it('flat: never dies from fatigue', () => {
        expect(isFatigueDeath({ ...p, fatigueLevel: 999 }, FLAT)).toBe(false);
    });
    it('condition: never dies from fatigue', () => {
        expect(isFatigueDeath({ ...p, fatigueLevel: 999 }, CONDITION)).toBe(false);
    });
});

describe('getFatigueUnconsciousMinutes (#114)', () => {
    it('10 − TB, floored at 1', () => {
        expect(getFatigueUnconsciousMinutes(0)).toBe(10);
        expect(getFatigueUnconsciousMinutes(3)).toBe(7);
        expect(getFatigueUnconsciousMinutes(9)).toBe(1);
        expect(getFatigueUnconsciousMinutes(20)).toBe(1);
    });
});

describe('isCharacteristicHalvedByFatigue (#114)', () => {
    it('false at fatigue 0', () => {
        expect(isCharacteristicHalvedByFatigue(3, 0)).toBe(false);
    });
    it('halved when bonus < level', () => {
        expect(isCharacteristicHalvedByFatigue(3, 4)).toBe(true);
        expect(isCharacteristicHalvedByFatigue(0, 1)).toBe(true);
    });
    it('NOT halved when bonus ≥ level', () => {
        expect(isCharacteristicHalvedByFatigue(4, 4)).toBe(false);
        expect(isCharacteristicHalvedByFatigue(5, 4)).toBe(false);
    });
});

describe('getFlatFatiguePenalty (#114) — flat -10 for ANY fatigue, not per-level', () => {
    it('flat model: 0 unfatigued, -10 at any level (no scaling)', () => {
        expect(getFlatFatiguePenalty(0, FLAT)).toBe(0);
        expect(getFlatFatiguePenalty(1, FLAT)).toBe(-10);
        expect(getFlatFatiguePenalty(5, FLAT)).toBe(-10); // extra levels add nothing
    });
    it('non-flat models return 0', () => {
        expect(getFlatFatiguePenalty(3, HALVING)).toBe(0);
        expect(getFlatFatiguePenalty(3, CONDITION)).toBe(0);
    });
});

describe('getFatigueHalvedCharacteristic (#114) — full effective-value halving', () => {
    it('returns null when the characteristic is not fatigued', () => {
        // bonus 4 ≥ level 4 → not fatigued
        expect(getFatigueHalvedCharacteristic(45, 4, 0, 0, 4)).toBeNull();
        // fatigue 0 → never
        expect(getFatigueHalvedCharacteristic(45, 4, 0, 0, 0)).toBeNull();
    });
    it('halves value (round up) and derives the bonus from the halved value', () => {
        // value 45 (bonus 4), fatigue 5 → halved to ceil(45/2)=23, bonus floor(23/10)=2
        expect(getFatigueHalvedCharacteristic(45, 4, 0, 0, 5)).toEqual({ effectiveValue: 23, effectiveBonus: 2 });
        // value 30 (bonus 3), fatigue 4 → 15, bonus 1
        expect(getFatigueHalvedCharacteristic(30, 3, 0, 0, 4)).toEqual({ effectiveValue: 15, effectiveBonus: 1 });
    });
    it('keeps the +X bonus-only channel on top of the halved natural bonus', () => {
        // value 45 → 23 (nat bonus 2) + bonusModifier 1 = 3
        expect(getFatigueHalvedCharacteristic(45, 4, 0, 1, 5)).toEqual({ effectiveValue: 23, effectiveBonus: 3 });
    });
    it('applies the unnatural multiplier to the halved bonus', () => {
        // value 45 → 23, tens 2, unnatural 2 → 4
        expect(getFatigueHalvedCharacteristic(45, 4, 2, 0, 5)).toEqual({ effectiveValue: 23, effectiveBonus: 4 });
    });
});

describe('IM condition tiers (#114)', () => {
    it('tiers: 0 none, 1 minor, 2+ major', () => {
        expect(getFatigueConditionTier(0)).toBe('none');
        expect(getFatigueConditionTier(1)).toBe('minor');
        expect(getFatigueConditionTier(2)).toBe('major');
        expect(getFatigueConditionTier(9)).toBe('major');
    });
    it('modifiers: none 0, minor -10 (Disadvantage approx), major -30 (Very Hard)', () => {
        expect(getFatigueConditionModifier(0)).toBe(0);
        expect(getFatigueConditionModifier(1)).toBe(-10);
        expect(getFatigueConditionModifier(2)).toBe(-30);
    });
});

describe('getFatigueTestModifier (#114) — dispatch by model', () => {
    it('flat → single flat penalty', () => {
        expect(getFatigueTestModifier(0, FLAT)).toBe(0);
        expect(getFatigueTestModifier(3, FLAT)).toBe(-10);
    });
    it('condition → IM tier modifier', () => {
        expect(getFatigueTestModifier(1, CONDITION)).toBe(-10);
        expect(getFatigueTestModifier(2, CONDITION)).toBe(-30);
    });
    it('halving → 0 (applied to effective value in data prep, not as a roll modifier)', () => {
        expect(getFatigueTestModifier(5, HALVING)).toBe(0);
    });
});

describe('getFatigueAfterRest (#114) — 1/hour, full recovery clears all', () => {
    it('flat/halving (6h): 1 removed per hour, 6h clears everything', () => {
        expect(getFatigueAfterRest(8, 0, FLAT)).toBe(8);
        expect(getFatigueAfterRest(8, 3, FLAT)).toBe(5);
        expect(getFatigueAfterRest(8, 6, FLAT)).toBe(0); // 6h clears ALL even though 8 > 6
    });
    it('RT (8h recovery) needs the full 8 hours to clear all', () => {
        const rt = { ...FLAT, fullRecoveryHours: 8 };
        expect(getFatigueAfterRest(10, 6, rt)).toBe(4);
        expect(getFatigueAfterRest(10, 8, rt)).toBe(0);
    });
    it('DW (1h recovery) clears all in one hour', () => {
        const dw = { ...FLAT, fullRecoveryHours: 1 };
        expect(getFatigueAfterRest(9, 1, dw)).toBe(0);
    });
});

describe('getFatigueAfterWaking (#114) — per line wake behaviour', () => {
    it('revert-to-tb caps fatigue at TB on waking', () => {
        expect(getFatigueAfterWaking(9, 4, FLAT)).toBe(4);
        expect(getFatigueAfterWaking(3, 4, FLAT)).toBe(3); // already below TB
    });
    it('drop-one-level (DW) removes a single level', () => {
        const dw = { ...FLAT, wakeBehavior: 'drop-one-level' as const };
        expect(getFatigueAfterWaking(9, 4, dw)).toBe(8);
        expect(getFatigueAfterWaking(0, 4, dw)).toBe(0);
    });
    it('none (IM) leaves the level unchanged', () => {
        expect(getFatigueAfterWaking(5, 4, CONDITION)).toBe(5);
    });
});
