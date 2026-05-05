import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from './vital-inline-row.hbs?raw';

initializeStoryHandlebars();

interface Args {
    icon: string;
    label: string;
    field: string;
    current: number;
    max?: number;
    min?: number;
    stateClass?: string;
    rowClass?: string;
    labelGroupClass?: string;
    iconClass?: string;
    labelClass?: string;
    valueClass?: string;
    degreeText?: string;
    penaltyText?: string;
    tooltip?: string;
}

const meta = {
    title: 'Actor/Partials/VitalInlineRow',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        icon: 'fa-heart',
        label: 'Wounds',
        field: 'system.wounds.value',
        current: 12,
        max: 12,
        min: 0,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Wounds: Story = {};

export const WoundsCritical: Story = {
    args: {
        current: 2,
        max: 12,
        stateClass: 'wh40k-critical',
        tooltip: 'Critical wound threshold reached',
    },
};

export const WoundsWarning: Story = {
    args: {
        current: 5,
        max: 12,
        stateClass: 'wh40k-warning',
    },
};

export const SimpleValueOnly: Story = {
    args: {
        icon: 'fa-coins',
        label: 'Thrones',
        field: 'system.resources.thrones',
        current: 47,
        max: undefined,
    },
};

export const MentalCorruption: Story = {
    args: {
        icon: 'fa-skull',
        label: 'Corruption',
        field: 'system.corruption.value',
        current: 32,
        max: 100,
        rowClass: 'wh40k-mental-row',
        labelGroupClass: 'wh40k-mental-label-group',
        iconClass: 'wh40k-mental-icon',
        labelClass: 'wh40k-mental-label',
        valueClass: 'wh40k-mental-value',
        stateClass: 'wh40k-corruption-soiled',
        degreeText: 'Soiled',
    },
};

export const FatigueWithPenalty: Story = {
    args: {
        icon: 'fa-bolt',
        label: 'Fatigue',
        field: 'system.fatigue.value',
        current: 4,
        max: 12,
        penaltyText: '−10',
    },
};

export const ClickDispatch: Story = {
    args: { current: 8, max: 12 },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // The +/- buttons resolve through the same data-action handles the
        // ApplicationV2 sheet's static-actions table reads.
        clickAction(canvasElement, 'increment');
        clickAction(canvasElement, 'decrement');
        // Field path threaded onto both buttons.
        const inc = canvasElement.querySelector('[data-action="increment"]') as HTMLButtonElement | null;
        expect(inc?.dataset.field).toBe('system.wounds.value');
        void canvas;
    },
};
