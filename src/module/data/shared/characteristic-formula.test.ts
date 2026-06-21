/**
 * Unit tests for the shared characteristic-bonus formula helpers.
 */
import { describe, expect, it } from 'vitest';
import { CHARACTERISTIC_BONUS_ABBREVIATIONS, parseCharacteristicBonusTerm, resolveCharacteristicBonusRefs } from './characteristic-formula.ts';

const BONUSES: Record<string, number> = { toughness: 4, strength: 3, willpower: 5, weaponSkill: 2 };
const bonusFor = (key: string): number => BONUSES[key] ?? 0;

describe('CHARACTERISTIC_BONUS_ABBREVIATIONS', () => {
    it('maps every abbreviation to a characteristic key', () => {
        expect(CHARACTERISTIC_BONUS_ABBREVIATIONS['TB']).toBe('toughness');
        expect(CHARACTERISTIC_BONUS_ABBREVIATIONS['WSB']).toBe('weaponSkill');
        expect(Object.keys(CHARACTERISTIC_BONUS_ABBREVIATIONS)).toHaveLength(9);
    });
});

describe('resolveCharacteristicBonusRefs', () => {
    it('substitutes a multiplied TB term', () => {
        expect(resolveCharacteristicBonusRefs('2xTB+1d5+1', bonusFor)).toBe('8+1d5+1');
    });

    it('defaults the multiplier to 1 when omitted', () => {
        expect(resolveCharacteristicBonusRefs('TB+2', bonusFor)).toBe('4+2');
    });

    it('substitutes multiple distinct characteristics', () => {
        expect(resolveCharacteristicBonusRefs('SB+WPB', bonusFor)).toBe('3+5');
    });

    it('uses 0 for characteristics with no bonus', () => {
        expect(resolveCharacteristicBonusRefs('2xPB', bonusFor)).toBe('0');
    });

    it('leaves a plain dice/flat formula untouched', () => {
        expect(resolveCharacteristicBonusRefs('1d10+5', bonusFor)).toBe('1d10+5');
    });
});

describe('parseCharacteristicBonusTerm', () => {
    it('parses a multiplied TB term', () => {
        expect(parseCharacteristicBonusTerm('2xTB+1d5+1')).toEqual({ charKey: 'toughness', abbr: 'TB', multiplier: 2, match: '2xTB' });
    });

    it('defaults the multiplier to 1', () => {
        expect(parseCharacteristicBonusTerm('TB+3')).toEqual({ charKey: 'toughness', abbr: 'TB', multiplier: 1, match: 'TB' });
    });

    it('parses a non-TB characteristic (the divergence #339 fixes)', () => {
        expect(parseCharacteristicBonusTerm('2xSB+1d5')).toEqual({ charKey: 'strength', abbr: 'SB', multiplier: 2, match: '2xSB' });
    });

    it('matches the longest abbreviation first (WSB before SB)', () => {
        expect(parseCharacteristicBonusTerm('WSB+1')).toEqual({ charKey: 'weaponSkill', abbr: 'WSB', multiplier: 1, match: 'WSB' });
    });

    it('returns null for a formula with no characteristic reference', () => {
        expect(parseCharacteristicBonusTerm('9+1d5')).toBeNull();
    });
});
