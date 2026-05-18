import { describe, expect, it } from 'vitest';
import {
    getFatigueRecoveredAfterRest,
    getFatigueThreshold,
    getFatigueUnconsciousMinutes,
    isCharacteristicHalvedByFatigue,
    isFatigueDeath,
    isFatigueUnconscious,
} from './fatigue';

describe('getFatigueThreshold (#114, errata L113)', () => {
    it('threshold = TB + WPB', () => {
        expect(getFatigueThreshold({ toughnessBonus: 4, willpowerBonus: 3 })).toBe(7);
        expect(getFatigueThreshold({ toughnessBonus: 5, willpowerBonus: 5 })).toBe(10);
        expect(getFatigueThreshold({ toughnessBonus: 0, willpowerBonus: 0 })).toBe(0);
    });
});

describe('isFatigueUnconscious (#114)', () => {
    const profile = { toughnessBonus: 4, willpowerBonus: 3 }; // threshold = 7

    it('false at or below threshold', () => {
        expect(isFatigueUnconscious({ ...profile, fatigueLevel: 5 })).toBe(false);
        expect(isFatigueUnconscious({ ...profile, fatigueLevel: 7 })).toBe(false);
    });
    it('true once fatigue > threshold', () => {
        expect(isFatigueUnconscious({ ...profile, fatigueLevel: 8 })).toBe(true);
        expect(isFatigueUnconscious({ ...profile, fatigueLevel: 12 })).toBe(true);
    });
});

describe('isFatigueDeath (#114, errata L113 — 2× threshold = death)', () => {
    const profile = { toughnessBonus: 4, willpowerBonus: 3 }; // threshold = 7, 2× = 14

    it('false at or below 2× threshold', () => {
        expect(isFatigueDeath({ ...profile, fatigueLevel: 13 })).toBe(false);
        expect(isFatigueDeath({ ...profile, fatigueLevel: 14 })).toBe(false);
    });
    it('true once fatigue > 2× threshold', () => {
        expect(isFatigueDeath({ ...profile, fatigueLevel: 15 })).toBe(true);
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
    it('false when fatigue level is 0', () => {
        expect(isCharacteristicHalvedByFatigue(3, 0)).toBe(false);
    });
    it('halved when characteristic bonus < fatigue level', () => {
        expect(isCharacteristicHalvedByFatigue(3, 4)).toBe(true);
        expect(isCharacteristicHalvedByFatigue(0, 1)).toBe(true);
    });
    it('NOT halved when characteristic bonus ≥ fatigue level', () => {
        expect(isCharacteristicHalvedByFatigue(4, 4)).toBe(false);
        expect(isCharacteristicHalvedByFatigue(5, 4)).toBe(false);
    });
});

describe('getFatigueRecoveredAfterRest (#114)', () => {
    it('1 per hour up to 6 (RAW: 6 hours removes all)', () => {
        expect(getFatigueRecoveredAfterRest(0)).toBe(0);
        expect(getFatigueRecoveredAfterRest(1)).toBe(1);
        expect(getFatigueRecoveredAfterRest(3)).toBe(3);
        expect(getFatigueRecoveredAfterRest(6)).toBe(6);
    });
    it('caps at 6 (longer rests do not over-recover)', () => {
        expect(getFatigueRecoveredAfterRest(12)).toBe(6);
        expect(getFatigueRecoveredAfterRest(100)).toBe(6);
    });
});
