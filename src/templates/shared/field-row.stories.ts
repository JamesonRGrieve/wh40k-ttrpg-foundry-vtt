import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import { renderSheet } from '../../../stories/test-helpers';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import templateSrc from './field-row.hbs?raw';

initializeStoryHandlebars();

// `eq` is registered globally by the runtime helper bundle but is not part
// of the shared story helper set; register a minimal version locally.
if (!Handlebars.helpers.eq) {
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
}

interface Args {
    name: string;
    label: string;
    value?: unknown;
    type?: 'text' | 'number' | 'select' | 'textarea';
    options?: Record<string, string>;
    placeholder?: string;
    min?: number;
    max?: number;
    rows?: number;
    dataDtype?: string;
    readonly?: boolean;
    labelClass?: string;
    inputClass?: string;
    rowClass?: string;
}

const meta = {
    title: 'Shared/FieldRow',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        name: 'system.bio.gender',
        label: 'Gender',
        value: '',
        placeholder: 'Enter gender',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Text: Story = {};

export const TextWithValue: Story = {
    args: { name: 'system.bio.name', label: 'Name', value: 'Marcus Steel' },
};

export const Number_: Story = {
    name: 'Number',
    args: {
        name: 'system.bio.age',
        label: 'Age',
        type: 'number',
        value: 32,
        min: 0,
        max: 200,
        dataDtype: 'Number',
    },
};

export const Select: Story = {
    args: {
        name: 'system.bio.homeworld',
        label: 'Homeworld',
        type: 'select',
        value: 'imperial',
        options: {
            hive: 'Hive World',
            imperial: 'Imperial World',
            feral: 'Feral World',
            forge: 'Forge World',
            voidborn: 'Voidborn',
        },
    },
};

export const Textarea: Story = {
    args: {
        name: 'system.bio.background',
        label: 'Background',
        type: 'textarea',
        value: 'Born in the underhives of Necromunda, recruited into the Imperial Guard at sixteen.',
        rows: 4,
    },
};

export const Readonly: Story = {
    args: {
        name: 'system.bio.rank',
        label: 'Rank',
        value: 'Sergeant',
        readonly: true,
    },
};

/**
 * Asserts that the input renders with the expected `name`, `value`, and dtype
 * attribute. Foundry's form parser keys off `name=` for schema binding and
 * `data-dtype=` for type coercion, so regressions in those attributes are
 * data-loss bugs.
 */
export const NumberDispatch: Story = {
    args: {
        name: 'system.combat.movement',
        label: 'Movement',
        type: 'number',
        value: 4,
        dataDtype: 'Number',
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const input = canvasElement.querySelector('input[name="system.combat.movement"]');
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).type).toBe('number');
        expect((input as HTMLInputElement).getAttribute('data-dtype')).toBe('Number');
        expect((input as HTMLInputElement).value).toBe('4');
        void canvas;
    },
};
