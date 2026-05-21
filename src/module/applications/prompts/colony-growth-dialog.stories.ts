import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/colony-growth-dialog.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

interface CharacteristicRow {
    id: 'size' | 'complacency' | 'order' | 'productivity' | 'piety';
    labelKey: string;
    value: number;
    min: number;
    max: number;
}

interface Args {
    characteristics: CharacteristicRow[];
    tierKey: string;
    growthModifier: number;
    agriculturalSoftener: boolean;
    ecclesiasticalOrderSwap: boolean;
}

const DEFAULT_ROWS: CharacteristicRow[] = [
    { id: 'size', labelKey: 'WH40K.RT.Colony.Characteristic.Size', value: 3, min: 0, max: 10 },
    { id: 'complacency', labelKey: 'WH40K.RT.Colony.Characteristic.Complacency', value: 2, min: 0, max: 99 },
    { id: 'order', labelKey: 'WH40K.RT.Colony.Characteristic.Order', value: 4, min: 0, max: 99 },
    { id: 'productivity', labelKey: 'WH40K.RT.Colony.Characteristic.Productivity', value: 3, min: 0, max: 99 },
    { id: 'piety', labelKey: 'WH40K.RT.Colony.Characteristic.Piety', value: 2, min: 0, max: 99 },
];

const meta = {
    title: 'Prompts/ColonyGrowthDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        characteristics: DEFAULT_ROWS,
        tierKey: 'WH40K.RT.Colony.Tier.Foothold',
        growthModifier: 0,
        agriculturalSoftener: false,
        ecclesiasticalOrderSwap: false,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Founding-level Colony (Outpost). */
export const Outpost: Story = {
    args: {
        characteristics: DEFAULT_ROWS.map((r) => ({ ...r, value: r.id === 'size' ? 1 : 1 })),
        tierKey: 'WH40K.RT.Colony.Tier.Outpost',
    },
};

/** Late-game Colony with PF burn for an extra +5 to the growth roll. */
export const HiveWithBurn: Story = {
    args: {
        characteristics: [
            { id: 'size', labelKey: 'WH40K.RT.Colony.Characteristic.Size', value: 10, min: 0, max: 10 },
            { id: 'complacency', labelKey: 'WH40K.RT.Colony.Characteristic.Complacency', value: 8, min: 0, max: 99 },
            { id: 'order', labelKey: 'WH40K.RT.Colony.Characteristic.Order', value: 7, min: 0, max: 99 },
            { id: 'productivity', labelKey: 'WH40K.RT.Colony.Characteristic.Productivity', value: 9, min: 0, max: 99 },
            { id: 'piety', labelKey: 'WH40K.RT.Colony.Characteristic.Piety', value: 6, min: 0, max: 99 },
        ],
        tierKey: 'WH40K.RT.Colony.Tier.Hive',
        growthModifier: 5,
    },
};

/** Agricultural Colony with the softener engaged. */
export const AgriculturalSoftener: Story = {
    args: {
        agriculturalSoftener: true,
    },
};

/** Roll-button click flow (smoke). */
export const RollFlow: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Colony/)).toBeTruthy();
        clickAction(canvasElement, 'rollGrowth');
    },
};
