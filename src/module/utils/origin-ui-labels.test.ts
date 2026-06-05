import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAllCharacteristicDisplayInfo, getCharacteristicDisplayInfo, getChoiceTypeLabel, getTrainingLabel } from './origin-ui-labels.ts';

/**
 * Coverage for the origin-path UI label helpers (previously untested). The
 * system-config training path needs a BaseSystemConfig and is exercised only
 * via the generic fallback here; getChoiceTypeLabel's i18n is stubbed.
 */

describe('getCharacteristicDisplayInfo', () => {
    it('returns label + short for a known characteristic', () => {
        expect(getCharacteristicDisplayInfo('weaponSkill')).toEqual({ label: 'Weapon Skill', short: 'WS' });
    });

    it('falls back to the key + a 3-letter uppercase short for an unknown key', () => {
        expect(getCharacteristicDisplayInfo('foobar')).toEqual({ label: 'foobar', short: 'FOO' });
    });
});

describe('getAllCharacteristicDisplayInfo', () => {
    it('exposes the full characteristic map', () => {
        const all = getAllCharacteristicDisplayInfo();
        expect(all['fellowship']).toEqual({ label: 'Fellowship', short: 'Fel' });
        expect(Object.keys(all)).toContain('influence');
    });
});

describe('getTrainingLabel (generic fallback)', () => {
    it('maps generic level keys to labels', () => {
        expect(getTrainingLabel('trained')).toBe('Trained');
        expect(getTrainingLabel('plus10')).toBe('+10');
        expect(getTrainingLabel('known')).toBe('Known');
    });

    it('passes through an unknown level and defaults empty to Trained', () => {
        expect(getTrainingLabel('custom')).toBe('custom');
        expect(getTrainingLabel('')).toBe('Trained');
    });
});

describe('getChoiceTypeLabel', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns the localized label when the key resolves', () => {
        vi.stubGlobal('game', { i18n: { localize: (k: string): string => (k === 'WH40K.ChoiceType.talent' ? 'Talent Choice' : k) } });
        expect(getChoiceTypeLabel('talent')).toBe('Talent Choice');
    });

    it('falls back to a capitalized type when the key is unlocalized', () => {
        vi.stubGlobal('game', { i18n: { localize: (k: string): string => k } });
        expect(getChoiceTypeLabel('skill')).toBe('Skill');
    });
});
