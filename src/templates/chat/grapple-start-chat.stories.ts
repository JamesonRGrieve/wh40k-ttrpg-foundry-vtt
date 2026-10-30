/**
 * Storybook stories for the grapple-start card (#450; DH2): a grapple
 * attempt landed and was not evaded, so the attacker controls a grapple on the
 * target. Grappling is in every line; the card renders under each line's system
 * attribute.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import type { SystemId } from '../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './grapple-start-chat.hbs?raw';

initializeStoryHandlebars();

interface Args {
    gameSystem: SystemId;
    controllerName: string;
    targetName: string;
}

function renderCard(args: Args): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.style.maxWidth = '300px';
    wrapper.appendChild(renderSheet(cardSrc, args));
    return wrapper;
}

const meta: Meta<Args> = {
    title: 'Chat/GrappleStartChat',
    render: (args) => renderCard(args),
    args: { gameSystem: 'dh2', controllerName: 'Sister Ophelia', targetName: 'Cultist' },
};
export default meta;
type Story = StoryObj<Args>;

/** The controller and the held target, and the grapple's standing rules. */
export const Begun: Story = {
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('[data-wh40k-hook="grapple-start-card"]');
        await expect(card?.textContent).toContain('Sister Ophelia has Cultist in a grapple, and controls it.');
        await expect(card?.textContent).toContain('Neither participant can use Reactions.');
        await expect(card?.textContent).toContain('Sister Ophelia may end the grapple as a Free Action.');
        await expect(card?.getAttribute('data-wh40k-surface')).toBe('dark');
    },
};

const LINES: SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw'];

/** The same card under each line. */
export const PerSystem: Story = {
    render: (args) => {
        const root = document.createElement('div');
        for (const gameSystem of LINES) root.appendChild(renderCard({ ...args, gameSystem }));
        return root;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="grapple-start-card"]').length).toBe(LINES.length);
    },
};
