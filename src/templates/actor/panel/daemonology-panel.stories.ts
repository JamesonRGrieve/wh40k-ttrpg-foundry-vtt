/**
 * Daemonology panel (DH2 Enemies Beyond) on the character Overview tab: the
 * Forbidden Lore (Daemonology) readout and the ritual launchers. The sheet
 * builds it only for a DH2 character with a Forbidden Lore (Daemonology) row.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './daemonology-panel.hbs?raw';

initializeStoryHandlebars();

interface Ctx {
    daemonologyPanel: { loreTotal: number };
}

function renderPanel(ctx: Ctx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dh2';
    wrapper.appendChild(renderSheet(panelSrc, { ...ctx, _gameSystemId: 'dh2' }));
    return wrapper;
}

const meta: Meta<Ctx> = { title: 'Actor/Character/DaemonologyPanel' };
export default meta;
type Story = StoryObj<Ctx>;

export const Daemonologist: Story = {
    args: { daemonologyPanel: { loreTotal: 52 } },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('52');
        const exorcise = canvasElement.querySelector<HTMLButtonElement>('[data-action="performExorcism"]');
        await expect(exorcise).not.toBeNull();
        await expect(exorcise?.disabled).toBe(false);
        await expect(canvasElement.querySelector('[data-action="performSummoning"]')).not.toBeNull();
    },
};

/** Each launcher dispatches its own ritual: Summoning (#80, p. 59), then Exorcism (#83, p. 71). */
export const LaunchersDispatchTheirRitual: Story = {
    args: { daemonologyPanel: { loreTotal: 52 } },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        const seen = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('[data-wh40k-hook="daemonology-summoning-btn"]')?.click();
        canvasElement.querySelector<HTMLButtonElement>('[data-wh40k-hook="daemonology-exorcism-btn"]')?.click();
        await expect(seen.map((click) => click.action)).toEqual(['performSummoning', 'performExorcism']);
        // Both launchers name what they do for keyboard / screen-reader users.
        const unnamed = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>('button[data-action]')).filter(
            (button) => (button.getAttribute('title') ?? '') === '' || button.textContent.trim() === '',
        );
        await expect(unnamed).toEqual([]);
    },
};

/** A Forbidden Lore (Daemonology) row the character has not advanced: the readout shows its 0 total, the rituals stay open. */
export const UntrainedLore: Story = {
    args: { daemonologyPanel: { loreTotal: 0 } },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-daemonology-panel strong')?.textContent.trim()).toBe('0');
        await expect(canvasElement.querySelectorAll('button[data-action]').length).toBe(2);
    },
};

/**
 * The Overview tab includes the panel only when the sheet built
 * `daemonologyPanel` — a DH2 character with a Forbidden Lore (Daemonology) row.
 * Any other line (here Rogue Trader) or a DH2 character without the row gets no
 * context, so no launcher renders.
 */
export const AbsentWithoutContext: Story = {
    args: { daemonologyPanel: { loreTotal: 0 } },
    render: () => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('wh40k-rpg');
        wrapper.dataset['wh40kSystem'] = 'rt';
        const gate = '{{#if daemonologyPanel}}{{> systems/wh40k-rpg/templates/actor/panel/daemonology-panel.hbs}}{{else}}<p data-gate="closed"></p>{{/if}}';
        wrapper.appendChild(renderSheet(gate, { _gameSystemId: 'rt' }));
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-gate="closed"]')).not.toBeNull();
        await expect(canvasElement.querySelector('.wh40k-daemonology-panel')).toBeNull();
    },
};
