import { describe, expect, it } from 'vitest';
import { CHARACTERISTIC_AT_ZERO, getAtZeroEffect, getCharacteristicDamageHealed, getEffectiveCharacteristic } from './characteristic-damage';

/**
 * Characteristic damage at-zero effect mapping (#115 — core.md
 * L10679-10698). Pins the canonical effect per characteristic and the
 * 1-point-per-hour recovery math.
 *
 * Runtime hook (apply ActiveEffect / status condition when a
 * characteristic effective value hits 0) remains follow-up.
 */

describe('CHARACTERISTIC_AT_ZERO (#115)', () => {
    it('WS / BS at 0 → cannot-test', () => {
        expect(CHARACTERISTIC_AT_ZERO['weaponSkill']?.effect).toBe('cannot-test');
        expect(CHARACTERISTIC_AT_ZERO['ballisticSkill']?.effect).toBe('cannot-test');
    });
    it('Strength / Willpower at 0 → unconscious', () => {
        expect(CHARACTERISTIC_AT_ZERO['strength']?.effect).toBe('unconscious');
        expect(CHARACTERISTIC_AT_ZERO['willpower']?.effect).toBe('unconscious');
    });
    it('Toughness at 0 → death', () => {
        expect(CHARACTERISTIC_AT_ZERO['toughness']?.effect).toBe('death');
    });
    it('Agility / Intelligence / Fellowship at 0 → helpless', () => {
        expect(CHARACTERISTIC_AT_ZERO['agility']?.effect).toBe('helpless');
        expect(CHARACTERISTIC_AT_ZERO['intelligence']?.effect).toBe('helpless');
        expect(CHARACTERISTIC_AT_ZERO['fellowship']?.effect).toBe('helpless');
    });
    it('Perception at 0 → global-penalty −30', () => {
        const entry = CHARACTERISTIC_AT_ZERO['perception'];
        expect(entry?.effect).toBe('global-penalty');
        expect(entry?.globalPenalty).toBe(-30);
    });
});

describe('getAtZeroEffect (#115)', () => {
    it('returns the entry for canonical slugs', () => {
        expect(getAtZeroEffect('toughness')?.effect).toBe('death');
    });
    it('returns undefined for unknown slugs', () => {
        expect(getAtZeroEffect('phantasm')).toBeUndefined();
    });
});

describe('getEffectiveCharacteristic (#115)', () => {
    it('returns total − damage, floored at 0', () => {
        expect(getEffectiveCharacteristic(40, 10)).toBe(30);
        expect(getEffectiveCharacteristic(40, 50)).toBe(0);
        expect(getEffectiveCharacteristic(40, 0)).toBe(40);
    });
    it('treats non-finite inputs as 0', () => {
        expect(getEffectiveCharacteristic(Number.NaN, 10)).toBe(0);
        expect(getEffectiveCharacteristic(40, Number.NaN)).toBe(40);
    });
});

describe('getCharacteristicDamageHealed (#115)', () => {
    it('1 per hour, never over-healing', () => {
        expect(getCharacteristicDamageHealed(10, 3)).toBe(3);
        expect(getCharacteristicDamageHealed(2, 8)).toBe(2); // cap at damage
        expect(getCharacteristicDamageHealed(0, 100)).toBe(0);
    });
    it('treats negative / non-finite inputs as 0', () => {
        expect(getCharacteristicDamageHealed(-3, 5)).toBe(0);
        expect(getCharacteristicDamageHealed(5, -3)).toBe(0);
    });
});
