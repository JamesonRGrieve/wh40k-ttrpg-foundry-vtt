/**
 * Storybook stories for the Only War Comrade panel (#152 — OW Core p.269–271).
 * Covers the three visual states an operator needs to verify in review:
 *
 *   1. Unharmed — green badge, in Cohesion, only Wound enabled.
 *   2. Wounded  — yellow badge, still in Cohesion, Wound and Heal enabled.
 *   3. Dead     — red badge, out of Cohesion; Replace enabled only in camp.
 *
 * Each context is built by `buildComradePanel` — the same rules-layer builder
 * the character sheet passes through — so a value the builder leaves out shows
 * here as "undefined" text, which the plays reject.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, clickAction, renderSheet } from '../../../../stories/test-helpers';
import { buildComradePanel, type ComradePanelView, type ComradeRecord } from '../../../module/rules/ow-comrade';
import panelSrc from './ow-comrade-panel.hbs?raw';

initializeStoryHandlebars();

interface ComradePanelCtx {
    comradePanel: ComradePanelView;
}

function buildContext(comrade: ComradeRecord, inCamp: boolean): ComradePanelCtx {
    return { comradePanel: buildComradePanel(comrade, inCamp) };
}

function renderPanel(ctx: ComradePanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

function button(root: HTMLElement, action: string): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
}

/** The enabled state of the Wound / Heal / Replace buttons, in that order. */
function enabled(root: HTMLElement): boolean[] {
    return ['owComradeWound', 'owComradeHeal', 'owComradeReplace'].map((action) => button(root, action)?.disabled === false);
}

async function expectNoUndefined(root: HTMLElement): Promise<void> {
    await expect(root.textContent).not.toContain('undefined');
    await expect(root.querySelector('[data-field="distance-m"]')?.textContent).toContain('5 m');
}

const meta: Meta<ComradePanelCtx> = {
    title: 'Actor/Character/OwComradePanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<ComradePanelCtx>;

export const Unharmed: Story = {
    name: 'Unharmed — green badge, in Cohesion at 3 m',
    args: buildContext({ name: 'Comrade Jaeger', state: 'unharmed', distanceM: 3, hasVisualLine: true }, false),
    play: async ({ canvasElement }) => {
        await expectNoUndefined(canvasElement);
        await expect(canvasElement.querySelector<HTMLElement>('[data-cohesion]')?.dataset['cohesion']).toBe('in');
        await expect(enabled(canvasElement)).toEqual([true, false, false]);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'owComradeWound');
        button(canvasElement, 'owComradeHeal')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeWound']);
    },
};

export const Wounded: Story = {
    name: 'Wounded — yellow badge, in Cohesion, Heal enabled',
    args: buildContext({ name: 'Comrade Jaeger', state: 'wounded', distanceM: 4, hasVisualLine: true }, false),
    play: async ({ canvasElement }) => {
        await expectNoUndefined(canvasElement);
        await expect(enabled(canvasElement)).toEqual([true, true, false]);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'owComradeHeal');
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeHeal']);
    },
};

export const DeadInField: Story = {
    name: 'Dead in the field — red badge, out of Cohesion, nothing enabled',
    args: buildContext({ name: 'Comrade Jaeger', state: 'dead', distanceM: 12, hasVisualLine: false }, false),
    play: async ({ canvasElement }) => {
        await expectNoUndefined(canvasElement);
        await expect(canvasElement.querySelector<HTMLElement>('[data-cohesion]')?.dataset['cohesion']).toBe('out');
        await expect(enabled(canvasElement)).toEqual([false, false, false]);
    },
};

export const Dead: Story = {
    name: 'Dead in camp — Replace enabled',
    args: buildContext({ name: 'Comrade Jaeger', state: 'dead', distanceM: 12, hasVisualLine: false }, true),
    play: async ({ canvasElement }) => {
        await expectNoUndefined(canvasElement);
        await expect(enabled(canvasElement)).toEqual([false, false, true]);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'owComradeReplace');
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeReplace']);
    },
};
