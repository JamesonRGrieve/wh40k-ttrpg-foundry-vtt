import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-storage-location-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface EmbeddedItem {
    id: string;
    type: string;
    name: string;
}

interface StorageLocationItem {
    name: string;
    img: string;
    items: EmbeddedItem[];
    system: { description: { value: string } };
}
interface Args {
    item: StorageLocationItem;
    [key: string]: StorageLocationItem;
}

const meta = {
    title: 'Item Sheets/StorageLocationSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: {
        item: {
            name: 'Footlocker',
            img: 'icons/svg/chest.svg',
            items: [],
            system: { description: { value: 'A reinforced footlocker, plasteel-clad.' } },
        },
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Empty: Story = {};

export const RendersTabs: Story = {
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByDisplayValue('Footlocker')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-tab="items"]')).toBeTruthy();
        void expect(canvasElement.querySelector('[data-tab="description"]')).toBeTruthy();
    },
};
