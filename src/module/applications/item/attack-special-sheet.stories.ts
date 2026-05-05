import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/item/item-attack-special-sheet.hbs?raw';

interface Args {
    item: {
        name: string;
        img: string;
        system: {
            hasLevel: boolean;
            enabled: boolean;
            level: number;
            source: string;
            description: { value: string };
        };
    };
}

const baseItem = (): Args['item'] => ({
    name: 'Lightning Arc',
    img: 'icons/svg/lightning.svg',
    system: {
        hasLevel: true,
        enabled: true,
        level: 2,
        source: 'Power Weapon',
        description: { value: 'Releases a coruscating arc of lightning on a successful hit.' },
    },
});

const meta = {
    title: 'Item Sheets/AttackSpecialSheet',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: { item: baseItem() },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const Disabled: Story = {
    args: {
        item: {
            ...baseItem(),
            system: { ...baseItem().system, enabled: false, hasLevel: false },
        },
    },
};

export const RendersAndAcceptsName: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const nameInput = canvas.getByDisplayValue('Lightning Arc') as HTMLInputElement;
        expect(nameInput).toBeTruthy();
        expect(nameInput.getAttribute('name')).toBe('name');
    },
};
