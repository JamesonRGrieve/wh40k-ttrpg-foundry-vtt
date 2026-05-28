import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface ContentField {
    name: string;
    labelKey: string;
    value: string;
}
type ContentScalar = { kind: 'select'; name: string; labelKey: string; value: string; options: Array<{ value: string; labelKey: string; selected: boolean }> };
interface MentalDisorderSystem {
    severity: string;
    trigger: string;
    effect: string;
    treatment: string;
    notes: string;
    description: { value: string };
    modifiers: Record<string, never>;
}
interface MentalDisorderItem {
    name: string;
    img: string;
    system: MentalDisorderSystem;
}
interface MentalDisorderArgs {
    item: MentalDisorderItem;
    system: MentalDisorderSystem;
    contentFields: ContentField[];
    contentScalars: ContentScalar[];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    dh: { characteristics: Record<string, { label: string; short: string }> };
}

const baseSystem = (): MentalDisorderSystem => ({
    severity: 'severe',
    trigger: '<p>When confronted by xenos.</p>',
    effect: '<p>The character must pass a Willpower test or flee.</p>',
    treatment: '<p>Extended bed rest and counselling.</p>',
    notes: 'Acquired after the Tyranid encounter.',
    description: { value: '<p>A deep-seated dread of the alien.</p>' },
    modifiers: {},
});

const scalars = (): ContentScalar[] => [
    {
        kind: 'select',
        name: 'system.severity',
        labelKey: 'WH40K.MentalDisorder.Severity',
        value: 'severe',
        options: [
            { value: 'minor', labelKey: 'WH40K.MentalDisorder.Minor', selected: false },
            { value: 'severe', labelKey: 'WH40K.MentalDisorder.Severe', selected: true },
            { value: 'acute', labelKey: 'WH40K.MentalDisorder.Acute', selected: false },
        ],
    },
];

const baseArgs = (canEdit: boolean, inEditMode: boolean): MentalDisorderArgs => ({
    item: { name: 'Xenophobia', img: 'icons/svg/terror.svg', system: baseSystem() },
    system: baseSystem(),
    contentFields: [
        { name: 'system.trigger', labelKey: 'WH40K.MentalDisorder.Trigger', value: baseSystem().trigger },
        { name: 'system.effect', labelKey: 'WH40K.MentalDisorder.Effect', value: baseSystem().effect },
        { name: 'system.treatment', labelKey: 'WH40K.MentalDisorder.Treatment', value: baseSystem().treatment },
    ],
    contentScalars: scalars(),
    canEdit,
    inEditMode,
    editable: canEdit,
    dh: { characteristics: { willpower: { label: 'Willpower', short: 'WP' } } },
});

const meta = {
    title: 'Item Sheets/MentalDisorderSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: baseArgs(false, false),
} satisfies Meta<MentalDisorderArgs>;
export default meta;

type Story = StoryObj<MentalDisorderArgs>;

export const ReadOnly: Story = {
    args: baseArgs(false, false),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).toBeNull();
        await expect(canvasElement.querySelector('select[name="system.severity"]')).toBeNull();
        await expect(canvasElement.textContent).not.toContain('edits here only affect this world item');
    },
};

export const EditMode: Story = {
    args: baseArgs(true, true),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).not.toBeNull();
        // trigger + effect + treatment + description = 4 editors.
        await expect(canvasElement.querySelectorAll('.wh40k-story-editor').length).toBeGreaterThanOrEqual(4);
        await expect(canvasElement.querySelector('select[name="system.severity"]')).not.toBeNull();
        await expect(canvasElement.textContent).toContain('edits here only affect this world item');
    },
};

export const HomologationIM: Story = {
    args: baseArgs(true, true),
    render: (args) => {
        const el = renderSheet(templateSrc, args);
        el.dataset['wh40kSystem'] = 'im';
        return el;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};
