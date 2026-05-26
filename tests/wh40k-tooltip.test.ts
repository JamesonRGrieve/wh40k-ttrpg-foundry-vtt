import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TooltipsWH40K, prepareSkillTooltipData } from '../src/module/applications/components/wh40k-tooltip.ts';
import type { WH40KBaseActor } from '../src/module/documents/base-actor.ts';
import type { WH40KCharacteristic, WH40KSkill } from '../src/module/types/global.d.ts';

// Subset of the SkillTooltipPayload contract returned by prepareSkillTooltipData()
// (which writes JSON). The interface is not exported from wh40k-tooltip.ts so
// we mirror only the fields these tests assert on.
interface SkillTooltipJsonPayload {
    actorUuid?: string;
    trained?: boolean;
    plus10?: boolean;
    plus20?: boolean;
    plus30?: boolean;
    trainingBonus?: number;
    name?: string;
    label?: string;
}

function makeCharacteristic(label: string, total: number): WH40KCharacteristic {
    return { label, short: label.slice(0, 3), base: 30, advance: 0, modifier: 0, unnatural: 0, total, bonus: Math.floor(total / 10) };
}

interface GameI18nStub {
    localize: (key: string) => string;
    format: (key: string) => string;
}
interface GameStub {
    i18n: GameI18nStub;
}
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `fromUuid` global returns Promise<unknown> per the framework contract (Document | null | object).
type FromUuidStub = (uuid?: string) => Promise<unknown>;

interface GlobalShim {
    game?: GameStub | undefined;
    fromUuid?: FromUuidStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_GAME = G.game;
const ORIGINAL_FROM_UUID = G.fromUuid;

beforeAll(() => {
    const i18nMap: Record<string, string> = {
        'WH40K.Skills.Untrained': 'Untrained',
        'WH40K.Skills.Training': 'Training',
        'WH40K.Tooltip.Skill.BasicUntrained': 'Basic (Untrained)',
        'WH40K.Tooltip.Skill.CharacteristicValue': 'Characteristic Total',
        'WH40K.Tooltip.Skill.UntrainedBase': 'Untrained Test Base (Characteristic ÷ 2)',
        'WH40K.Tooltip.Skill.Modifiers': 'Modifiers',
        'WH40K.Tooltip.Skill.TrainingProgression': 'Training Progression',
        'WH40K.Tooltip.Skill.ClickNameToRoll': 'Use the die button to roll',
    };
    G.game = {
        i18n: {
            localize: (key: string): string => i18nMap[key] ?? key,
            format: (key: string): string => key,
        },
    };
});

afterAll(() => {
    G.game = ORIGINAL_GAME;
    G.fromUuid = ORIGINAL_FROM_UUID;
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
        const characteristics: Record<string, WH40KCharacteristic> = {
            perception: makeCharacteristic('Perception', 37),
        };

        const data = JSON.parse(prepareSkillTooltipData('awareness', skill, characteristics, 'Actor.mock')) as SkillTooltipJsonPayload;

        expect(data.actorUuid).toBe('Actor.mock');
        expect(data.plus30).toBe(true);
        expect(data.trainingBonus).toBe(30);
    });

    it('renders the DH2e-family veteran rank in the tooltip progression', async () => {
        const actor = {
            system: {
                gameSystem: 'dh2',
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

        G.fromUuid = async () => Promise.resolve(actor);

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip({
            actorUuid: 'Actor.mock',
            name: 'awareness',
            label: 'Awareness',
        });

        // The standalone "Training:" line was removed (issue #36 follow-up); the
        // progression track is the single source of training-state display.
        // Per issue #26 the rank labels now route through the
        // RankWithBonus / UntrainedWithPenalty templates — the trivial mock
        // localize echoes the template key verbatim, so the rendered HTML
        // contains the template marker rather than a hand-rolled span body.
        expect(html).not.toContain('Training:</span>');
        expect(html).toContain('Training Progression');
        expect(html).toContain('WH40K.Tooltip.Skill.RankWithBonus');
        // Active rung carries the `active` class on its span.
        expect(html).toContain('<span class="active">');
        expect(html).toContain('Use the die button to roll');
    });

    it('renders the current rank label even when the rank has no bonus', async () => {
        const actor = {
            system: {
                gameSystem: 'dh2',
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

        G.fromUuid = async () => Promise.resolve(actor);

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip({
            actorUuid: 'Actor.mock',
            name: 'awareness',
            label: 'Awareness',
        });

        // The characteristic row now reads "Characteristic: Perception (37)"
        // (issue #27 label-clarity follow-up) — the trivial mock localize
        // echoes the format-template key, so we look for the template marker
        // rather than the expanded sentence.
        expect(html).toContain('WH40K.Tooltip.Skill.CharacteristicLabel');
        expect(html).not.toContain('Training:</span>');
        // Known is the active rung — the RankWithBonus template marker
        // appears once per rung; the active class proves the right rung
        // is the rendered selection.
        expect(html).toContain('WH40K.Tooltip.Skill.RankWithBonus');
        expect(html).toContain('<span class="active">');
    });

    it('shows the flat −20 untrained base target for aptitude systems (DH2)', async () => {
        // DH2 (and the aptitude/career family DH1e/BC/DW/OW/IM) applies a flat
        // −20 untrained penalty, NOT the RT ÷2 halving. Char 37 → target 17.
        const actor = {
            system: {
                gameSystem: 'dh2',
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

        G.fromUuid = async () => Promise.resolve(actor);

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip({
            actorUuid: 'Actor.mock',
            name: 'awareness',
            label: 'Awareness',
        });

        // The untrained-target row now renders for aptitude systems too, with
        // the −20 value (char 37 − 20 = 17), and the progression rung uses the
        // flat-penalty label rather than the ÷2 half-base label.
        expect(html).toContain('WH40K.Tooltip.Skill.UntrainedTargetLabel');
        expect(html).toContain('17');
        expect(html).toContain('WH40K.Tooltip.Skill.UntrainedWithPenalty');
        expect(html).not.toContain('WH40K.Tooltip.Skill.UntrainedHalfBase');
    });

    it('computes the −20 untrained base in prepared payload for aptitude systems', () => {
        const skill = {
            label: 'Awareness',
            characteristic: 'perception',
            trained: false,
            plus10: false,
            plus20: false,
            plus30: false,
            current: 17,
            bonus: 0,
        } as WH40KSkill;
        const characteristics: Record<string, WH40KCharacteristic> = {
            perception: makeCharacteristic('Perception', 37),
        };

        // DH2 → −20 (char 37 → 17); RT → ÷2 (char 37 → 18); unknown system
        // falls back to the DH2 family default (−20).
        const dh2 = JSON.parse(prepareSkillTooltipData('awareness', skill, characteristics, 'Actor.mock', 'dh2')) as {
            baseValue?: number;
            gameSystem?: string;
        };
        expect(dh2.baseValue).toBe(17);
        expect(dh2.gameSystem).toBe('dh2');

        const rt = JSON.parse(prepareSkillTooltipData('awareness', skill, characteristics, 'Actor.mock', 'rt')) as { baseValue?: number };
        expect(rt.baseValue).toBe(18);

        const unknown = JSON.parse(prepareSkillTooltipData('awareness', skill, characteristics, 'Actor.mock', 'made-up')) as { baseValue?: number };
        expect(unknown.baseValue).toBe(17);
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
        const characteristics: Record<string, WH40KCharacteristic> = {
            perception: makeCharacteristic('Perception', 37),
        };

        const payload = JSON.parse(prepareSkillTooltipData('awareness', skill, characteristics, 'Actor.fav')) as SkillTooltipJsonPayload;
        expect(payload.actorUuid).toBe('Actor.fav');
        expect(payload.trained).toBe(true);
        expect(payload.plus10).toBe(true);

        const actor = {
            system: {
                gameSystem: 'dh2',
                characteristics: { perception: { label: 'Perception', total: 37 } },
                skills: {
                    awareness: { ...skill },
                },
            },
        } as WH40KBaseActor;
        G.fromUuid = async () => Promise.resolve(actor);

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip(payload);

        // Per issue #26 the rank labels now route through RankWithBonus;
        // the trivial mock localize echoes the template key verbatim.
        // Every rung resolves through the same template so the marker
        // appears multiple times; the active class proves the right rung
        // is the rendered selection (Trained at +10 in this case).
        expect(html).toContain('WH40K.Tooltip.Skill.RankWithBonus');
        expect(html).toContain('<span class="active">');
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

        G.fromUuid = async () => Promise.resolve(actor);

        const tooltip = new TooltipsWH40K();
        const html = await tooltip._buildSkillTooltip({
            actorUuid: 'Actor.mock',
            name: 'awareness',
            label: 'Awareness',
        });

        // Issue #27 re-labeled the RT-specific half-characteristic untrained
        // base row to read "Untrained target (characteristic ÷ 2): {value}"
        // via the UntrainedTargetLabel template. The trivial mock localize
        // echoes the key verbatim, so the rendered HTML carries the marker
        // plus the numeric value substituted into {value}.
        expect(html).toContain('WH40K.Tooltip.Skill.UntrainedTargetLabel');
        expect(html).toContain('18');
    });
});
