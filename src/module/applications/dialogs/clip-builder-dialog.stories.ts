import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/clip-builder.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface AmmoEntry {
    uuid: string;
    name: string;
    img: string;
    quantity: number;
    modifierSummary?: string;
}

interface Args {
    weaponName: string;
    clipMax: number;
    ammoItems: AmmoEntry[];
}

const meta = {
    title: 'Dialogs/ClipBuilderDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        weaponName: 'Bolter',
        clipMax: 24,
        ammoItems: [
            { uuid: 'Item.ammo-bolt-standard', name: 'Bolt Rounds (Standard)', img: 'icons/svg/bullet.svg', quantity: 48 },
            { uuid: 'Item.ammo-bolt-kraken', name: 'Kraken Rounds', img: 'icons/svg/fire-bullet.svg', quantity: 12, modifierSummary: '+0 Dmg, +3 Pen' },
            { uuid: 'Item.ammo-bolt-hellfire', name: 'Hellfire Rounds', img: 'icons/svg/fire-bullet.svg', quantity: 8, modifierSummary: '+3 Dmg' },
        ],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const MixedLoadout: Story = {
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByText('Kraken Rounds')).toBeTruthy();
        // Every ammo type gets an ordered count input.
        const counts = canvasElement.querySelectorAll('input.clip-builder-count');
        await expect(counts.length).toBe(3);
    },
};
