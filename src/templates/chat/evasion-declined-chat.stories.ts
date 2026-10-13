/**
 * Storybook story for the evasion-declined card (`evasion-declined-chat.hbs`, #414):
 * the defender takes the hit — no test, no Reaction — and the attack's damage proceeds.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './evasion-declined-chat.hbs?raw';

interface DeclinedCtx {
    summary: string;
}

const meta: Meta<DeclinedCtx> = {
    title: 'Chat / Evasion Declined',
};
export default meta;
type Story = StoryObj<DeclinedCtx>;

export const TakesTheHit: Story = {
    name: 'Takes the hit',
    args: { summary: 'Lucius Varn takes the hit' },
    render: (args) => {
        const wrapper = document.createElement('div');
        wrapper.classList.add('wh40k-rpg');
        wrapper.appendChild(renderSheet(cardSrc, args));
        return wrapper;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Lucius Varn takes the hit');
        await expect(canvasElement.querySelector('[data-evasion-declined]')).not.toBeNull();
    },
};
