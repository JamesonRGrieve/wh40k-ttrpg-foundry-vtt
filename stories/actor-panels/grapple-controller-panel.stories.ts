/**
 * Storybook stories for the Grapple Controller Panel (#120 — core.md
 * L10155-10180).
 *
 * The panel renders the current `grappleState` badge and the five
 * opposed-Strength action buttons (Damage / Throw Down / Break Free /
 * Stand Up / Move). The Status tab gates the include on
 * `grappleState !== 'none'`; these stories exercise the rendered panel
 * directly so the visual treatment is review-able under both
 * `grappling` and `controlled` states, and assert that each side's
 * buttons send the action the character sheet handles.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import panelSrc from '../../src/templates/actor/panel/grapple-controller-panel.hbs?raw';
import { captureActionClicks, renderSheet } from '../test-helpers';

type GrappleState = 'none' | 'grappling' | 'controlled';

interface GrappleContext {
    grappleState: GrappleState;
}

/** The five actions, in the order the panel lays them out. */
const GRAPPLE_ACTIONS = ['grappleDamageOpponent', 'grappleThrowDownOpponent', 'grappleBreakFree', 'grappleStandUp', 'grappleMove'];

function renderPanel(ctx: GrappleContext, gameSystem?: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    if (gameSystem !== undefined) wrapper.dataset['wh40kSystem'] = gameSystem;
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

/** The panel root, its state badge text, and its action buttons. */
function panelParts(canvasElement: HTMLElement): { panel: HTMLElement | null; badge: string; actions: string[] } {
    const panel = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="grapple-panel"]');
    const badge = panel?.querySelector('header > span')?.textContent.trim() ?? '';
    const actions = Array.from(panel?.querySelectorAll<HTMLButtonElement>('button[data-action]') ?? [], (button) => button.dataset['action'] ?? '');
    return { panel, badge, actions };
}

const meta: Meta<GrappleContext> = {
    title: 'Actor/Panels/GrappleControllerPanel',
};
export default meta;
type Story = StoryObj<GrappleContext>;

export const Grappling: Story = {
    name: 'State: grappling (controller)',
    args: { grappleState: 'grappling' },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        const { panel, badge, actions } = panelParts(canvasElement);
        await expect(panel?.dataset['grappleState']).toBe('grappling');
        await expect(badge).toBe('Grappling');
        await expect(actions).toEqual(GRAPPLE_ACTIONS);
        // The controller's own actions send what the sheet handles.
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('[data-wh40k-hook="grapple-damage-btn"]')?.click();
        canvasElement.querySelector<HTMLButtonElement>('[data-wh40k-hook="grapple-throw-btn"]')?.click();
        await expect(clicks.map((click) => click.action)).toEqual(['grappleDamageOpponent', 'grappleThrowDownOpponent']);
    },
};

export const Controlled: Story = {
    name: 'State: controlled (victim)',
    args: { grappleState: 'controlled' },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        const { panel, badge, actions } = panelParts(canvasElement);
        await expect(panel?.dataset['grappleState']).toBe('controlled');
        await expect(badge).toBe('Controlled');
        await expect(actions).toEqual(GRAPPLE_ACTIONS);
        // Break Free is the controlled side's way out of the grapple.
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('[data-wh40k-hook="grapple-break-btn"]')?.click();
        canvasElement.querySelector<HTMLButtonElement>('[data-wh40k-hook="grapple-stand-btn"]')?.click();
        canvasElement.querySelector<HTMLButtonElement>('[data-wh40k-hook="grapple-move-btn"]')?.click();
        await expect(clicks.map((click) => click.action)).toEqual(['grappleBreakFree', 'grappleStandUp', 'grappleMove']);
    },
};

export const BothSides: Story = {
    name: 'Both sides of one grapple',
    args: { grappleState: 'grappling' },
    render: () => {
        const row = document.createElement('div');
        row.classList.add('tw-grid', 'tw-grid-cols-2', 'tw-gap-3');
        row.append(renderPanel({ grappleState: 'grappling' }), renderPanel({ grappleState: 'controlled' }));
        return row;
    },
    play: async ({ canvasElement }) => {
        const states = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-wh40k-hook="grapple-panel"]'), (panel) => panel.dataset['grappleState']);
        await expect(states).toEqual(['grappling', 'controlled']);
    },
};

export const PerSystem: Story = {
    name: 'Per system — the controller panel under each line',
    args: { grappleState: 'grappling' },
    render: (args) => {
        const grid = document.createElement('div');
        grid.classList.add('tw-grid', 'tw-grid-cols-2', 'tw-gap-3');
        for (const gameSystem of ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt']) grid.appendChild(renderPanel(args, gameSystem));
        return grid;
    },
    play: async ({ canvasElement }) => {
        const counts = Array.from(
            canvasElement.querySelectorAll('[data-wh40k-hook="grapple-panel"]'),
            (panel) => panel.querySelectorAll('button[data-action]').length,
        );
        await expect(counts).toEqual(Array.from({ length: 6 }, () => GRAPPLE_ACTIONS.length));
    },
};
