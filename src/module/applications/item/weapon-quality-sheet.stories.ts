import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-weapon-quality-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface QualityItem {
    name: string;
    img: string;
}
interface QualitySystem {
    identifier: string;
    hasLevel: boolean;
    level: number;
    description: { value: string };
    effect: string;
    notes: string;
    source: { book: string; page: string; custom: string };
}
interface QualityArgs {
    item: QualityItem;
    system: QualitySystem;
    [key: string]: QualityItem | QualitySystem;
}

const baseSystem = (): QualitySystem => ({
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
    render: (args) => renderSheet(templateSrc, args),
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
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Tearing')).toBeTruthy();
        await expect(view.getAllByText('tearing').length).toBeGreaterThan(0);
    },
};
