import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { SISTER_OF_BATTLE_TALENTS } from '../../src/module/rules/sister-of-battle.ts';
import templateSrc from '../../src/templates/prompt/sister-of-battle-dialog.hbs?raw';
import { renderSheet } from '../test-helpers';

interface TalentCard {
    id: string;
    label: string;
    summary: string;
}

interface Args {
    canApply: boolean;
}

/**
 * Story-only label resolver — at runtime the dialog routes labels
 * through `game.i18n.localize`, but Storybook has no i18n bridge,
 * so we expand the keys to their en.json English strings here.
 */
const LABELS: Record<string, string> = {
    'WH40K.SisterOfBattle.FaithOfEmperor': 'Faith of the Emperor',
    'WH40K.SisterOfBattle.FaithOfEmperorSummary': '+10 Willpower vs psychic powers.',
    'WH40K.SisterOfBattle.HolyAegis': 'Holy Aegis',
    'WH40K.SisterOfBattle.HolyAegisSummary': 'Once per round, ignore 1d10 damage from a daemonic source.',
    'WH40K.SisterOfBattle.SistersResolve': "Sister's Resolve",
    'WH40K.SisterOfBattle.SistersResolveSummary': '+20 to all Fear tests.',
};

function buildTalents(): TalentCard[] {
    return SISTER_OF_BATTLE_TALENTS.map((t) => ({
        id: t.id,
        label: LABELS[t.label] ?? t.label,
        summary: LABELS[t.summary] ?? t.summary,
    }));
}

const meta = {
    title: 'Dialogs/SisterOfBattleDialog',
    render: (args) =>
        renderSheet(templateSrc, {
            talents: buildTalents(),
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
