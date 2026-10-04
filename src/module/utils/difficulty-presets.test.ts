import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WH40K } from '../config.ts';
import { buildLangStub } from '../testing/lang-stub.ts';
import { buildDifficultyPresets } from './difficulty-presets.ts';

/**
 * The difficulty ladder is derived from the canonical `WH40K.difficulties`
 * CONFIG map joined with presentation metadata (#336). These guards assert the
 * join stays faithful to CONFIG so a rebalance flows through instead of drifting.
 */
describe('buildDifficultyPresets', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: buildLangStub() });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('localizes each band label from the CONFIG label key and its tooltip from the langpack', () => {
        const byKey = new Map(buildDifficultyPresets().map((p) => [p.key, p]));
        expect(byKey.get('veryHard')).toMatchObject({ label: 'Very Hard', description: 'Exceptional difficulty' });
        expect(byKey.get('challenging')).toMatchObject({ label: 'Challenging', description: 'No modifier (baseline)' });
    });

    it('derives one preset per CONFIG difficulty band, in CONFIG order', () => {
        const presets = buildDifficultyPresets();
        expect(presets.map((p) => p.key)).toEqual(Object.keys(WH40K.difficulties));
    });

    it('takes each modifier from the CONFIG map (no re-hardcoded copy)', () => {
        for (const preset of buildDifficultyPresets()) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (flag off) vs tsconfig.json (flag on)
            expect(preset.modifier).toBe(WH40K.difficulties[preset.key]?.modifier);
        }
    });

    it('marks exactly the Challenging (+0) band as the baseline default', () => {
        const presets = buildDifficultyPresets();
        const defaults = presets.filter((p) => p.default === true);
        expect(defaults).toHaveLength(1);
        expect(defaults[0]?.key).toBe('challenging');
        expect(defaults[0]?.modifier).toBe(0);
    });

    it('carries presentation (icon, label, description) for every band', () => {
        for (const preset of buildDifficultyPresets()) {
            expect(preset.icon).toBeTruthy();
            expect(preset.label).toBeTruthy();
            expect(preset.description).toBeTruthy();
        }
    });
});
