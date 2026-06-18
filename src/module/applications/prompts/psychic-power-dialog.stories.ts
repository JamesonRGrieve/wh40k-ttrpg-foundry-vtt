import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/psychic-power-roll-prompt.hbs?raw';
import { assertField, renderSheet } from '../../../../stories/test-helpers';

/**
 * PsychicPowerDialog renders `psychic-power-roll-prompt.hbs`. Like the weapon
 * prompt it has a picker branch (`powerSelect`) and a focus-power config branch
 * (psychic rating, psy-focus toggle, difficulty/range modifiers).
 */

interface PsychicArgs {
    powerSelect: boolean;
    psychicPowers?: Array<{ id: string; name: string; img: string; isSelected: boolean; items?: Array<{ name: string }> }>;
    power?: { name: string; img: string; items?: Array<{ name: string; isAttackSpecial: boolean }> };
    sourceActor?: { name: string };
    baseChar?: string;
    baseTarget?: number;
    pr?: number;
    hasFocus?: boolean;
    difficulties?: Record<string, string>;
    distance?: number;
    rangeName?: string;
    maxRange?: number;
    modifiers?: { difficulty: number; modifier: number; bonus?: number };
}

const DIFFICULTIES = { '30': 'Easy (+30)', '10': 'Routine (+10)', '0': 'Standard (+0)', '-10': 'Hard (-10)', '-30': 'Punishing (-30)' };

const SMITE: PsychicArgs['power'] = {
    name: 'Smite',
    img: 'icons/magic/lightning/bolt-strike-blue.webp',
    items: [{ name: 'Concussive (2)', isAttackSpecial: true }],
};

const meta = {
    title: 'Prompts/PsychicPowerDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        powerSelect: false,
        power: SMITE,
        sourceActor: { name: 'Sanctioned Psyker Thel' },
        baseChar: 'WP',
        baseTarget: 52,
        pr: 4,
        hasFocus: true,
        difficulties: DIFFICULTIES,
        distance: 15,
        rangeName: 'Within Range',
        maxRange: 40,
        modifiers: { difficulty: 0, modifier: 0, bonus: 1 },
    },
} satisfies Meta<PsychicArgs>;
export default meta;

type Story = StoryObj<PsychicArgs>;

/** Focus-power configuration: psychic rating, psy-focus toggle, range. */
export const FocusPower: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Smite')).toBeTruthy();
        await expect(view.getByText('52')).toBeTruthy();
        assertField(canvasElement, 'pr', 4);
        assertField(canvasElement, 'hasFocus', true);
    },
};

/** The Rating Bonus row only renders when a modifier bonus is present. */
export const WithRatingBonus: Story = {
    args: { modifiers: { difficulty: 10, modifier: 0, bonus: 2 } },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Rating Bonus/)).toBeTruthy();
    },
};

/** The power picker branch. */
export const PowerSelect: Story = {
    args: {
        powerSelect: true,
        psychicPowers: [
            { id: 'p-smite', name: 'Smite', img: 'icons/magic/lightning/bolt-strike-blue.webp', isSelected: true },
            {
                id: 'p-fearful',
                name: 'Fearful Aura',
                img: 'icons/magic/control/fear-fright-monster-purple.webp',
                isSelected: false,
                items: [{ name: 'Sustained' }],
            },
        ],
    },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Fearful Aura')).toBeTruthy();
    },
};
