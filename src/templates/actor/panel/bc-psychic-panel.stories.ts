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
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, clickAction, renderSheet } from '../../../../stories/test-helpers';
import { maxPushLevel, resolvePsychicTest, type PsyMode, type PsykerClass } from '../../../module/rules/bc-psychic-strength';
import panelSrc from './bc-psychic-panel.hbs?raw';

initializeStoryHandlebars();

/** The include exactly as `tab-overview.hbs` gates it (#596: no psychic test off Black Crusade). */
const GATED_PANEL = `{{#if isBC}}${panelSrc}{{/if}}`;

interface PsychicPanelCtx {
    systemId: 'bc' | 'dh2';
    isBC: boolean;
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
    wrapper.dataset['wh40kSystem'] = ctx.systemId;
    wrapper.appendChild(renderSheet(GATED_PANEL, ctx));
    return wrapper;
}

/** Build a panel context driven by the live resolver — never hand-author the readouts. */
function buildCtx(
    input: { psykerClass: PsykerClass; psyRating: number; sustainedPowerCount: number; mode: PsyMode; pushLevel: number },
    systemId: PsychicPanelCtx['systemId'] = 'bc',
): PsychicPanelCtx {
    const resolved = resolvePsychicTest({
        psykerClass: input.psykerClass,
        basePR: input.psyRating,
        mode: input.mode,
        pushLevel: input.pushLevel,
        sustainedPowerCount: input.sustainedPowerCount,
    });
    return {
        systemId,
        isBC: systemId === 'bc',
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

/**
 * The readouts are the resolver's, and the Psychic Test button sends
 * `bcPsychicTest` — the action the #596 line gate now lets fire on a BC actor.
 */
async function expectResolvedPanel(canvasElement: HTMLElement, ctx: PsychicPanelCtx): Promise<void> {
    const panel = canvasElement.querySelector<HTMLElement>('.wh40k-bc-psychic-panel');
    await expect(panel?.dataset['bcPsykerClass']).toBe(ctx.psychicPanel.psykerClass);
    await expect(panel?.dataset['bcPsyMode']).toBe(ctx.psychicPanel.mode);
    const readout = (hook: string, attr: string): string | undefined => canvasElement.querySelector<HTMLElement>(`[data-wh40k-hook="${hook}"]`)?.dataset[attr];
    await expect(readout('bc-psychic-effective', 'effectivePr')).toBe(String(ctx.psychicPanel.effectivePR));
    await expect(readout('bc-psychic-phenomena', 'phenomenaRolls')).toBe(String(ctx.psychicPanel.phenomenaRolls));
    await expect(readout('bc-psychic-sustain-penalty', 'sustainPenalty')).toBe(String(ctx.psychicPanel.sustainPenalty));
    const clicks = captureActionClicks(canvasElement);
    clickAction(canvasElement, 'bcPsychicTest');
    await expect(clicks.map((c) => c.action)).toEqual(['bcPsychicTest']);
}

const meta: Meta<PsychicPanelCtx> = {
    title: 'Actor/Character/BcPsychicPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<PsychicPanelCtx>;

export const Bound: Story = {
    name: 'Bound — base class, unfettered, no sustain',
    args: buildCtx({ psykerClass: 'bound', psyRating: 4, sustainedPowerCount: 0, mode: 'unfettered', pushLevel: 0 }),
    play: async ({ canvasElement, args }) => expectResolvedPanel(canvasElement, args),
};

export const Unbound: Story = {
    name: 'Unbound — wider push ceiling, fettered (half PR, no phenomena)',
    args: buildCtx({ psykerClass: 'unbound', psyRating: 5, sustainedPowerCount: 0, mode: 'fettered', pushLevel: 0 }),
    play: async ({ canvasElement, args }) => expectResolvedPanel(canvasElement, args),
};

export const Daemonic: Story = {
    name: 'Daemonic — sustain penalty engaged (2 powers, -10)',
    args: buildCtx({ psykerClass: 'daemonic', psyRating: 6, sustainedPowerCount: 2, mode: 'unfettered', pushLevel: 0 }),
    play: async ({ canvasElement, args }) => expectResolvedPanel(canvasElement, args),
};

export const PushLevel3: Story = {
    name: 'Bound — push level 3 (at class ceiling) → +1 phenomena per push',
    args: buildCtx({ psykerClass: 'bound', psyRating: 4, sustainedPowerCount: 0, mode: 'push', pushLevel: 3 }),
    play: async ({ canvasElement, args }) => expectResolvedPanel(canvasElement, args),
};

export const OtherLine: Story = {
    name: 'Other line (DH2) — no BC psychic panel',
    args: buildCtx({ psykerClass: 'bound', psyRating: 4, sustainedPowerCount: 0, mode: 'unfettered', pushLevel: 0 }, 'dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-bc-psychic-panel')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="bcPsychicTest"]')).toBeNull();
    },
};
