import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/simple-roll-prompt.hbs?raw';
import { assertField, renderSheet } from '../../../../stories/test-helpers';

/**
 * SimpleRollDialog renders `simple-roll-prompt.hbs` — the minimal roll prompt
 * (target number + difficulty select + flat modifier) used for generic
 * characteristic / skill tests that need no weapon / psychic context panel.
 */

interface SimpleRollArgs {
    rollData: { name: string; baseTarget: number; modifiers: { difficulty: number; modifier: number } };
    difficulties: Record<string, string>;
}

const DIFFICULTIES = {
    '60': 'Trivial (+60)',
    '30': 'Easy (+30)',
    '10': 'Routine (+10)',
    '0': 'Standard (+0)',
    '-10': 'Hard (-10)',
    '-30': 'Punishing (-30)',
};

const meta = {
    title: 'Prompts/SimpleRollDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        rollData: { name: 'Willpower Test', baseTarget: 40, modifiers: { difficulty: 0, modifier: 0 } },
        difficulties: DIFFICULTIES,
    },
} satisfies Meta<SimpleRollArgs>;
export default meta;

type Story = StoryObj<SimpleRollArgs>;

/** Standard difficulty Willpower test. */
export const Standard: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Willpower Test')).toBeTruthy();
        await expect(view.getByText('40')).toBeTruthy();
        await expect(canvasElement.querySelector('select[name="modifiers.difficulty"]')).toBeTruthy();
    },
};

/** A harder test with the difficulty select pre-set to Hard (-10). */
export const HardTest: Story = {
    args: {
        rollData: { name: 'Forbidden Lore Test', baseTarget: 33, modifiers: { difficulty: -10, modifier: 0 } },
        difficulties: DIFFICULTIES,
    },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Forbidden Lore Test')).toBeTruthy();
        assertField(canvasElement, 'modifiers.difficulty', '-10');
    },
};
