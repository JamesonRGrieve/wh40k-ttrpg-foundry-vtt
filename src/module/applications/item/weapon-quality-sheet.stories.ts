import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/item/item-weapon-quality-sheet.hbs?raw';

interface QualityArgs {
    item: { name: string; img: string };
    system: {
        identifier: string;
        hasLevel: boolean;
        level: number;
        description: { value: string };
        effect: string;
        notes: string;
        source: { book: string; page: string; custom: string };
    };
}

const baseSystem = (): QualityArgs['system'] => ({
    identifier: 'tearing',
    hasLevel: false,
    level: 0,
    description: { value: '<p>Roll an extra die for damage and drop the lowest.</p>' },
    effect: 'Roll extra damage die, drop lowest.',
    notes: '',
    source: { book: 'Core', page: '142', custom: '' },
});

const meta = {
    title: 'Item Sheets/WeaponQualitySheet',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        item: { name: 'Tearing', img: 'icons/svg/weapon-quality.svg' },
        system: baseSystem(),
    },
} satisfies Meta<QualityArgs>;
export default meta;

type Story = StoryObj<QualityArgs>;

export const Default: Story = {};

export const Levelled: Story = {
    args: {
        item: { name: 'Proven', img: 'icons/svg/weapon-quality.svg' },
        system: { ...baseSystem(), hasLevel: true, level: 3, identifier: 'proven' },
    },
};

export const RendersIdentifier: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Tearing')).toBeTruthy();
        expect(canvas.getAllByText('tearing').length).toBeGreaterThan(0);
    },
};
