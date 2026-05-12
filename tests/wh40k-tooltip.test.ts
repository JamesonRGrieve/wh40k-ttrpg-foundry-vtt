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
        } as Record<string, WH40KCharacteristic>;

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

        expect(html).toContain('Training:</span>');
        expect(html).toContain('Veteran (+30)');
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
        expect(html).toContain('Training:</span>');
        expect(html).toContain('Known</span>');
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
