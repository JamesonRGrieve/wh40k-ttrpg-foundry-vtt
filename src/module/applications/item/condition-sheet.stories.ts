import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/item/item-condition-sheet.hbs?raw';

interface ConditionArgs {
    item: {
        name: string;
        img: string;
        system: {
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
        };
    };
    system: ConditionArgs['item']['system'];
}

const baseSystem = (): ConditionArgs['item']['system'] => ({
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
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
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
        const canvas = within(canvasElement);
        expect(canvas.getByText('Details')).toBeTruthy();
        expect(canvas.getByText('Description')).toBeTruthy();
        expect(canvas.getByText('Effects')).toBeTruthy();
        const tabBtn = canvasElement.querySelector('[data-tab="description"]');
        expect(tabBtn).toBeTruthy();
    },
};
