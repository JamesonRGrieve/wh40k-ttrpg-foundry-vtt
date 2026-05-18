/**
 * Stories for the WH40K skill tooltip surface.
 *
 * The skill hover tooltip is built by {@link TooltipsWH40K._buildSkillTooltip}.
 * These stories invoke that builder directly with a deterministic payload and
 * mount the resulting HTML so visual regressions and label-accuracy regressions
 * surface in Storybook + the storybook-playwright integration suite.
 *
 * Issue #26 (Skill Training Progression is wrong):
 *   The progression must render the DH2 RAW 5-level ladder
 *   Untrained (-20) → Known (0) → Trained (+10) → Experienced (+20) → Veteran (+30)
 *   with each rank's modifier label REPLACING (not accumulating) the previous one.
 *
 * Issue #27 (Base/2 and Chrstc Value in hover are unexplained):
 *   The characteristic and untrained-target rows must read as plain English,
 *   not "[Chrstc] Value" / "Base (/2 untrained):" jargon.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { TooltipsWH40K } from './wh40k-tooltip.ts';

interface SkillTooltipStoryArgs {
    name: string;
    label: string;
    characteristic: string;
    charValue: number;
    current: number;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    plus30: boolean;
}

async function renderSkillTooltip(args: SkillTooltipStoryArgs): Promise<HTMLElement> {
    const html = await TooltipsWH40K.prototype._buildSkillTooltip.call(
        {} as unknown as InstanceType<typeof TooltipsWH40K>,
        {
            name: args.name,
            label: args.label,
            characteristic: args.characteristic,
            charValue: args.charValue,
            current: args.current,
            trained: args.trained,
            plus10: args.plus10,
            plus20: args.plus20,
            plus30: args.plus30,
        },
    );

    const host = document.createElement('div');
    host.className = 'wh40k-rpg wh40k-tooltip';
    host.setAttribute('data-testid', 'skill-tooltip-host');
    host.innerHTML = html;
    return host;
}

const meta = {
    title: 'Shared/SkillTooltip',
    render: (args) => {
        const placeholder = document.createElement('div');
        placeholder.setAttribute('data-testid', 'skill-tooltip-pending');
        placeholder.textContent = 'Rendering skill tooltip…';
        void renderSkillTooltip(args).then((node) => {
            placeholder.replaceWith(node);
        });
        return placeholder;
    },
    args: {
        name: 'Awareness',
        label: 'Awareness',
        characteristic: 'Per',
        charValue: 35,
        current: 35,
        trained: false,
        plus10: false,
        plus20: false,
        plus30: false,
    },
} satisfies Meta<SkillTooltipStoryArgs>;
export default meta;

type Story = StoryObj<SkillTooltipStoryArgs>;

// ── Untrained — full progression visible, "Untrained (-20)" highlighted ─────

export const Untrained: Story = {
    name: 'Issue #26 — Untrained renders 5-tier progression',
    play: async ({ canvasElement }) => {
        // Wait for the deferred render to land before reading the DOM.
        const canvas = within(canvasElement);
        const host = await canvas.findByTestId('skill-tooltip-host');
        const track = host.querySelector<HTMLElement>('.wh40k-tooltip__training-track');
        await expect(track).not.toBeNull();
        const text = track?.textContent ?? '';
        // Five rungs on the ladder.
        await expect(text).toContain('Untrained');
        await expect(text).toContain('-20');
        await expect(text).toContain('Known');
        await expect(text).toContain('+0');
        await expect(text).toContain('Trained');
        await expect(text).toContain('+10');
        await expect(text).toContain('Experienced');
        await expect(text).toContain('+20');
        await expect(text).toContain('Veteran');
        await expect(text).toContain('+30');
    },
};

// ── Trained at +10 — second rung highlighted; +20 cap is wrong ─────────────

export const TrainedPlus10: Story = {
    name: 'Issue #26 — Trained character sits at +10, not +20',
    args: {
        trained: true,
        plus10: true,
        plus20: false,
        plus30: false,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const host = await canvas.findByTestId('skill-tooltip-host');
        const active = host.querySelector<HTMLElement>('.wh40k-tooltip__training-track span.active');
        await expect(active).not.toBeNull();
        const activeText = active?.textContent ?? '';
        // The active rung is the second one (Trained, +10) — NOT +20.
        await expect(activeText).toContain('Trained');
        await expect(activeText).toContain('+10');
        await expect(activeText).not.toContain('+20');
    },
};

// ── Veteran at +30 — fifth rung; previous UI capped at +20 ─────────────────

export const Veteran: Story = {
    name: 'Issue #26 — Veteran rank reaches +30',
    args: {
        trained: true,
        plus10: true,
        plus20: true,
        plus30: true,
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const host = await canvas.findByTestId('skill-tooltip-host');
        const active = host.querySelector<HTMLElement>('.wh40k-tooltip__training-track span.active');
        await expect(active).not.toBeNull();
        const activeText = active?.textContent ?? '';
        await expect(activeText).toContain('Veteran');
        await expect(activeText).toContain('+30');
    },
};
