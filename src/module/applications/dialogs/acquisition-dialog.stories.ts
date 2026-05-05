import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/dialogs/acquisition-dialog.hbs?raw';

interface CommonModifier {
    key: string;
    label: string;
    value: number;
    selected: boolean;
}

interface RecentAcquisition {
    item: { name: string };
    roll: number;
    target: number;
    success: boolean;
}

interface Args {
    profitFactor: { current: number };
    item: { name: string; img: string; availability: string; craftsmanship: string };
    availabilityModifier: number;
    craftsmanshipModifier: number;
    commonModifiers: CommonModifier[];
    customModifier: number;
    totalModifier: number;
    finalTarget: number;
    recentAcquisitions: RecentAcquisition[];
}

const meta = {
    title: 'Dialogs/AcquisitionDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        profitFactor: { current: 45 },
        item: {
            name: 'Bolt Pistol',
            img: 'icons/svg/pistol.svg',
            availability: 'Rare',
            craftsmanship: 'Common',
        },
        availabilityModifier: -10,
        craftsmanshipModifier: 0,
        commonModifiers: [
            { key: 'inquisition', label: 'Inquisitorial Authority', value: 30, selected: true },
            { key: 'haggle', label: 'Haggle Test (Success)', value: 10, selected: false },
            { key: 'rush', label: 'Rushed (within hours)', value: -20, selected: false },
        ],
        customModifier: 0,
        totalModifier: 20,
        finalTarget: 65,
        recentAcquisitions: [
            { item: { name: 'Las Pistol' }, roll: 32, target: 55, success: true },
            { item: { name: 'Power Sword' }, roll: 78, target: 25, success: false },
        ],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const NoRecent: Story = {
    args: { recentAcquisitions: [] },
};

export const RollFlow: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText(/Profit Factor Acquisition/)).toBeTruthy();
        expect(canvas.getByText('Bolt Pistol')).toBeTruthy();
        clickAction(canvasElement, 'roll');
        clickAction(canvasElement, 'close');
    },
};
