/**
 * The Mutant background card (#91) the GM's Apply posts: the starting Corruption
 * written to `system.corruption` and the Twisted Flesh grant. The card states the
 * rule the grant now gives; the choice itself is offered when a Malignancy Test is
 * rolled from the sheet, so the card carries no action button of its own (an
 * earlier "Convert Failed Malignancy" button had no handler).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { MUTANT_STARTING_CORRUPTION } from '../../src/module/rules/chaos-backgrounds';
import mutantChatSrc from '../../src/templates/chat/mutant-background-chat.hbs?raw';
import { localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

interface Args {
    actorName: string | null;
}

const meta = {
    id: 'chat-mutant-background',
    title: 'Chat/Corruption/Mutant Background',
    render: (args) => {
        const wrapper = document.createElement('div');
        wrapper.style.maxWidth = '380px';
        wrapper.appendChild(renderSheet(mutantChatSrc, { startingCorruption: MUTANT_STARTING_CORRUPTION, actorName: args.actorName, gameSystem: 'dh2' }));
        return wrapper;
    },
    args: { actorName: 'Aurelia Vex' },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

/** Applied to a named actor: who, the +10, the grant, and the Twisted Flesh rule — no dead button. */
export const AppliedToActor: Story = {
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('[data-wh40k-system="dh2"]');
        await expect(card?.textContent).toContain('Aurelia Vex');
        await expect(card?.textContent).toContain(`+${MUTANT_STARTING_CORRUPTION}`);
        await expect(card?.textContent).toContain(localizeKey('WH40K.MutantBackground.Granted'));
        await expect(canvasElement.querySelector('[data-wh40k-hook="mutant-twisted-flesh-rule"]')?.textContent).toContain(
            localizeKey('WH40K.Malignancy.TwistedFlesh.OutcomeHint'),
        );
        await expect(canvasElement.querySelector('button')).toBeNull();
    },
};

/** Opened with no actor: the applied line has no name. */
export const NoActor: Story = {
    args: { actorName: null },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('strong')).toBeNull();
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.MutantBackground.AppliedMessage'));
    },
};
