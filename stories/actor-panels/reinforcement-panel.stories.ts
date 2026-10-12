/**
 * Stories for the GM Reinforcement Character panel on the NPC sheet (#77,
 * DH2 core p. 294). The NPC sheet builds `reinforcementPanel` only for a DH2
 * NPC flagged `isReinforcement`, from its `system.reinforcement` terms; the
 * other lines never build it, so the include site renders nothing there.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import panelSrc from '../../src/templates/actor/panel/reinforcement-panel.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

interface Args {
    hasTerms: boolean;
    influenceMinimum: number | null;
    influenceCost: number | null;
    peer: string;
    peerAmount: string;
}

function renderPanel(args: Args): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg sheet actor npc';
    root.dataset['wh40kSystem'] = 'dh2';
    root.append(renderSheet(panelSrc, { reinforcementPanel: args }));
    return root;
}

const meta = {
    title: 'Actor/Panels/ReinforcementPanel',
    render: renderPanel,
    // Arco-Flagellant (Enemies Within p. 40): a dice-formula Peer discount.
    args: { hasTerms: true, influenceMinimum: 35, influenceCost: 6, peer: 'Adeptus Ministorum', peerAmount: '1d5' },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const WithTerms: Story = {
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector('[data-wh40k-hook="rc-panel"]');
        await expect(panel?.textContent).toContain('35');
        await expect(panel?.textContent).toContain('Caller has Peer (Adeptus Ministorum): cost −1d5');
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]')?.disabled).toBe(false);
    },
};

export const NoPrintedTerms: Story = {
    args: { hasTerms: false, influenceMinimum: null, influenceCost: null, peer: '', peerAmount: '' },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-panel-no-terms"]')).not.toBeNull();
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]')?.disabled).toBe(true);
    },
};
