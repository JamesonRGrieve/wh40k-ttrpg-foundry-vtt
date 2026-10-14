/**
 * Storybook stories for the Black Crusade Chaos Ritual panel (#179, line gate #596).
 *
 * Covers three Daemonic Mastery profiles an operator needs to review:
 *
 *   1. Novice  — fresh Heretic with Mastery 0 (no bindings yet).
 *   2. Adept   — mid-arc Heretic with Mastery 3 (typical bound-daemon
 *                portfolio).
 *   3. Master  — late-arc Heretic with Mastery 7 (binding contests win
 *                outright against most rivals).
 *   4. OtherLine — a DH2 character: the overview's `isBC` gate renders no
 *                panel, so no ritual is offered off Black Crusade (#596).
 *
 * The panel is rendered through the same `isBC` gate tab-overview.hbs uses.
 * Story factories use fixed inputs (no Math.random) per the "Seeded RNG
 * in stories" rule in CLAUDE.md — the only displayed value (Mastery
 * rating) is the literal input.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, clickAction, renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './bc-ritual-panel.hbs?raw';

initializeStoryHandlebars();

/** The include exactly as `tab-overview.hbs` gates it. */
const GATED_PANEL = `{{#if isBC}}${panelSrc}{{/if}}`;

interface RitualPanelCtx {
    systemId: 'bc' | 'dh2';
    isBC: boolean;
    ritualPanel: {
        ritualMastery: number;
    };
}

function renderPanel(ctx: RitualPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = ctx.systemId;
    wrapper.appendChild(renderSheet(GATED_PANEL, ctx));
    return wrapper;
}

function buildCtx(ritualMastery: number, systemId: RitualPanelCtx['systemId'] = 'bc'): RitualPanelCtx {
    return { systemId, isBC: systemId === 'bc', ritualPanel: { ritualMastery } };
}

/** The panel shows the Mastery and its Perform Ritual button sends `bcPerformRitual`. */
async function expectPerformable(canvasElement: HTMLElement, mastery: number): Promise<void> {
    const panel = canvasElement.querySelector<HTMLElement>('.wh40k-bc-ritual-panel');
    await expect(panel?.dataset['bcRitualMastery']).toBe(String(mastery));
    await expect(canvasElement.querySelector<HTMLInputElement>('[name="system.ritualMastery"]')?.value).toBe(String(mastery));
    const clicks = captureActionClicks(canvasElement);
    clickAction(canvasElement, 'bcPerformRitual');
    await expect(clicks.map((c) => c.action)).toEqual(['bcPerformRitual']);
}

const meta: Meta<RitualPanelCtx> = {
    title: 'Actor/Character/BcRitualPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<RitualPanelCtx>;

export const Novice: Story = {
    name: 'Novice — Daemonic Mastery 0',
    args: buildCtx(0),
    play: async ({ canvasElement }) => expectPerformable(canvasElement, 0),
};

export const Adept: Story = {
    name: 'Adept — Daemonic Mastery 3',
    args: buildCtx(3),
    play: async ({ canvasElement }) => expectPerformable(canvasElement, 3),
};

export const Master: Story = {
    name: 'Master — Daemonic Mastery 7',
    args: buildCtx(7),
    play: async ({ canvasElement }) => expectPerformable(canvasElement, 7),
};

export const OtherLine: Story = {
    name: 'Other line (DH2) — no ritual panel',
    args: buildCtx(3, 'dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-bc-ritual-panel')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="bcPerformRitual"]')).toBeNull();
    },
};
