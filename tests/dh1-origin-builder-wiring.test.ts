/**
 * Regression guard: the DH1e origin-path builder is wired, and every builder
 * step resolves to real compendium content.
 *
 * History: `DH1eSystemConfig.getOriginStepConfig()` was a placeholder
 * (`{ coreSteps: [], packs: [] }`), so the DH1 builder had no steps at all.
 * Separately, the DH1 career items carried `system.step: "careerPath"` — a
 * value absent from the originPath schema's `step` choices and unknown to the
 * actor-field derivation (`character.ts` maps `stepMap['career']`). Wiring DH1
 * meant defining the steps AND renaming the content to the canonical `career`.
 *
 * The builder groups origins by matching each item's `system.step` to a
 * config `coreStep.step` (see OriginChartLayout.computeFullChart). So a step
 * with no matching items renders empty — exactly the failure mode. This test
 * asserts (a) DH1 declares its steps + packs, (b) the career content uses
 * `career` not `careerPath`, and (c) every configured step has at least one
 * compendium item whose `system.step` matches. (c) is what fails loudly if the
 * step value and the config drift apart again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../src/module/config/game-systems/index.ts';
import { stepsInPack } from './helpers/origin-pack-content.ts';

interface I18nStub {
    localize: (key: string) => string;
    format: (key: string) => string;
}
interface GameStub {
    i18n: I18nStub;
}
interface GlobalShim {
    game?: GameStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_GAME = G.game;

beforeAll(() => {
    G.game = { i18n: { localize: (k: string): string => k, format: (k: string): string => k } };
});
afterAll(() => {
    G.game = ORIGINAL_GAME;
});

describe('DH1 origin-path builder wiring', () => {
    const config = SystemConfigRegistry.get('dh1').getOriginStepConfig();

    it('declares core steps and packs (not the empty placeholder)', () => {
        expect(config.coreSteps.length).toBeGreaterThan(0);
        expect(config.packs.length).toBeGreaterThan(0);
        expect(config.coreSteps.map((s) => s.step)).toEqual(['homeWorld', 'career']);
    });

    it('career content uses the canonical `career` step, never `careerPath`', () => {
        const careerSteps = stepsInPack('dh1-core-origins-careers');
        expect(careerSteps.length).toBeGreaterThan(0);
        expect(careerSteps.every((s) => s === 'career')).toBe(true);
        expect(careerSteps).not.toContain('careerPath');
    });

    it('every configured step resolves to at least one compendium item', () => {
        const availableSteps = new Set(config.packs.flatMap((pack) => stepsInPack(pack)));
        const stepsWithoutContent = config.coreSteps.map((s) => s.step).filter((step) => !availableSteps.has(step));
        expect(stepsWithoutContent, `DH1 steps with no matching compendium items: ${stepsWithoutContent.join(', ')}`).toEqual([]);
    });
});
