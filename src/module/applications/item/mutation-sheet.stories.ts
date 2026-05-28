import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface ContentField {
    name: string;
    labelKey: string;
    value: string;
}
type ContentScalar =
    | { kind: 'select'; name: string; labelKey: string; value: string; options: Array<{ value: string; labelKey: string; selected: boolean }> }
    | { kind: 'checkbox'; name: string; labelKey: string; checked: boolean };
interface MutationSystem {
    category: string;
    effect: string;
    drawback: string;
    visible: boolean;
    notes: string;
    description: { value: string };
    modifiers: Record<string, never>;
}
interface MutationItem {
    name: string;
    img: string;
    system: MutationSystem;
}
interface MutationArgs {
    item: MutationItem;
    system: MutationSystem;
    contentFields: ContentField[];
    contentScalars: ContentScalar[];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    dh: { characteristics: Record<string, { label: string; short: string }> };
}

const baseSystem = (): MutationSystem => ({
    category: 'major',
    effect: '<p>An extra, vestigial arm grants +10 to grapple.</p>',
    drawback: '<p>Visible to all; -10 to Fellowship in polite society.</p>',
    visible: true,
    notes: 'Rolled on the major mutation table.',
    description: { value: '<p>The flesh remembers the warp.</p>' },
    modifiers: {},
});

const scalars = (): ContentScalar[] => [
    {
        kind: 'select',
        name: 'system.category',
        labelKey: 'WH40K.Mutation.Category',
        value: 'major',
        options: [
            { value: 'minor', labelKey: 'WH40K.MutationCategory.Minor', selected: false },
            { value: 'major', labelKey: 'WH40K.MutationCategory.Major', selected: true },
            { value: 'malignancy', labelKey: 'WH40K.MutationCategory.Malignancy', selected: false },
        ],
    },
    { kind: 'checkbox', name: 'system.visible', labelKey: 'WH40K.Mutation.Visible', checked: true },
];

const baseArgs = (canEdit: boolean, inEditMode: boolean): MutationArgs => ({
    item: { name: 'Extra Limb', img: 'icons/svg/mystery-man.svg', system: baseSystem() },
    system: baseSystem(),
    contentFields: [
        { name: 'system.effect', labelKey: 'WH40K.Mutation.Effect', value: baseSystem().effect },
        { name: 'system.drawback', labelKey: 'WH40K.Mutation.Drawback', value: baseSystem().drawback },
    ],
    contentScalars: scalars(),
    canEdit,
    inEditMode,
    editable: canEdit,
    dh: { characteristics: { strength: { label: 'Strength', short: 'S' } } },
});

const meta = {
    title: 'Item Sheets/MutationSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: baseArgs(false, false),
} satisfies Meta<MutationArgs>;
export default meta;

type Story = StoryObj<MutationArgs>;

export const ReadOnly: Story = {
    args: baseArgs(false, false),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).toBeNull();
        // Select renders as plain text in read-only mode (no <select>).
        await expect(canvasElement.querySelector('select[name="system.category"]')).toBeNull();
        await expect(canvasElement.textContent).not.toContain('edits here only affect this world item');
    },
};

export const EditMode: Story = {
    args: baseArgs(true, true),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).not.toBeNull();
        // effect + drawback + description = 3 editors.
        await expect(canvasElement.querySelectorAll('.wh40k-story-editor').length).toBeGreaterThanOrEqual(3);
        await expect(canvasElement.querySelector('select[name="system.category"]')).not.toBeNull();
        await expect(canvasElement.querySelector('input[name="system.visible"]')).not.toBeNull();
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
