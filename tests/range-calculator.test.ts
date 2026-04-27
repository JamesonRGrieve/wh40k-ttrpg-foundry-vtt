import { describe, expect, it } from 'vitest';
import {
    applyQualityModifiers,
    calculateRangeBracket,
    calculateRangeModifier,
    formatRangeDisplay,
    isAtMeltaRange,
    isOutOfRange,
} from '../src/module/utils/range-calculator';

describe('calculateRangeBracket', () => {
    it('returns melee for weapons with range <= 1', () => {
        expect(calculateRangeBracket(5, 1).bracket).toBe('melee');
    });

    it('returns point blank at <= 2m', () => {
        const result = calculateRangeBracket(2, 30);
        expect(result.bracket).toBe('pointBlank');
        expect(result.modifier).toBe(30);
    });

    it('returns short at <= half weapon range', () => {
        expect(calculateRangeBracket(15, 30).bracket).toBe('short');
    });

    it('returns standard at <= 2x weapon range', () => {
        expect(calculateRangeBracket(45, 30).bracket).toBe('standard');
    });

    it('returns long at <= 3x weapon range', () => {
        expect(calculateRangeBracket(75, 30).bracket).toBe('long');
    });

    it('returns extreme beyond 3x weapon range', () => {
        const result = calculateRangeBracket(150, 30);
        expect(result.bracket).toBe('extreme');
        expect(result.modifier).toBe(-30);
    });
});

describe('applyQualityModifiers', () => {
    it('caps gyro-stabilised at -10 in extreme range', () => {
        const base = { bracket: 'extreme', label: 'Extreme', modifier: -30, description: '' };
        const result = applyQualityModifiers(base, new Set(['gyro-stabilised']));
        expect(result.modifier).toBe(-10);
        expect(result.modifiedBy).toBe('gyro-stabilised');
    });

    it('does not modify when penalty is already <= -10', () => {
        const base = { bracket: 'standard', label: 'Standard', modifier: 0, description: '' };
        const result = applyQualityModifiers(base, new Set(['gyro-stabilised']));
        expect(result.modifier).toBe(0);
        expect(result.modifiedBy).toBeNull();
    });
});

describe('isAtMeltaRange', () => {
    it.each([
        ['pointBlank', true],
        ['short', true],
        ['standard', false],
        ['long', false],
        ['extreme', false],
    ])('bracket %s -> %s', (bracket, expected) => {
        expect(isAtMeltaRange(bracket)).toBe(expected);
    });
});

describe('calculateRangeModifier', () => {
    it('treats melee weapons as bracket=melee regardless of distance', () => {
        const result = calculateRangeModifier({
            distance: 50,
            weaponRange: 30,
            weaponQualities: new Set(),
            isRangedWeapon: false,
        });
        expect(result.bracket).toBe('melee');
        expect(result.modifier).toBe(0);
    });

    it('flags melta short range', () => {
        const result = calculateRangeModifier({
            distance: 5,
            weaponRange: 30,
            weaponQualities: new Set(['melta']),
            isRangedWeapon: true,
        });
        expect(result.isMeltaRange).toBe(true);
    });

    it('does not flag melta at standard range', () => {
        const result = calculateRangeModifier({
            distance: 40,
            weaponRange: 30,
            weaponQualities: new Set(['melta']),
            isRangedWeapon: true,
        });
        expect(result.isMeltaRange).toBe(false);
    });
});

describe('formatRangeDisplay', () => {
    it('formats positive modifier with +', () => {
        const result = formatRangeDisplay({
            bracket: 'pointBlank',
            label: 'Point Blank',
            modifier: 30,
            modifiedBy: null,
            isMeltaRange: false,
            description: '2 meters or less',
        });
        expect(result.modifierText).toBe('+30');
        expect(result.modifierClass).toContain('positive');
    });

    it('formats zero modifier as ±0', () => {
        const result = formatRangeDisplay({
            bracket: 'standard',
            label: 'Standard',
            modifier: 0,
            modifiedBy: null,
            isMeltaRange: false,
            description: '',
        });
        expect(result.modifierText).toBe('±0');
    });

    it('appends melta hint when isMeltaRange', () => {
        const result = formatRangeDisplay({
            bracket: 'short',
            label: 'Short',
            modifier: 10,
            modifiedBy: null,
            isMeltaRange: true,
            description: 'Half range',
        });
        expect(result.tooltip).toContain('Melta');
    });
});

describe('isOutOfRange', () => {
    it('treats melee weapons as never out of range', () => {
        expect(isOutOfRange(1000, 1)).toBe(false);
    });

    it('returns true beyond 3x weapon range', () => {
        expect(isOutOfRange(91, 30)).toBe(true);
    });

    it('returns false at exactly 3x weapon range', () => {
        expect(isOutOfRange(90, 30)).toBe(false);
    });
});
