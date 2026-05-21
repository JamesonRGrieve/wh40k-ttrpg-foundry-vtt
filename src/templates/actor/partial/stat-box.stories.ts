import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from './stat-box.hbs?raw';

initializeStoryHandlebars();

interface Args {
    label: string;
    valueName: string;
    value: number;
    maxName?: string;
    max?: number;
    boxClass?: string;
    labelClass?: string;
    valuesClass?: string;
    inputClass?: string;
    sepClass?: string;
    singleClass?: string;
    boxBaseClass?: string;
    labelBaseClass?: string;
    inputBaseClass?: string;
    valuesBaseClass?: string;
    sepBaseClass?: string;
    min?: number;
    minMax?: number;
    maxAttr?: number;
    [key: string]: string | number | undefined;
}

const meta = {
    title: 'Actor/Partials/StatBox',
    render: (args) => renderSheet(templateSrc, args),
    args: {
        label: 'Hull Integrity',
        valueName: 'system.hullIntegrity.value',
        value: 35,
        maxName: 'system.hullIntegrity.max',
        max: 50,
        min: 0,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const ValueOverMax: Story = {};

export const SingleValue: Story = {
    args: {
        label: 'Size',
        valueName: 'system.size',
        value: 4,
        maxName: undefined,
        max: undefined,
        min: 1,
        maxAttr: 10,
    },
};

export const VehicleStructure: Story = {
    args: {
        label: 'Structure',
        valueName: 'system.structure.value',
        value: 12,
        maxName: 'system.structure.max',
        max: 15,
        min: 0,
        minMax: 1,
        boxBaseClass: 'wh40k-vehicle-stat-box',
        labelBaseClass: 'wh40k-vehicle-stat-label',
        inputBaseClass: 'wh40k-vehicle-stat-input',
    },
};

export const StarshipMorale: Story = {
    args: {
        label: 'Morale',
        valueName: 'system.morale.value',
        value: 78,
        maxName: 'system.morale.max',
        max: 100,
        min: 0,
        singleClass: 'wh40k-stat-single',
    },
};

export const StarshipCrewRating: Story = {
    args: {
        label: 'Crew Rating',
        valueName: 'system.crewRating',
        value: 30,
        maxName: undefined,
        max: undefined,
        min: 0,
        maxAttr: 100,
        singleClass: 'wh40k-stat-single',
    },
};

/**
 * Asserts that both inputs render with the expected `name` attributes when
 * `maxName` is supplied — these names drive Foundry's form parser when the
 * stat is edited in place. A regression here means the max can't be saved.
 */
export const ValueMaxNamesBind: Story = {
    args: {
        label: 'Hull Integrity',
        valueName: 'system.hullIntegrity.value',
        value: 35,
        maxName: 'system.hullIntegrity.max',
        max: 50,
    },
    play: async ({ canvasElement }) => {
        const valueInput = canvasElement.querySelector('input[name="system.hullIntegrity.value"]');
        const maxInput = canvasElement.querySelector('input[name="system.hullIntegrity.max"]');
        await expect(valueInput).toBeTruthy();
        await expect(maxInput).toBeTruthy();
        await expect((valueInput as HTMLInputElement).value).toBe('35');
        await expect((maxInput as HTMLInputElement).value).toBe('50');
        void canvas;
    },
};
