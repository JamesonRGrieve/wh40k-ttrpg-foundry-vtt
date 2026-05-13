import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/characteristic-setup.hbs?raw';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

interface RollEntry {
    index: number;
    displayIndex: number;
    value?: number;
    isEmpty?: boolean;
    isAssigned?: boolean;
}

interface CharRow {
    short: string;
    label: string;
    key: string;
    hasRoll?: boolean;
    rollValue?: number;
}

interface Args {
    rollsBank: RollEntry[];
    characteristicRows: CharRow[][];
}

const meta = {
    title: 'Dialogs/CharacteristicSetupDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        rollsBank: [
            { index: 0, displayIndex: 1, value: 38 },
            { index: 1, displayIndex: 2, value: 42 },
            { index: 2, displayIndex: 3, value: 31 },
            { index: 3, displayIndex: 4, value: 45 },
            { index: 4, displayIndex: 5, value: 28, isAssigned: true },
            { index: 5, displayIndex: 6, value: 36 },
            { index: 6, displayIndex: 7, isEmpty: true },
            { index: 7, displayIndex: 8, isEmpty: true },
            { index: 8, displayIndex: 9, isEmpty: true },
        ],
        characteristicRows: [
            [
                { short: 'WS', label: 'Weapon Skill', key: 'ws', hasRoll: false },
                { short: 'BS', label: 'Ballistic Skill', key: 'bs', hasRoll: true, rollValue: 28 },
                { short: 'S', label: 'Strength', key: 's', hasRoll: false },
            ],
            [
                { short: 'T', label: 'Toughness', key: 't', hasRoll: false },
                { short: 'Ag', label: 'Agility', key: 'ag', hasRoll: false },
                { short: 'Int', label: 'Intelligence', key: 'int', hasRoll: false },
            ],
        ],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const PartiallyFilled: Story = {};

export const EmptyBank: Story = {
    args: {
        rollsBank: Array.from({ length: 9 }, (_, i) => ({
            index: i,
            displayIndex: i + 1,
            isEmpty: true,
        })),
        characteristicRows: [
            [
                { short: 'WS', label: 'Weapon Skill', key: 'ws' },
                { short: 'BS', label: 'Ballistic Skill', key: 'bs' },
                { short: 'S', label: 'Strength', key: 's' },
            ],
        ],
    },
};

/**
 * Asserts each rolls-bank tile carries `data-roll-index`. The runtime sheet
 * resolves drag targets by reading this attribute, so a regression in the
 * rendered attribute is a real regression.
 */
export const RollIndexAttributes: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const tiles = canvasElement.querySelectorAll('[data-roll-index]');
        expect(tiles.length).toBe(9);
        // Tile 0 should be a populated, non-assigned roll → draggable.
        const first = tiles[0] as HTMLElement;
        expect(first.getAttribute('draggable')).toBe('true');
        void canvas;
    },
};
