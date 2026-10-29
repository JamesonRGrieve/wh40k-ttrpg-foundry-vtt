import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/homeworld-info-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import type { HomeworldGroup } from '../../rules/homeworld-compendium.ts';
import { homeworldCardGroups } from './homeworld-cards.ts';

/**
 * Storybook stories for HomeworldInfoDialog.
 *
 * The dialog reads every home-world in the line's home-world packs at render
 * time. Stories don't run the Foundry compendium stack, so a fixture of what
 * `readLineHomeworlds` returns is projected through the real card builder —
 * two packs, one with two home-worlds, one with a home-world that grants no
 * Fate and has two bonuses.
 */

const GROUPS: HomeworldGroup[] = [
    {
        label: 'Home Worlds A',
        homeworlds: [
            {
                id: 'agri-world',
                label: 'Agri World',
                charModsPositive: ['fellowship', 'strength'],
                charModsNegative: ['agility'],
                fateBase: 2,
                emperorsBlessingMin: 7,
                aptitudes: ['Strength'],
                abilities: [{ name: 'Fixture Bonus One', description: 'Fixture text: starts with a charge talent.' }],
                woundsFlat: 8,
                woundsDice: 1,
                woundsFaces: 5,
            },
            {
                id: 'frontier-world',
                label: 'Frontier World',
                charModsPositive: ['ballisticSkill', 'perception'],
                charModsNegative: ['fellowship'],
                fateBase: 3,
                emperorsBlessingMin: 7,
                aptitudes: ['Ballistic Skill'],
                abilities: [{ name: 'Fixture Bonus Two', description: 'Fixture text: a bonus to modify their own weapons.' }],
                woundsFlat: 7,
                woundsDice: 1,
                woundsFaces: 5,
            },
        ],
    },
    {
        label: 'Home Worlds B',
        homeworlds: [
            {
                id: 'death-world',
                label: 'Death World',
                charModsPositive: ['agility', 'perception'],
                charModsNegative: ['fellowship'],
                fateBase: 0,
                emperorsBlessingMin: 0,
                aptitudes: [],
                abilities: [
                    { name: 'Fixture Bonus Three', description: 'Fixture text: wary of outsiders.' },
                    { name: 'Fixture Bonus Four', description: 'Fixture text: no common tongue.' },
                ],
                woundsFlat: 9,
                woundsDice: 1,
                woundsFaces: 5,
            },
        ],
    },
];

const meta = {
    title: 'Dialogs/HomeworldInfoDialog',
    render: () => renderSheet(templateSrc, { groups: homeworldCardGroups(GROUPS) }),
} satisfies Meta;
export default meta;

type Story = StoryObj;

export const Default: Story = {};

export const RendersEveryCardGroupedByPack: Story = {
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        void expect(canvasElement.querySelectorAll('[data-homeworld-group]')).toHaveLength(2);
        void expect(canvasElement.querySelectorAll('[data-homeworld]')).toHaveLength(3);
        void expect(cv.getByText('Home Worlds A')).toBeTruthy();
        void expect(cv.getByText('Home Worlds B')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-homeworld="agri-world"] [data-testid="hw-fate"]')?.textContent.trim()).toBe('2 (7+)');
    },
};

export const ShowsEveryBonusAndHidesAbsentFate: Story = {
    play: ({ canvasElement }) => {
        const death = canvasElement.querySelector('[data-homeworld="death-world"]');
        void expect(death?.querySelectorAll('[data-testid="hw-ability"]')).toHaveLength(2);
        void expect(death?.textContent).toMatch(/Fixture Bonus Four/);
        void expect(death?.querySelector('[data-testid="hw-fate"]')).toBeNull();
        void expect(death?.querySelector('[data-testid="hw-aptitudes"]')).toBeNull();
    },
};

export const EmptyLine: Story = {
    render: () => renderSheet(templateSrc, { groups: [] }),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector('[data-testid="hw-empty"]')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-action="close"]')).toBeTruthy();
    },
};
