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
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('maps generic level keys to localized rank names', () => {
        vi.stubGlobal('game', { i18n: { localize: (key: string): string => `loc:${key}` } });
        expect(getTrainingLabel('trained')).toBe('loc:WH40K.Skills.Rank.Trained');
        expect(getTrainingLabel('plus10')).toBe('loc:WH40K.Skills.Rank.Plus10');
        expect(getTrainingLabel('plus30')).toBe('loc:WH40K.Skills.Rank.Plus30');
        expect(getTrainingLabel('known')).toBe('loc:WH40K.Skills.Rank.Known');
    });

    it('passes through an unknown level and defaults empty to Trained', () => {
        vi.stubGlobal('game', { i18n: { localize: (key: string): string => `loc:${key}` } });
        expect(getTrainingLabel('custom')).toBe('custom');
        expect(getTrainingLabel('')).toBe('loc:WH40K.Skills.Rank.Trained');
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
