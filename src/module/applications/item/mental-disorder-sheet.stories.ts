import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
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

/**
 * Render the sheet and stamp `data-wh40k-system="<id>"` on the wrapper so the
 * template's per-system Tailwind variant chains (`bc:tw-text-crimson-light …
 * im:tw-text-failure` on every section heading) cascade for that game line.
 */
function renderForSystem(args: MentalDisorderArgs, systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, args);
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

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

// ── Per-system homologation ───────────────────────────────────────────────────
//
// One story per game line. Each renders the content-block sheet in edit mode
// (so the ProseMirror editors surface) and stamps a different
// `data-wh40k-system` on the wrapper so the template's per-system Tailwind
// variant chains resolve for that system. Confirms the shared content-block
// sheet renders across all seven lines.

export const HomologationDH2: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).not.toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationDH1: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'dh1'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh1"]')).not.toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationRT: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'rt'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).not.toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationBC: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'bc'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).not.toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationOW: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'ow'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="ow"]')).not.toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationDW: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'dw'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dw"]')).not.toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationIM: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'im'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="im"]')).not.toBeNull();
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};
