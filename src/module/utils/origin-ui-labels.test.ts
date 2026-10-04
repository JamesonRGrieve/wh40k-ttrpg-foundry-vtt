import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WH40K from '../config.ts';
import { buildLangStub } from '../testing/lang-stub.ts';
import { getAllCharacteristicDisplayInfo, getCharacteristicDisplayInfo, getChoiceTypeLabel, getTrainingLabel } from './origin-ui-labels.ts';

/**
 * Coverage for the origin-path UI label helpers (previously untested). The
 * system-config training path needs a BaseSystemConfig and is exercised only
 * via the generic fallback here; getChoiceTypeLabel's i18n is stubbed.
 */

/** The runtime reads the characteristics registry via CONFIG.wh40k, not a config.ts import. */
function stubRuntime(): void {
    vi.stubGlobal('game', { i18n: buildLangStub() });
    vi.stubGlobal('CONFIG', { wh40k: WH40K });
}

describe('getCharacteristicDisplayInfo', () => {
    beforeEach(stubRuntime);
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns label + short for a known characteristic', () => {
        expect(getCharacteristicDisplayInfo('weaponSkill')).toEqual({ label: 'Weapon Skill', short: 'WS' });
    });

    it('falls back to the key + a 3-letter uppercase short for an unknown key', () => {
        expect(getCharacteristicDisplayInfo('foobar')).toEqual({ label: 'foobar', short: 'FOO' });
    });
});

describe('getAllCharacteristicDisplayInfo', () => {
    beforeEach(stubRuntime);
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('exposes the full characteristic map', () => {
        const all = getAllCharacteristicDisplayInfo();
        expect(all['fellowship']).toEqual({ label: 'Fellowship', short: 'Fel' });
        expect(Object.keys(all)).toContain('influence');
    });

    it('resolves every characteristic through the langpack (no raw keys leak)', () => {
        const leaked = Object.entries(getAllCharacteristicDisplayInfo()).filter(
            ([, info]) => info.label.startsWith('WH40K.') || info.short.startsWith('WH40K.'),
        );
        expect(leaked).toEqual([]);
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

    it('localizes the default label when no choice type is given', () => {
        vi.stubGlobal('game', { i18n: buildLangStub() });
        expect(getChoiceTypeLabel('')).toBe('Choice');
    });
});
