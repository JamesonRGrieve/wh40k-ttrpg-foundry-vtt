import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/character-creation/origin-roll-dialog.hbs?raw';

interface RollHistoryEntry {
    result: number;
    breakdown: string;
}

interface Args {
    originImg: string;
    originName: string;
    actorName: string;
    rollType: string;
    rollTypeLabel: string;
    description: string;
    formula: string;
    actorTB?: number;
    expandedFormula?: string;
    hasRolled: boolean;
    showHistory: boolean;
    rollResult?: {
        total: number;
        breakdown: string;
    };
    rollHistory: RollHistoryEntry[];
}

const meta: Meta<Args> = {
    title: 'Character Creation/OriginRollDialog',
    render: (args) => renderSheet(templateSrc, args),
    args: {
        originImg: 'icons/svg/d20.svg',
        originName: 'Hive World',
        actorName: 'Acolyte Voss',
        rollType: 'wounds',
        rollTypeLabel: 'Wounds',
        description: 'Roll to determine your starting Wounds.',
        formula: '2xTB+1d5+2',
        actorTB: 4,
        expandedFormula: '2×4+1d5+2',
        hasRolled: false,
        showHistory: false,
        rollHistory: [],
    },
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const Rolled: Story = {
    args: {
        hasRolled: true,
        showHistory: true,
        rollResult: {
            total: 14,
            breakdown: '8 + 4 + 2',
        },
        rollHistory: [
            { result: 12, breakdown: '8 + 2 + 2' },
            { result: 14, breakdown: '8 + 4 + 2' },
        ],
    },
};

export const ActionFlow: Story = {
    args: Rolled.args,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText('Hive World')).toBeTruthy();
        expect(canvas.getByText('Acolyte Voss')).toBeTruthy();
        expect(canvas.getByText('Accept')).toBeTruthy();
        clickAction(canvasElement, 'reroll');
        clickAction(canvasElement, 'accept');
        clickAction(canvasElement, 'cancel');
    },
};
