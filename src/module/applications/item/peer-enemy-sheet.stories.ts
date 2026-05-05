import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/item/item-peer-enemy-sheet.hbs?raw';

interface Args {
    item: { name: string; system: { modifier: number; description: { value: string } } };
}

const meta = {
    title: 'Item Sheets/PeerEnemySheet',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        item: {
            name: 'Adeptus Arbites',
            system: {
                modifier: 10,
                description: { value: 'Friendly with the local Arbites precinct.' },
            },
        },
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Peer: Story = {};

export const Enemy: Story = {
    args: {
        item: {
            name: 'Hereteks of the Forge Anomaly',
            system: {
                modifier: -20,
                description: { value: 'Marked for death by rogue tech-priests.' },
            },
        },
    },
};

export const RendersFields: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Adeptus Arbites')).toBeTruthy();
        const modifier = canvasElement.querySelector<HTMLInputElement>('input[name="system.modifier"]');
        expect(modifier?.value).toBe('10');
    },
};
