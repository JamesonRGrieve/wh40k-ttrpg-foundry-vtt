import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { planReinforcementCall, reinforcementFinalCost } from '../../src/module/rules/reinforcement.ts';
import chatSrc from '../../src/templates/chat/reinforcement-call-chat.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * The chat card posted when the GM calls in a Reinforcement Character (#77,
 * DH2). It shows the cost breakdown (printed cost, Peer
 * discount, GM adjustment), who spent what, and the Subtlety loss. Values come
 * from the same pure resolvers the call dialog uses.
 */
initializeStoryHandlebars();

const meta: Meta = { title: 'Chat Cards/ReinforcementCall' };
export default meta;
type Story = StoryObj;

export const CanonessWithContribution: Story = {
    render: () => {
        // Sister of Battle Canoness: cost 5, Peer (Adepta Sororitas) −2, GM +1 → 4.
        const finalCost = reinforcementFinalCost(5, 2, 1);
        const result = planReinforcementCall({
            callerInfluence: 55,
            influenceMinimum: 50,
            callerSkill: { rank: 0, required: null },
            finalCost,
            contributions: [{ id: 'magnus', influence: 30, amount: 2 }],
        });
        const plan = result.ok ? result.plan : null;
        const root = document.createElement('div');
        root.className = 'wh40k-rpg';
        root.append(
            renderSheet(chatSrc, {
                gameSystem: 'dh2',
                rcName: 'Sister of Battle Canoness',
                callerName: 'Ibnad',
                baseCost: 5,
                peer: 'Adepta Sororitas',
                peerDiscount: 2,
                gmAdjustment: 1,
                finalCost,
                payments: [
                    { name: 'Ibnad', amount: plan?.callerPays ?? 0 },
                    { name: 'Magnus', amount: 2 },
                ],
                subtletyLoss: plan?.subtletyLoss ?? 0,
            }),
        );
        return root;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-call-chat"]')?.getAttribute('data-wh40k-system')).toBe('dh2');
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-chat-final-cost"]')?.textContent).toBe('4');
        const payments = Array.from(canvasElement.querySelectorAll('[data-wh40k-hook="rc-chat-payment"]'), (li) => li.textContent);
        await expect(payments).toEqual(['Ibnad spends 2 Influence', 'Magnus spends 2 Influence']);
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-chat-corruption"]')).toBeNull();
    },
};

/** Thrice-Bound Daemonhost: the caller gains 1d5 Corruption. */
export const DaemonhostCorruption: Story = {
    render: () => {
        const root = document.createElement('div');
        root.className = 'wh40k-rpg';
        root.append(
            renderSheet(chatSrc, {
                gameSystem: 'dh2',
                rcName: 'Thrice-Bound Daemonhost',
                callerName: 'A.Z.',
                baseCost: 5,
                peer: '',
                peerDiscount: 0,
                gmAdjustment: 0,
                finalCost: 5,
                payments: [{ name: 'A.Z.', amount: 5 }],
                subtletyLoss: 5,
                corruptionGained: 3,
                corruptionFormula: '1d5',
            }),
        );
        return root;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-chat-corruption"]')?.textContent.trim()).toBe('A.Z. gains 3 Corruption (1d5)');
    },
};
