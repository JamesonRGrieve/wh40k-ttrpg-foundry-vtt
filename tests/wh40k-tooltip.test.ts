import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TooltipsWH40K, prepareSkillTooltipData } from '../src/module/applications/components/wh40k-tooltip.ts';
import type { WH40KBaseActor } from '../src/module/documents/base-actor.ts';
import type { WH40KCharacteristic, WH40KSkill } from '../src/module/types/global.d.ts';

const ORIGINAL_GAME = (globalThis as Record<string, unknown>).game;
const ORIGINAL_FROM_UUID = (globalThis as Record<string, unknown>).fromUuid;

beforeAll(() => {
    (globalThis as Record<string, unknown>).game = {
        i18n: {
            localize: (key: string) =>
                ((
                    {
                        'WH40K.Skills.Untrained': 'Untrained',
                        'WH40K.Skills.Training': 'Training',
                        'WH40K.Tooltip.Skill.BasicUntrained': 'Basic (Untrained)',
                        'WH40K.Tooltip.Skill.CharacteristicValue': 'Characteristic Total',
                        'WH40K.Tooltip.Skill.UntrainedBase': 'Untrained Test Base (Characteristic ÷ 2)',
                        'WH40K.Tooltip.Skill.Modifiers': 'Modifiers',
                        'WH40K.Tooltip.Skill.TrainingProgression': 'Training Progression',
                        'WH40K.Tooltip.Skill.ClickNameToRoll': 'Use the die button to roll',
                    } as Record<string, string>
                )[key] ?? key),
            format: (key: string) => key,
        },
    };
});

afterAll(() => {
    (globalThis as Record<string, unknown>).game = ORIGINAL_GAME;
    (globalThis as Record<string, unknown>).fromUuid = ORIGINAL_FROM_UUID;
});

describe('skill tooltip regressions', () => {
    it('preserves actorUuid and +30 rank in prepared tooltip data', () => {
        const skill = {
            label: 'Awareness',
            characteristic: 'perception',
            trained: true,
            plus10: true,
            plus20: true,
            plus30: true,
            current: 67,
            bonus: 0,
        } as WH40KSkill;
        const characteristics = {
            perception: {
                label: 'Perception',
                total: 37,
            },
        } as unknown as Record<string, WH40KCharacteristic>;

        const data = JSON.parse(prepareSkillTooltipData('awareness', skill, characteristics, 'Actor.mock')) as Record<string, unknown>;

        expect(data.actorUuid).toBe('Actor.mock');
        expect(data.plus30).toBe(true);
        expect(data.trainingBonus).toBe(30);
    });

    it('renders the DH2e-family veteran rank in the tooltip progression', async () => {
        const actor = {
            system: {
                gameSystem: 'dh2e',
                characteristics: {
                    perception: {
                        label: 'Perception',
                        total: 37,
                    },
                },
                skills: {
                    awareness: {
                        characteristic: 'perception',
                        trained: true,
                        plus10: true,
                        plus20: true,
                        plus30: true,
                        current: 67,
                        bonus: 0,
                    },
                },
            },
        } as WH40KBaseActor;

        (globalThis as Record<string, unknown>).fromUuid = async () => actor;

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip({
            actorUuid: 'Actor.mock',
            name: 'awareness',
            label: 'Awareness',
        });

        // The standalone "Training:" line was removed (issue #36 follow-up); the
        // progression track is the single source of training-state display.
        expect(html).not.toContain('Training:</span>');
        expect(html).toContain('Training Progression');
        expect(html).toContain('<span class="">Known</span>');
        expect(html).toContain('<span class="">Experienced</span>');
        expect(html).toContain('<span class="active">Veteran</span>');
        expect(html).toContain('Use the die button to roll');
    });

    it('renders the current rank label even when the rank has no bonus', async () => {
        const actor = {
            system: {
                gameSystem: 'dh2e',
                characteristics: {
                    perception: {
                        label: 'Perception',
                        total: 37,
                    },
                },
                skills: {
                    awareness: {
                        characteristic: 'perception',
                        trained: true,
                        plus10: false,
                        plus20: false,
                        plus30: false,
                        current: 37,
                        bonus: 0,
                    },
                },
            },
        } as WH40KBaseActor;

        (globalThis as Record<string, unknown>).fromUuid = async () => actor;

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip({
            actorUuid: 'Actor.mock',
            name: 'awareness',
            label: 'Awareness',
        });

        expect(html).toContain('Perception Characteristic Total:');
        expect(html).not.toContain('Training:</span>');
        expect(html).toContain('<span class="active">Known</span>');
    });

    it('hides the half-characteristic untrained base line for non-RT systems', async () => {
        const actor = {
            system: {
                gameSystem: 'dh2e',
                characteristics: {
                    perception: { label: 'Perception', total: 37 },
                },
                skills: {
                    awareness: {
                        characteristic: 'perception',
                        trained: false,
                        plus10: false,
                        plus20: false,
                        plus30: false,
                        current: 17,
                        bonus: 0,
                    },
                },
            },
        } as WH40KBaseActor;

        (globalThis as Record<string, unknown>).fromUuid = async () => actor;

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip({
            actorUuid: 'Actor.mock',
            name: 'awareness',
            label: 'Awareness',
        });

        expect(html).not.toContain('Untrained Test Base');
    });

    it('uses per-system rank labels when the favourite-skill payload carries actorUuid (issue #36)', async () => {
        // Reproduces the favourite-skill tab flow: prepareSkillTooltipData(...) is the
        // single code path the Statistics tab and the Favourites tab both go through, so
        // a DH2e actor's favourite skill must render Known/Trained/Experienced/Veteran —
        // never the career-based-system fallback labels (Trained/+10/+20).
        const skill = {
            label: 'Awareness',
            characteristic: 'perception',
            trained: true,
            plus10: true,
            plus20: false,
            plus30: false,
            current: 47,
            bonus: 0,
        } as WH40KSkill;
        const characteristics = {
            perception: { label: 'Perception', total: 37 },
        } as unknown as Record<string, WH40KCharacteristic>;

        const payload = JSON.parse(prepareSkillTooltipData('awareness', skill, characteristics, 'Actor.fav')) as Record<string, unknown>;
        expect(payload.actorUuid).toBe('Actor.fav');
        expect(payload.trained).toBe(true);
        expect(payload.plus10).toBe(true);

        const actor = {
            system: {
                gameSystem: 'dh2e',
                characteristics: { perception: { label: 'Perception', total: 37 } },
                skills: {
                    awareness: { ...skill },
                },
            },
        } as WH40KBaseActor;
        (globalThis as Record<string, unknown>).fromUuid = async () => actor;

        const tooltip = new TooltipsWH40K();
        // eslint-disable-next-line no-restricted-syntax -- boundary: SkillTooltipPayload shape is the JSON-parsed contract emitted by prepareSkillTooltipData; the cast is over the parsed payload.
        const html = await tooltip._buildSkillTooltip(payload as Parameters<typeof tooltip._buildSkillTooltip>[0]);

        expect(html).toContain('<span class="">Known</span>');
        expect(html).toContain('<span class="active">Trained</span>');
        expect(html).toContain('<span class="">Experienced</span>');
        expect(html).toContain('<span class="">Veteran</span>');
    });

    it('shows the half-characteristic untrained base line for Rogue Trader', async () => {
        const actor = {
            system: {
                gameSystem: 'rt',
                characteristics: {
                    perception: { label: 'Perception', total: 37 },
                },
                skills: {
                    awareness: {
                        characteristic: 'perception',
                        trained: false,
                        plus10: false,
                        plus20: false,
                        plus30: false,
                        current: 18,
                        bonus: 0,
                    },
                },
            },
        } as WH40KBaseActor;

        (globalThis as Record<string, unknown>).fromUuid = async () => actor;

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip({
            actorUuid: 'Actor.mock',
            name: 'awareness',
            label: 'Awareness',
        });

        expect(html).toContain('Untrained Test Base');
        expect(html).toContain('>18<');
    });
});
