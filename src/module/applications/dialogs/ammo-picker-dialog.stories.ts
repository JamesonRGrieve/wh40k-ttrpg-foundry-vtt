import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/dialogs/ammo-picker.hbs?raw';

interface AmmoEntry {
    uuid: string;
    name: string;
    img: string;
    quantity: number;
    isCurrentlyLoaded: boolean;
    modifierSummary?: string;
}

interface Args {
    weaponName: string;
    clipMax: number;
    ammoItems: AmmoEntry[];
}

const meta = {
    title: 'Dialogs/AmmoPickerDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        weaponName: 'Bolter',
        clipMax: 24,
        ammoItems: [
            {
                uuid: 'Item.ammo-bolt-standard',
                name: 'Bolt Rounds (Standard)',
                img: 'icons/svg/bullet.svg',
                quantity: 48,
                isCurrentlyLoaded: true,
            },
            {
                uuid: 'Item.ammo-bolt-hellfire',
                name: 'Hellfire Rounds',
                img: 'icons/svg/fire-bullet.svg',
                quantity: 12,
                isCurrentlyLoaded: false,
                modifierSummary: '+3 Dmg, +2 Pen',
            },
        ],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const SingleAmmo: Story = {
    args: {
        weaponName: 'Las Pistol',
        clipMax: 30,
        ammoItems: [
            {
                uuid: 'Item.ammo-laspack',
                name: 'Las Pack',
                img: 'icons/svg/battery.svg',
                quantity: 6,
                isCurrentlyLoaded: false,
            },
        ],
    },
};

export const SelectFlow: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText('Bolt Rounds (Standard)')).toBeTruthy();
        expect(canvas.getByText('loaded')).toBeTruthy();
        clickAction(canvasElement, 'selectAmmo');
        clickAction(canvasElement, 'cancel');
    },
};
