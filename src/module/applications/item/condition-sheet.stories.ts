import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-condition-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface ConditionSystem {
    nature: string;
    natureIcon: string;
    natureLabel: string;
    appliesTo: string;
    appliesToIcon: string;
    appliesToLabel: string;
    stackable: boolean;
    stacks: number;
    isTemporary: boolean;
    durationDisplay: string;
    duration: { value: number; units: string };
    notes: string;
    description: { value: string };
    effect: string;
    removal: string;
}
interface ConditionItem {
    name: string;
    img: string;
    system: ConditionSystem;
}
interface ConditionArgs {
    item: ConditionItem;
    system: ConditionSystem;
    [key: string]: ConditionItem | ConditionSystem;
}

const baseSystem = (): ConditionSystem => ({
    nature: 'mental',
    natureIcon: 'fa-brain',
    natureLabel: 'Mental',
    appliesTo: 'character',
    appliesToIcon: 'fa-user',
    appliesToLabel: 'Character',
    stackable: true,
    stacks: 2,
    isTemporary: true,
    durationDisplay: '3 rounds',
    duration: { value: 3, units: 'rounds' },
    notes: 'Lingering effect.',
    description: { value: 'A debilitating mental affliction.' },
    effect: '-10 to all Willpower tests.',
    removal: 'Successful Willpower (+0) test.',
});

const meta = {
    title: 'Item Sheets/ConditionSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: {
        item: { name: 'Shaken', img: 'icons/svg/skull.svg', system: baseSystem() },
        system: baseSystem(),
    },
} satisfies Meta<ConditionArgs>;
export default meta;

type Story = StoryObj<ConditionArgs>;

export const Default: Story = {};

export const NotStackable: Story = {
    args: {
        item: {
            name: 'Stunned',
            img: 'icons/svg/lightning.svg',
            system: { ...baseSystem(), stackable: false, isTemporary: false },
        },
        system: { ...baseSystem(), stackable: false, isTemporary: false },
    },
};

export const RendersTabs: Story = {
    play: async ({ canvasElement }) => {
        // The tab strip, not the panels: the Description panel repeats its tab's label as a heading.
        const strip = canvasElement.querySelector<HTMLElement>('nav[data-group="primary"]');
        await expect(strip).toBeTruthy();
        if (strip === null) return;
        const tabs = within(strip);
        await expect(tabs.getByText('Details')).toBeTruthy();
        await expect(tabs.getByText('Description')).toBeTruthy();
        await expect(tabs.getByText('Effects')).toBeTruthy();
        await expect(strip.querySelector('[data-tab="description"]')).toBeTruthy();
    },
};
