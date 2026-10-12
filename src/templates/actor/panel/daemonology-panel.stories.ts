/**
 * Daemonology panel (DH2 Enemies Beyond) on the character Overview tab: the
 * Forbidden Lore (Daemonology) readout and the ritual launchers. The sheet
 * builds it only for a DH2 character with a Forbidden Lore (Daemonology) row.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
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
