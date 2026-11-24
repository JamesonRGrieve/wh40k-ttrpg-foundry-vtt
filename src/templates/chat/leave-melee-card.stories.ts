/**
 * Leaving melee card (#770): a combatant's move out of melee waits until each foe it
 * leaves behind takes its free Standard Attack or declines.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './leave-melee-card.hbs?raw';

initializeStoryHandlebars();

interface CardCtx {
    moverName: string;
    foes: Array<{ tokenId: string; name: string; pending: boolean; attacked: boolean }>;
    open: boolean;
}

const meta: Meta<CardCtx> = { title: 'Chat / Leaving Melee (#770)', render: (args) => renderSheet(cardSrc, { ...args }) };
export default meta;
type Story = StoryObj<CardCtx>;

/** Two foes still to answer: each has Free Attack and Decline; the GM can let the mover go. */
export const Waiting: Story = {
    args: {
        moverName: 'Engaged Acolyte',
        foes: [
            { tokenId: 'w', name: 'Ork West', pending: true, attacked: false },
            { tokenId: 'e', name: 'Ork East', pending: true, attacked: false },
        ],
        open: true,
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-leave-melee="attack"]').length).toBe(2);
        await expect(canvasElement.querySelectorAll('[data-leave-melee="decline"]').length).toBe(2);
        await expect(canvasElement.querySelector('[data-leave-melee="release"]')).not.toBeNull();
        // Every button explains itself (#762).
        const untipped = [...canvasElement.querySelectorAll<HTMLElement>('button')].filter((b) => (b.dataset['tooltip'] ?? '') === '');
        await expect(untipped).toEqual([]);
        await expect(canvasElement.querySelector('[data-leave-melee="attack"]')?.getAttribute('data-foe-token')).toBe('w');
    },
};

/** Every foe answered: no buttons, each answer shown. */
export const Answered: Story = {
    args: {
        moverName: 'Engaged Acolyte',
        foes: [
            { tokenId: 'w', name: 'Ork West', pending: false, attacked: true },
            { tokenId: 'e', name: 'Ork East', pending: false, attacked: false },
        ],
        open: false,
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('button')).toBeNull();
        await expect(canvasElement.textContent).toContain('attacked');
        await expect(canvasElement.textContent).toContain('declined');
    },
};
