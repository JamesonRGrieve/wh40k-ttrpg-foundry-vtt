import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/item/item-trait-sheet.hbs?raw';

interface TraitArgs {
    item: {
        name: string;
        img: string;
        system: {
            categoryLabel: string;
            hasLevel: boolean;
            level: number;
            isVariable: boolean;
            modifiers: {
                characteristics: Record<string, number> | null;
                skills: Record<string, number> | null;
                combat: Record<string, number> | null;
                wounds: number | null;
            };
            description: { value: string };
        };
    };
    system: { description: { value: string } };
}

const baseSystem = (): TraitArgs['item']['system'] => ({
    categoryLabel: 'Physical',
    hasLevel: true,
    level: 3,
    isVariable: false,
    modifiers: { characteristics: null, skills: null, combat: null, wounds: null },
    description: { value: '<p>An ancient creature trait.</p>' },
});

const meta = {
    title: 'Item Sheets/TraitSheet',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        item: { name: 'Sturdy', img: 'icons/svg/shield.svg', system: baseSystem() },
        system: { description: { value: '<p>An ancient creature trait.</p>' } },
    },
} satisfies Meta<TraitArgs>;
export default meta;

type Story = StoryObj<TraitArgs>;

export const Default: Story = {};

export const Variable: Story = {
    args: {
        item: {
            name: 'Daemonic (X)',
            img: 'icons/svg/daemon.svg',
            system: { ...baseSystem(), isVariable: true, hasLevel: false, categoryLabel: 'Daemonic' },
        },
        system: { description: { value: '<p>Daemonic creatures vary in power.</p>' } },
    },
};

export const RendersBadges: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Sturdy')).toBeTruthy();
        expect(canvas.getAllByText('Physical').length).toBeGreaterThan(0);
    },
};
