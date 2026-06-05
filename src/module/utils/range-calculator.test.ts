import { describe, expect, it } from 'vitest';
import {
    applyQualityModifiers,
    calculateRangeBracket,
    calculateRangeModifier,
    formatRangeDisplay,
    isAtMeltaRange,
    isOutOfRange,
    type RangeCalculationResult,
    type RangeInfo,
} from './range-calculator.ts';

/**
 * Coverage for the pure weapon-range bracket/modifier math (previously
 * untested). `calculateTokenDistance` is Foundry-canvas-coupled and excluded.
 */

describe('calculateRangeBracket', () => {
    const RANGE = 30;

    it('treats a 1m (or closer) distance or a melee weapon as melee, modifier 0', () => {
        expect(calculateRangeBracket(1, RANGE)).toMatchObject({ bracket: 'melee', modifier: 0 });
        expect(calculateRangeBracket(0, RANGE)).toMatchObject({ bracket: 'melee', modifier: 0 });
        expect(calculateRangeBracket(20, 1)).toMatchObject({ bracket: 'melee', modifier: 0 });
    });

    it('point blank (≤2m) is +30', () => {
        expect(calculateRangeBracket(2, RANGE)).toMatchObject({ bracket: 'pointBlank', modifier: 30 });
    });

    it('short (≤ half range) is +10', () => {
        expect(calculateRangeBracket(10, RANGE)).toMatchObject({ bracket: 'short', modifier: 10 });
        expect(calculateRangeBracket(15, RANGE)).toMatchObject({ bracket: 'short', modifier: 10 });
    });

    it('standard (≤ 2× range) is +0', () => {
        expect(calculateRangeBracket(40, RANGE)).toMatchObject({ bracket: 'standard', modifier: 0 });
        expect(calculateRangeBracket(60, RANGE)).toMatchObject({ bracket: 'standard', modifier: 0 });
    });

    it('long (≤ 3× range) is -10', () => {
        expect(calculateRangeBracket(70, RANGE)).toMatchObject({ bracket: 'long', modifier: -10 });
        expect(calculateRangeBracket(90, RANGE)).toMatchObject({ bracket: 'long', modifier: -10 });
    });

    it('extreme (> 3× range) is -30', () => {
        expect(calculateRangeBracket(91, RANGE)).toMatchObject({ bracket: 'extreme', modifier: -30 });
        expect(calculateRangeBracket(1000, RANGE)).toMatchObject({ bracket: 'extreme', modifier: -30 });
    });
});

describe('applyQualityModifiers (gyro-stabilised)', () => {
    const extreme: RangeInfo = { bracket: 'extreme', label: 'Extreme Range', modifier: -30, description: '' };

    it('caps a worse-than-long penalty at -10 and records the source', () => {
        expect(applyQualityModifiers(extreme, new Set(['gyro-stabilised']))).toMatchObject({ modifier: -10, modifiedBy: 'gyro-stabilised' });
    });

    it('leaves a -10-or-better modifier untouched', () => {
        const long: RangeInfo = { bracket: 'long', label: 'Long Range', modifier: -10, description: '' };
        expect(applyQualityModifiers(long, new Set(['gyro-stabilised']))).toMatchObject({ modifier: -10, modifiedBy: null });
    });

    it('is a no-op without the quality', () => {
        expect(applyQualityModifiers(extreme, new Set())).toMatchObject({ modifier: -30, modifiedBy: null });
    });
});

describe('isAtMeltaRange', () => {
    it('is true only at point blank or short range', () => {
        expect(isAtMeltaRange('pointBlank')).toBe(true);
        expect(isAtMeltaRange('short')).toBe(true);
        expect(isAtMeltaRange('standard')).toBe(false);
        expect(isAtMeltaRange('extreme')).toBe(false);
    });
});

describe('calculateRangeModifier', () => {
    it('returns the melee result for a non-ranged weapon', () => {
        expect(calculateRangeModifier({ isRangedWeapon: false })).toMatchObject({ bracket: 'melee', modifier: 0, isMeltaRange: false });
    });

    it('flags melta range at short/point-blank when the weapon has the melta quality', () => {
        const result = calculateRangeModifier({ distance: 2, weaponRange: 30, weaponQualities: new Set(['melta']) });
        expect(result).toMatchObject({ bracket: 'pointBlank', isMeltaRange: true });
    });

    it('does not flag melta range at standard distance', () => {
        const result = calculateRangeModifier({ distance: 40, weaponRange: 30, weaponQualities: new Set(['melta']) });
        expect(result.isMeltaRange).toBe(false);
    });

    it('applies gyro-stabilised capping through the orchestrator', () => {
        const result = calculateRangeModifier({ distance: 1000, weaponRange: 30, weaponQualities: new Set(['gyro-stabilised']) });
        expect(result).toMatchObject({ modifier: -10, modifiedBy: 'gyro-stabilised' });
    });
});

describe('formatRangeDisplay', () => {
    function base(modifier: number, extra: Partial<RangeCalculationResult> = {}): RangeCalculationResult {
        return { bracket: 'x', label: 'L', modifier, description: 'desc', modifiedBy: null, isMeltaRange: false, ...extra };
    }

    it('formats the signed modifier text and CSS class', () => {
        const neutral = formatRangeDisplay(base(0));
        expect(neutral.modifierText).toBe('±0');
        expect(neutral.modifierClass).toContain('--neutral');
        const positive = formatRangeDisplay(base(30));
        expect(positive.modifierText).toBe('+30');
        expect(positive.modifierClass).toContain('--positive');
        const negative = formatRangeDisplay(base(-10));
        expect(negative.modifierText).toBe('-10');
        expect(negative.modifierClass).toContain('--negative');
    });

    it('annotates the tooltip with the modifying quality and melta note', () => {
        const out = formatRangeDisplay(base(-10, { modifiedBy: 'gyro-stabilised', isMeltaRange: true }));
        expect(out.tooltip).toContain('Modified by Gyro-Stabilised');
        expect(out.tooltip).toContain('Melta: Double Penetration');
    });
});

describe('isOutOfRange', () => {
    it('is never out of range for a melee weapon', () => {
        expect(isOutOfRange(1000, 1)).toBe(false);
    });

    it('is out of range beyond the default 3× extreme band', () => {
        expect(isOutOfRange(91, 30)).toBe(true);
        expect(isOutOfRange(90, 30)).toBe(false);
    });

    it('honours a custom max multiplier', () => {
        expect(isOutOfRange(61, 30, 2)).toBe(true);
        expect(isOutOfRange(60, 30, 2)).toBe(false);
    });
});
