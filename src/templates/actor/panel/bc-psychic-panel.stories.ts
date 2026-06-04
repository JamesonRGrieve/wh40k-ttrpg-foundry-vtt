/**
 * Storybook stories for the Black Crusade Psychic Strength panel (#178).
 *
 * Covers the four canonical UI states an operator needs to verify in
 * review:
 *
 *   1. Bound           — base class, unfettered mode, no sustain.
 *   2. Unbound         — wider push ceiling, fettered mode (half PR).
 *   3. Daemonic        — push ceiling 4, push level 0, sustain penalty
 *                        on (2 powers sustained → -10).
 *   4. PushLevel3      — bound psyker at push level 3 (clamped at the
 *                        bound ceiling); shows the +1 / push extra
 *                        phenomena rolls.
 *
 * Story factories use fixed inputs (no Math.random) per the "Seeded
 * RNG in stories" rule in CLAUDE.md — every readout in these stories is
 * the engine's deterministic output for the documented inputs.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { maxPushLevel, resolvePsychicTest, type PsyMode, type PsykerClass } from '../../../module/rules/bc-psychic-strength';
import panelSrc from './bc-psychic-panel.hbs?raw';

initializeStoryHandlebars();

interface PsychicPanelCtx {
    psychicPanel: {
        psykerClass: PsykerClass;
        psyRating: number;
        sustainedPowerCount: number;
        mode: PsyMode;
        pushLevel: number;
        maxPushLevel: number;
        effectivePR: number;
        sustainPenalty: number;
        phenomenaRolls: number;
    };
}

function renderPanel(ctx: PsychicPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

/** Build a panel context driven by the live resolver — never hand-author the readouts. */
function buildCtx(input: { psykerClass: PsykerClass; psyRating: number; sustainedPowerCount: number; mode: PsyMode; pushLevel: number }): PsychicPanelCtx {
    const resolved = resolvePsychicTest({
        psykerClass: input.psykerClass,
        basePR: input.psyRating,
        mode: input.mode,
        pushLevel: input.pushLevel,
        sustainedPowerCount: input.sustainedPowerCount,
    });
    return {
        psychicPanel: {
            psykerClass: input.psykerClass,
            psyRating: input.psyRating,
            sustainedPowerCount: input.sustainedPowerCount,
            mode: input.mode,
            pushLevel: input.pushLevel,
            maxPushLevel: maxPushLevel(input.psykerClass),
            effectivePR: resolved.effectivePR,
            sustainPenalty: resolved.sustainPenalty,
            phenomenaRolls: resolved.phenomenaRolls,
        },
    };
}

const meta: Meta<PsychicPanelCtx> = {
    title: 'Actor/Character/BcPsychicPanel',
};
export default meta;
type Story = StoryObj<PsychicPanelCtx>;

export const Bound: Story = {
    name: 'Bound — base class, unfettered, no sustain',
    args: buildCtx({ psykerClass: 'bound', psyRating: 4, sustainedPowerCount: 0, mode: 'unfettered', pushLevel: 0 }),
    render: (args) => renderPanel(args),
};

export const Unbound: Story = {
    name: 'Unbound — wider push ceiling, fettered (half PR, no phenomena)',
    args: buildCtx({ psykerClass: 'unbound', psyRating: 5, sustainedPowerCount: 0, mode: 'fettered', pushLevel: 0 }),
    render: (args) => renderPanel(args),
};

export const Daemonic: Story = {
    name: 'Daemonic — sustain penalty engaged (2 powers, -10)',
    args: buildCtx({ psykerClass: 'daemonic', psyRating: 6, sustainedPowerCount: 2, mode: 'unfettered', pushLevel: 0 }),
    render: (args) => renderPanel(args),
};

export const PushLevel3: Story = {
    name: 'Bound — push level 3 (at class ceiling) → +1 phenomena per push',
    args: buildCtx({ psykerClass: 'bound', psyRating: 4, sustainedPowerCount: 0, mode: 'push', pushLevel: 3 }),
    render: (args) => renderPanel(args),
};
