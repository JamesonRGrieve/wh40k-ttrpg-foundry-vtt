import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

/** A type-specific HTML editor field as supplied by the sheet's prepareContext. */
interface ContentField {
    name: string;
    labelKey: string;
    value: string;
}
interface SpecialAbilitySystem {
    benefit: string;
    notes: string;
    description: { value: string };
    modifiers: Record<string, never>;
}
interface SpecialAbilityItem {
    name: string;
    img: string;
    system: SpecialAbilitySystem;
}
interface SpecialAbilityArgs {
    item: SpecialAbilityItem;
    system: SpecialAbilitySystem;
    contentFields: ContentField[];
    contentScalars: never[];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    dh: { characteristics: Record<string, { label: string; short: string }> };
}

const baseSystem = (): SpecialAbilitySystem => ({
    benefit: '<p>Re-roll one failed Toughness test per encounter.</p>',
    notes: 'Granted by the Adeptus Astartes gene-seed.',
    description: { value: '<p>A superhuman resilience born of the implants.</p>' },
    modifiers: {},
});

const contentFields = (): ContentField[] => [{ name: 'system.benefit', labelKey: 'WH40K.SpecialAbility.Benefit', value: baseSystem().benefit }];

const baseArgs = (canEdit: boolean, inEditMode: boolean): SpecialAbilityArgs => ({
    item: { name: 'Unyielding Flesh', img: 'icons/svg/upgrade.svg', system: baseSystem() },
    system: baseSystem(),
    contentFields: contentFields(),
    contentScalars: [],
    canEdit,
    inEditMode,
    editable: canEdit,
    dh: { characteristics: { weaponSkill: { label: 'Weapon Skill', short: 'WS' } } },
});

const meta = {
    title: 'Item Sheets/SpecialAbilitySheet',
    render: (args) => renderSheet(templateSrc, args),
    args: baseArgs(false, false),
} satisfies Meta<SpecialAbilityArgs>;
export default meta;

type Story = StoryObj<SpecialAbilityArgs>;

/** Freeform setting OFF: read-only, no edit pencil, no ProseMirror editor. */
export const ReadOnly: Story = {
    args: baseArgs(false, false),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).toBeNull();
        // Footnote only appears in edit mode.
        await expect(canvasElement.textContent).not.toContain('edits here only affect this world item');
    },
};

/** Freeform setting ON + edit mode: pencil, editors, and persistence footnote present. */
export const EditMode: Story = {
    args: baseArgs(true, true),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="toggleEditMode"]')).not.toBeNull();
        // Description editor + benefit editor both render.
        await expect(canvasElement.querySelectorAll('.wh40k-story-editor').length).toBeGreaterThanOrEqual(2);
        await expect(canvasElement.textContent).toContain('edits here only affect this world item');
    },
};

/** Homologation: render under IM and RT to surface DH2-only assumptions. */
export const HomologationIM: Story = {
    args: { ...baseArgs(true, true), dh: { characteristics: { willpower: { label: 'Willpower', short: 'WP' } } } },
    render: (args) => {
        const el = renderSheet(templateSrc, args);
        el.dataset['wh40kSystem'] = 'im';
        return el;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationRT: Story = {
    args: baseArgs(true, true),
    render: (args) => {
        const el = renderSheet(templateSrc, args);
        el.dataset['wh40kSystem'] = 'rt';
        return el;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};
