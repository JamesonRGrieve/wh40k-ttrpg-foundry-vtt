import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    applyQualityModifiers,
    calculateRangeBracket,
    calculateRangeModifier,
    calculateTokenDistance,
    formatRangeDisplay,
    isAtMeltaRange,
    isOutOfRange,
} from '../src/module/utils/range-calculator';

/** Minimal Token-placeable projection the distance helper reads. */
type TokenArg = Parameters<typeof calculateTokenDistance>[0];
function fakeToken(elevation: number | undefined, hasDocument = true): TokenArg {
    const token = hasDocument ? { document: elevation === undefined ? {} : { elevation } } : { document: undefined };
    // eslint-disable-next-line no-restricted-syntax -- boundary: a real Foundry Token placeable cannot be constructed in a unit test; calculateTokenDistance only reads token.document.elevation, which this projection supplies
    return token as unknown as TokenArg;
}

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

describe('calculateTokenDistance (#233)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubGrid(measured: number): void {
        vi.stubGlobal('canvas', { grid: { measurePath: () => measured } });
    }

    it('returns 0 when either token is null/undefined', () => {
        stubGrid(10);
        expect(calculateTokenDistance(null, fakeToken(0))).toBe(0);
        expect(calculateTokenDistance(fakeToken(0), undefined)).toBe(0);
    });

    it('does NOT throw when a token document is missing — defaults elevation to 0', () => {
        stubGrid(10);
        // The regression: a placeable mid-teardown / preview has no `.document`.
        expect(() => calculateTokenDistance(fakeToken(0, false), fakeToken(0))).not.toThrow();
        expect(calculateTokenDistance(fakeToken(0, false), fakeToken(0))).toBe(10);
    });

    it('returns the flat grid distance when elevations match', () => {
        stubGrid(12);
        expect(calculateTokenDistance(fakeToken(5), fakeToken(5))).toBe(12);
    });

    it('applies a 3D (Pythagorean) distance when elevations differ', () => {
        stubGrid(3); // horizontal 3, vertical 4 -> hypotenuse 5
        expect(calculateTokenDistance(fakeToken(0), fakeToken(4))).toBe(5);
    });

    it('treats an absent elevation field the same as ground level (0)', () => {
        stubGrid(3);
        // token2 has a document but no elevation key -> 0, matching token1 at 0.
        expect(calculateTokenDistance(fakeToken(0), fakeToken(undefined))).toBe(3);
    });
});
