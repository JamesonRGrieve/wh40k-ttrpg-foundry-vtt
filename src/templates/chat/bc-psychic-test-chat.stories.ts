/**
 * Storybook stories for the Black Crusade Psychic Test chat card (#178).
 *
 * Covers the canonical chat outcomes the action produces:
 *
 *   1. Fettered    — half PR, no phenomena rolls.
 *   2. Unfettered  — full PR, one phenomena roll.
 *   3. Push3Bound  — Bound psyker at push level 3, four phenomena rolls,
 *                    sustain penalty engaged.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsLib from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { maxPushLevel, resolvePsychicTest, type PsyMode, type PsykerClass } from '../../module/rules/bc-psychic-strength';
import cardSrc from './bc-psychic-test-chat.hbs?raw';

initializeStoryHandlebars();

interface PsychicTestChatCtx {
    gameSystem: 'bc';
    psykerClass: PsykerClass;
    mode: PsyMode;
    classLabelKey: string;
    modeLabelKey: string;
    basePR: number;
    pushLevel: number;
    maxPushLevel: number;
    showPushLevel: boolean;
    effectivePR: number;
    sustainPenalty: number;
    phenomenaRolls: number;
}

const cardTpl = HbsLib.compile(cardSrc);

function renderCard(ctx: PsychicTestChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderStoryTemplate(cardTpl, ctx));
    return wrapper;
}

const CLASS_LABEL_KEYS: Record<PsykerClass, PsychicTestChatCtx['classLabelKey']> = {
    bound: 'WH40K.BC.Psychic.Class.Bound',
    unbound: 'WH40K.BC.Psychic.Class.Unbound',
    daemonic: 'WH40K.BC.Psychic.Class.Daemonic',
};

const MODE_LABEL_KEYS: Record<PsyMode, PsychicTestChatCtx['modeLabelKey']> = {
    fettered: 'WH40K.BC.Psychic.Mode.Fettered',
    unfettered: 'WH40K.BC.Psychic.Mode.Unfettered',
    push: 'WH40K.BC.Psychic.Mode.Push',
};

function buildCtx(input: { psykerClass: PsykerClass; mode: PsyMode; basePR: number; pushLevel: number; sustainedPowerCount: number }): PsychicTestChatCtx {
    const resolved = resolvePsychicTest({
        psykerClass: input.psykerClass,
        basePR: input.basePR,
        mode: input.mode,
        pushLevel: input.pushLevel,
        sustainedPowerCount: input.sustainedPowerCount,
    });
    return {
        gameSystem: 'bc',
        psykerClass: input.psykerClass,
        mode: input.mode,
        classLabelKey: CLASS_LABEL_KEYS[input.psykerClass],
        modeLabelKey: MODE_LABEL_KEYS[input.mode],
        basePR: input.basePR,
        pushLevel: input.pushLevel,
        maxPushLevel: maxPushLevel(input.psykerClass),
        showPushLevel: input.mode === 'push',
        effectivePR: resolved.effectivePR,
        sustainPenalty: resolved.sustainPenalty,
        phenomenaRolls: resolved.phenomenaRolls,
    };
}

const meta: Meta<PsychicTestChatCtx> = {
    title: 'Chat/BcPsychicTestChat',
};
export default meta;
type Story = StoryObj<PsychicTestChatCtx>;

export const Fettered: Story = {
    name: 'Fettered — half PR, no phenomena',
    args: buildCtx({ psykerClass: 'bound', mode: 'fettered', basePR: 5, pushLevel: 0, sustainedPowerCount: 0 }),
    render: (args) => renderCard(args),
};

export const Unfettered: Story = {
    name: 'Unfettered — full PR, one phenomena roll',
    args: buildCtx({ psykerClass: 'unbound', mode: 'unfettered', basePR: 5, pushLevel: 0, sustainedPowerCount: 0 }),
    render: (args) => renderCard(args),
};

export const Push3Bound: Story = {
    name: 'Push 3 (Bound, capped) — sustain penalty engaged',
    args: buildCtx({ psykerClass: 'bound', mode: 'push', basePR: 4, pushLevel: 3, sustainedPowerCount: 2 }),
    render: (args) => renderCard(args),
};
