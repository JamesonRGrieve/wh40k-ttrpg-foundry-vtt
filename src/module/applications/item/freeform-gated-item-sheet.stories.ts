/**
 * Stories for FreeformGatedItemSheet — the base sheet for the content-item
 * family (special ability / malignancy / mutation / mental disorder). Its sole
 * job is to gate edit affordances behind the "Freeform Character Editing"
 * world setting via `canEdit`/`inEditMode`. These stories render the shared
 * `item-content-block-sheet.hbs` and assert the gate at the base level; the
 * four concrete sheets cover the per-type field rendering.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();

const contentBlockTpl = Hbs.compile(templateSrc);

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

// ── Per-system homologation: all 7 game lines ────────────────────────────────
//
// The content-block sheet's name heading and section headings carry per-system
// Tailwind variant classes (`bc:tw-text-crimson-light dh1:… dh2:… dw:… ow:…
// rt:… im:…`) gated on a `data-wh40k-system` ancestor. The default `renderSheet`
// wrapper hardcodes `dh2`; these stories stamp the other six lines so DH2-only
// theming assumptions surface (CLAUDE.md homologation rule + "Adaptation
// procedure 3a"). Rendered in the read-only gate state so the heading surface
// is the focus.

/**
 * Render the content-block sheet under a `.wh40k-rpg` + `data-wh40k-system`
 * ancestor for the given game line.
 */
function renderGatedForSystem(args: GatedArgs, systemId: SystemId): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'wh40k-rpg theme-dark sheet';
    wrapper.setAttribute('data-wh40k-system', systemId);
    wrapper.innerHTML = contentBlockTpl(args);
    return wrapper;
}

/** Build a per-system story (explicit named exports keep Storybook's static scan happy). */
function perSystemStory(systemId: SystemId): Story {
    return {
        name: `Per-system — ${systemId.toUpperCase()}`,
        args: baseArgs(false, false),
        render: (args) => renderGatedForSystem(args, systemId),
        play: async ({ canvasElement }) => {
            await expect(canvasElement.textContent).toContain('Gated Content Item');
            const root = canvasElement.querySelector(`[data-wh40k-system="${systemId}"]`);
            await expect(root).not.toBeNull();
        },
    };
}

export const PerSystemDh2: Story = perSystemStory('dh2');
export const PerSystemDh1: Story = perSystemStory('dh1');
export const PerSystemRt: Story = perSystemStory('rt');
export const PerSystemBc: Story = perSystemStory('bc');
export const PerSystemOw: Story = perSystemStory('ow');
export const PerSystemDw: Story = perSystemStory('dw');
export const PerSystemIm: Story = perSystemStory('im');
