import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface ContentField {
    name: string;
    labelKey: string;
    value: string;
}
interface MalignancySystem {
    effect: string;
    notes: string;
    description: { value: string };
    modifiers: Record<string, never>;
}
interface MalignancyItem {
    name: string;
    img: string;
    system: MalignancySystem;
}
interface MalignancyArgs {
    item: MalignancyItem;
    system: MalignancySystem;
    contentFields: ContentField[];
    contentScalars: never[];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    dh: { characteristics: Record<string, { label: string; short: string }> };
}

const baseSystem = (): MalignancySystem => ({
    effect: '<p>The afflicted suffers nightmares and -5 Willpower.</p>',
    notes: 'Accrued through prolonged corruption.',
    description: { value: '<p>A creeping taint of the warp.</p>' },
    modifiers: {},
});

const baseArgs = (canEdit: boolean, inEditMode: boolean): MalignancyArgs => ({
    item: { name: 'Witch Mark', img: 'icons/svg/skull.svg', system: baseSystem() },
    system: baseSystem(),
    contentFields: [{ name: 'system.effect', labelKey: 'WH40K.Malignancy.Effect', value: baseSystem().effect }],
    contentScalars: [],
    canEdit,
    inEditMode,
    editable: canEdit,
    dh: { characteristics: { willpower: { label: 'Willpower', short: 'WP' } } },
});

const meta = {
    title: 'Item Sheets/MalignancySheet',
    render: (args) => renderSheet(templateSrc, args),
    args: baseArgs(false, false),
} satisfies Meta<MalignancyArgs>;
export default meta;

type Story = StoryObj<MalignancyArgs>;

export const ReadOnly: Story = {
    args: baseArgs(false, false),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).toBeNull();
        await expect(canvasElement.textContent).not.toContain('edits here only affect this world item');
    },
};

export const EditMode: Story = {
    args: baseArgs(true, true),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).not.toBeNull();
        await expect(canvasElement.querySelectorAll('.wh40k-story-editor').length).toBeGreaterThanOrEqual(2);
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
