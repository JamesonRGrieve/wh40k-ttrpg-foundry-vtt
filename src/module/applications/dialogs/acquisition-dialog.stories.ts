import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/acquisition-dialog.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

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

interface SelectorChoice {
    key: string;
    labelKey: string;
    value: number;
    selected: boolean;
}

interface Args {
    profitFactor: { current: number };
    item: { name: string; img: string; availability: string; craftsmanship: string };
    availabilityModifier: number;
    craftsmanshipModifier: number;
    scaleModifier: number;
    availabilityChoices: SelectorChoice[];
    craftsmanshipChoices: SelectorChoice[];
    scaleChoices: SelectorChoice[];
    commonModifiers: CommonModifier[];
    customModifier: number;
    totalModifier: number;
    finalTarget: number;
    autoSuccess: boolean;
    autoFail: boolean;
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
        scaleModifier: 30,
        availabilityChoices: [
            { key: 'plentiful', labelKey: 'WH40K.AcquisitionScale.Availability.Plentiful', value: 30, selected: false },
            { key: 'common', labelKey: 'WH40K.AcquisitionScale.Availability.Common', value: 20, selected: false },
            { key: 'rare', labelKey: 'WH40K.AcquisitionScale.Availability.Rare', value: -10, selected: true },
            { key: 'veryRare', labelKey: 'WH40K.AcquisitionScale.Availability.VeryRare', value: -20, selected: false },
        ],
        craftsmanshipChoices: [
            { key: 'poor', labelKey: 'WH40K.AcquisitionScale.Craftsmanship.Poor', value: 10, selected: false },
            { key: 'common', labelKey: 'WH40K.AcquisitionScale.Craftsmanship.Common', value: 0, selected: true },
            { key: 'good', labelKey: 'WH40K.AcquisitionScale.Craftsmanship.Good', value: -10, selected: false },
            { key: 'best', labelKey: 'WH40K.AcquisitionScale.Craftsmanship.Best', value: -30, selected: false },
        ],
        scaleChoices: [
            { key: 'negligible', labelKey: 'WH40K.AcquisitionScale.Scale.Negligible', value: 30, selected: true },
            { key: 'trivial', labelKey: 'WH40K.AcquisitionScale.Scale.Trivial', value: 20, selected: false },
            { key: 'minor', labelKey: 'WH40K.AcquisitionScale.Scale.Minor', value: 10, selected: false },
            { key: 'standard', labelKey: 'WH40K.AcquisitionScale.Scale.Standard', value: 0, selected: false },
            { key: 'major', labelKey: 'WH40K.AcquisitionScale.Scale.Major', value: -10, selected: false },
            { key: 'significant', labelKey: 'WH40K.AcquisitionScale.Scale.Significant', value: -20, selected: false },
            { key: 'vast', labelKey: 'WH40K.AcquisitionScale.Scale.Vast', value: -30, selected: false },
        ],
        commonModifiers: [
            { key: 'inquisition', label: 'WH40K.AcquisitionScale.Common.Haggling', value: 30, selected: true },
            { key: 'haggle', label: 'WH40K.AcquisitionScale.Common.Bulk', value: 10, selected: false },
            { key: 'rush', label: 'WH40K.AcquisitionScale.Common.Rushed', value: -20, selected: false },
        ],
        customModifier: 0,
        totalModifier: 20,
        finalTarget: 65,
        autoSuccess: false,
        autoFail: false,
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
        const storyCanvas = within(canvasElement);
        // localize() in stories returns the raw key when no langpack is
        // mounted; the Header key resolves to itself.
        await expect(storyCanvas.getByText(/AcquisitionScale\.Header|Profit Factor Acquisition/)).toBeTruthy();
        await expect(storyCanvas.getByText('Bolt Pistol')).toBeTruthy();
        clickAction(canvasElement, 'roll');
        clickAction(canvasElement, 'close');
    },
};

export const AutoSuccess: Story = {
    args: {
        profitFactor: { current: 80 },
        availabilityModifier: 70,
        craftsmanshipModifier: -30,
        scaleModifier: 30,
        availabilityChoices: [
            { key: 'ubiquitous', labelKey: 'WH40K.AcquisitionScale.Availability.Ubiquitous', value: 70, selected: true },
            { key: 'plentiful', labelKey: 'WH40K.AcquisitionScale.Availability.Plentiful', value: 30, selected: false },
        ],
        craftsmanshipChoices: [
            { key: 'best', labelKey: 'WH40K.AcquisitionScale.Craftsmanship.Best', value: -30, selected: true },
            { key: 'common', labelKey: 'WH40K.AcquisitionScale.Craftsmanship.Common', value: 0, selected: false },
        ],
        scaleChoices: [{ key: 'negligible', labelKey: 'WH40K.AcquisitionScale.Scale.Negligible', value: 30, selected: true }],
        totalModifier: 70,
        finalTarget: 150,
        autoSuccess: true,
        autoFail: false,
        recentAcquisitions: [],
    },
};

export const AutoFail: Story = {
    args: {
        profitFactor: { current: 10 },
        availabilityModifier: -70,
        craftsmanshipModifier: -30,
        scaleModifier: -30,
        availabilityChoices: [{ key: 'unique', labelKey: 'WH40K.AcquisitionScale.Availability.Unique', value: -70, selected: true }],
        craftsmanshipChoices: [{ key: 'best', labelKey: 'WH40K.AcquisitionScale.Craftsmanship.Best', value: -30, selected: true }],
        scaleChoices: [{ key: 'vast', labelKey: 'WH40K.AcquisitionScale.Scale.Vast', value: -30, selected: true }],
        totalModifier: -130,
        finalTarget: -120,
        autoSuccess: false,
        autoFail: true,
        recentAcquisitions: [],
    },
};
