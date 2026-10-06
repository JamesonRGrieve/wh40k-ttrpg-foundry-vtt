import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/sister-of-battle-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import { advanceGrantCards } from '../../rules/sister-of-battle.ts';

interface Args {
    canApply: boolean;
}

/**
 * A fixture shaped like the Sister of Battle elite advance document's
 * `grants` block (DH2 Enemies Within). At runtime the dialog reads the real
 * document by identifier; the story feeds the same pure row builder.
 */
const FIXTURE_GRANTS = {
    talents: [
        { name: 'Peer', specialization: 'Adepta Sororitas', uuid: 'Compendium.wh40k-rpg.dh2-core-items-talents.Item.DH2aTlnt00000018' },
        { name: 'Weapon Training', specialization: 'Bolt', uuid: 'Compendium.wh40k-rpg.dh2-core-items-talents-specializations.Item.DH2aTlnt00000026' },
    ],
    specialAbilities: [
        { name: 'Unlocked Advances', description: '<p>The character gains access to the Sister of Battle talent suite from Enemies Within.</p>' },
    ],
};

const meta = {
    title: 'Dialogs/SisterOfBattleDialog',
    render: (args) =>
        renderSheet(templateSrc, {
            talents: advanceGrantCards(FIXTURE_GRANTS),
            requirementsText: 'Elite Advance: Influence 50, Willpower 40, Adepta Sororitas background',
            canApply: args.canApply,
        }),
    args: {
        canApply: true,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const DisabledApply: Story = {
    args: { canApply: false },
};

export const ApplyFlow: Story = {
    play: ({ canvasElement }) => {
        const queries = within(canvasElement);
        const cards = canvasElement.querySelectorAll('[data-talent]');
        void expect(cards.length).toBe(3);
        void expect(queries.getByText(/Apply/i)).toBeTruthy();
    },
};
