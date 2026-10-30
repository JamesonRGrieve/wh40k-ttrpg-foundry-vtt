/**
 * The Mutant background card (#91) the GM's Roll Starting Mutation
 * posts: the starting Corruption the origin applied (owing no Malignancy Test),
 * the starting-mutation roll and the mutation it landed on, and the Twisted
 * Flesh grant. The card states the rule the grant gives; the choice itself is
 * offered when a Malignancy Test is rolled from the sheet, so the card carries
 * no action button of its own.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import mutantChatSrc from '../../src/templates/chat/mutant-background-chat.hbs?raw';
import { localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

initializeStoryHandlebars();

interface Args {
    actorName: string | null;
    mutationName: string | null;
}

const meta = {
    id: 'chat-mutant-background',
    title: 'Chat/Corruption/Mutant Background',
    render: (args) => {
        const wrapper = document.createElement('div');
        wrapper.style.maxWidth = '380px';
        wrapper.appendChild(
            renderSheet(mutantChatSrc, {
                startingCorruption: 10,
                mutationFormula: '5d10',
                mutationTotal: 27,
                mutationName: args.mutationName,
                actorName: args.actorName,
                gameSystem: 'dh2',
            }),
        );
        return wrapper;
    },
    args: { actorName: 'Aurelia Vex', mutationName: 'Deathsight' },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<Args>;

/** Applied to a named actor: who, the +10 (no Malignancy Test), the 5d10 roll and its mutation, the grant — no dead button. */
export const AppliedToActor: Story = {
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('[data-wh40k-system="dh2"]');
        await expect(card?.textContent).toContain('Aurelia Vex');
        await expect(canvasElement.querySelector('[data-mutant-row="corruption"]')?.textContent).toContain('+10');
        await expect(canvasElement.querySelector('[data-mutant-row="no-malignancy"]')?.textContent).toContain(
            localizeKey('WH40K.MutantBackground.NoMalignancyTest'),
        );
        const mutation = canvasElement.querySelector('[data-mutant-row="mutation"]');
        await expect(mutation?.textContent).toContain('5d10 = 27');
        await expect(mutation?.textContent).toContain('Deathsight');
        await expect(card?.textContent).toContain(localizeKey('WH40K.MutantBackground.Granted'));
        await expect(canvasElement.querySelector('[data-wh40k-hook="mutant-twisted-flesh-rule"]')?.textContent).toContain(
            localizeKey('WH40K.Malignancy.TwistedFlesh.OutcomeHint'),
        );
        await expect(canvasElement.querySelector('button')).toBeNull();
    },
};

/** A total in a table gap: the card says so rather than naming a mutation. */
export const NoMutationRow: Story = {
    args: { mutationName: null },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-mutant-row="mutation"]')?.textContent).toContain(localizeKey('WH40K.MutationRoll.NoMutation'));
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
