/**
 * Stories for FreeformGatedItemSheet — the base sheet for the content-item
 * family (special ability / malignancy / mutation / mental disorder). Its sole
 * job is to gate edit affordances behind the "Freeform Character Editing"
 * world setting via `canEdit`/`inEditMode`. These stories render the shared
 * `item-content-block-sheet.hbs` and assert the gate at the base level; the
 * four concrete sheets cover the per-type field rendering.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface ContentField {
    name: string;
    labelKey: string;
    value: string;
}
interface GatedSystem {
    notes: string;
    description: { value: string };
    modifiers: Record<string, never>;
}
interface GatedArgs {
    item: { name: string; img: string; system: GatedSystem };
    system: GatedSystem;
    contentFields: ContentField[];
    contentScalars: never[];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    dh: { characteristics: Record<string, { label: string; short: string }> };
}

const baseSystem = (): GatedSystem => ({
    notes: 'Authored in this world.',
    description: { value: '<p>A generic content item used to exercise the freeform gate.</p>' },
    modifiers: {},
});

const baseArgs = (canEdit: boolean, inEditMode: boolean): GatedArgs => ({
    item: { name: 'Gated Content Item', img: 'icons/svg/aura.svg', system: baseSystem() },
    system: baseSystem(),
    contentFields: [{ name: 'system.benefit', labelKey: 'WH40K.SpecialAbility.Benefit', value: '<p>An effect.</p>' }],
    contentScalars: [],
    canEdit,
    inEditMode,
    editable: canEdit,
    dh: { characteristics: { weaponSkill: { label: 'Weapon Skill', short: 'WS' } } },
});

const meta = {
    title: 'Item Sheets/FreeformGatedItemSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: baseArgs(false, false),
} satisfies Meta<GatedArgs>;
export default meta;

type Story = StoryObj<GatedArgs>;

/** Freeform setting OFF (canEdit false): no edit pencil, no editor, no footnote. */
export const ReadOnly: Story = {
    args: baseArgs(false, false),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).toBeNull();
        await expect(canvasElement.textContent).not.toContain('edits here only affect this world item');
    },
};

/** Freeform setting ON + edit mode: pencil, editors, and persistence footnote present. */
export const EditMode: Story = {
    args: baseArgs(true, true),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).not.toBeNull();
        await expect(canvasElement.querySelectorAll('.wh40k-story-editor').length).toBeGreaterThanOrEqual(2);
        await expect(canvasElement.textContent).toContain('edits here only affect this world item');
    },
};
