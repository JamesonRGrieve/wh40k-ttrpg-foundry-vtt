/**
 * Stories for the GM Reinforcement Character panel on the NPC sheet (#77,
 * DH2). The NPC sheet builds `reinforcementPanel` only for a DH2
 * NPC flagged `isReinforcement`, from its `system.reinforcement` terms; the
 * other lines never build it, so the include site renders nothing there.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { callerRequirementView } from '../../src/module/applications/dialogs/reinforcement-call-view.ts';
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
    callerRequirement: ReturnType<typeof callerRequirementView>;
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
    // Arco-Flagellant: a dice-formula Peer discount.
    args: { hasTerms: true, influenceMinimum: 35, influenceCost: 6, peer: 'Adeptus Ministorum', peerAmount: '1d5', callerRequirement: null },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const WithTerms: Story = {
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector('[data-wh40k-hook="rc-panel"]');
        await expect(panel?.textContent).toContain('35');
        await expect(panel?.textContent).toContain('Caller has Peer (Adeptus Ministorum): cost −1d5');
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]')?.disabled).toBe(false);
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-caller-terms"]')).toBeNull();
    },
};

/** Thrice-Bound Daemonhost: terms for the caller, no Peer discount. */
export const DaemonhostCallerTerms: Story = {
    args: {
        hasTerms: true,
        influenceMinimum: 50,
        influenceCost: 5,
        peer: '',
        peerAmount: '',
        callerRequirement: callerRequirementView({ skill: 'forbiddenLore', specialization: 'Daemonology', rank: 2, corruption: '1d5' }, 'Forbidden Lore'),
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-caller-skill"]')?.textContent).toBe(
            'The caller must have Forbidden Lore (Daemonology) at Trained or better.',
        );
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-caller-corruption"]')?.textContent).toBe('The caller gains 1d5 Corruption points.');
    },
};

export const NoPrintedTerms: Story = {
    args: { hasTerms: false, influenceMinimum: null, influenceCost: null, peer: '', peerAmount: '', callerRequirement: null },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-panel-no-terms"]')).not.toBeNull();
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]')?.disabled).toBe(true);
    },
};
