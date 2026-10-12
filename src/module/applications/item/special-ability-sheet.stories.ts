import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { assertField, renderSheet } from '../../../../stories/test-helpers';
import type { SpecialAbilityDistinctionFields } from '../../rules/dw-distinction.ts';
import { buildCategoryScalar, buildDistinctionPanelContext, type CategoryScalar, type DistinctionPanelContext } from './special-ability-distinction-panel.ts';

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
    contentScalars: CategoryScalar[];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    dh: { characteristics: Record<string, { label: string; short: string }> };
    /** Present only for a Renown category, as SpecialAbilitySheet's prepareContext supplies it. */
    distinctionPanel?: DistinctionPanelContext;
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
    contentScalars: [buildCategoryScalar('speciality')],
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
        // A speciality ability (every line's default) gets the category select and nothing else.
        assertField(canvasElement, 'system.category', 'speciality');
        await expect(canvasElement.querySelector('[data-distinction-panel]')).toBeNull();
        await expect(canvasElement.querySelector('[name="system.renownRequired"]')).toBeNull();
    },
};

// ── Deathwatch Distinctions (#597) ──────────────────────────────────────────
//
// The Renown categories (advanced / distinction / mark) get the Distinction
// panel. The context comes from the real `buildDistinctionPanelContext`, so the
// form paths asserted here are the ones the sheet renders.

const storyNames: Record<string, string> = {
    'Compendium.wh40k-rpg.dw-distinctions.Item.markOfTheHunter': 'Mark of the Hunter',
    'Compendium.wh40k-rpg.dw-distinctions.Item.markOfTheBlade': 'Mark of the Blade',
    'Compendium.wh40k-rpg.dw-traits.Item.unnaturalPerception': 'Unnatural Perception',
};

const distinctionFields = (overrides: Partial<SpecialAbilityDistinctionFields>): SpecialAbilityDistinctionFields => ({
    category: 'speciality',
    renownRequired: null,
    renownReward: 0,
    cost: 0,
    marks: [],
    grant: { trait: '', activeEffect: '' },
    ...overrides,
});

const distinctionArgs = (canEdit: boolean, inEditMode: boolean, fields: SpecialAbilityDistinctionFields): SpecialAbilityArgs => {
    const panel = buildDistinctionPanelContext({
        fields,
        effects: [{ id: 'keenSenses', name: 'Keen Senses' }],
        resolveName: (uuid) => storyNames[uuid] ?? uuid,
    });
    return {
        ...baseArgs(canEdit, inEditMode),
        contentScalars: [buildCategoryScalar(fields.category)],
        ...(panel === null ? {} : { distinctionPanel: panel }),
    };
};

const distinction = (): SpecialAbilityDistinctionFields =>
    distinctionFields({
        category: 'distinction',
        renownRequired: 'distinguished',
        renownReward: 3,
        cost: 1000,
        marks: ['Compendium.wh40k-rpg.dw-distinctions.Item.markOfTheHunter', 'Compendium.wh40k-rpg.dw-distinctions.Item.markOfTheBlade'],
    });

const mark = (): SpecialAbilityDistinctionFields =>
    distinctionFields({
        category: 'mark',
        renownRequired: 'respected',
        renownReward: 1,
        cost: 300,
        grant: { trait: 'Compendium.wh40k-rpg.dw-traits.Item.unnaturalPerception', activeEffect: 'keenSenses' },
    });

/** Distinction, read-only: Renown gate, reward, XP cost and the combined Marks render as text. */
export const DistinctionReadOnly: Story = {
    args: distinctionArgs(false, false, distinction()),
    play: async ({ canvasElement }) => {
        const text = canvasElement.querySelector('[data-distinction-panel]')?.textContent ?? '';
        await expect(text).toContain('Distinguished');
        await expect(text).toContain('3');
        await expect(text).toContain('1000 XP');
        await expect(text).toContain('Mark of the Hunter');
        await expect(text).toContain('Mark of the Blade');
        await expect(canvasElement.querySelector('[name="system.renownRequired"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-drop-zone="reference"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-reference-list="system.grant.trait"]')).toBeNull();
    },
};

/** Distinction, edit mode: Renown fields are controls and Marks take Mark-only drops. */
export const DistinctionEditMode: Story = {
    args: distinctionArgs(true, true, distinction()),
    play: async ({ canvasElement }) => {
        assertField(canvasElement, 'system.category', 'distinction');
        assertField(canvasElement, 'system.renownRequired', 'distinguished');
        assertField(canvasElement, 'system.renownReward', 3);
        assertField(canvasElement, 'system.cost', 1000);
        const zone = canvasElement.querySelector<HTMLElement>('[data-drop-zone="reference"][data-reference-path="system.marks"]');
        await expect(zone).not.toBeNull();
        await expect(zone?.dataset['referenceAccept']).toBe('specialAbility:mark');
        await expect(zone?.dataset['referenceMode']).toBe('list');

        // The Renown requirement can be cleared to "None" (submits '' → null).
        const required = canvasElement.querySelector<HTMLSelectElement>('select[name="system.renownRequired"]');
        await expect(required).not.toBeNull();
        if (required !== null) await userEvent.selectOptions(required, '');
        assertField(canvasElement, 'system.renownRequired', '');

        // Each Mark's remove button addresses its own index of system.marks.
        const removes = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-reference-list="system.marks"] [data-action="removeEntry"]'));
        await expect(removes.map((b) => [b.dataset['path'], b.dataset['index']])).toEqual([
            ['system.marks', '0'],
            ['system.marks', '1'],
        ]);
    },
};

/** Mark of Distinction, edit mode: single trait reference (clearable, no index) and an Active Effect picker. */
export const MarkEditMode: Story = {
    args: distinctionArgs(true, true, mark()),
    play: async ({ canvasElement }) => {
        assertField(canvasElement, 'system.category', 'mark');
        assertField(canvasElement, 'system.grant.activeEffect', 'keenSenses');
        await expect(canvasElement.querySelector('[data-reference-list="system.marks"]')).toBeNull();
        const zone = canvasElement.querySelector<HTMLElement>('[data-drop-zone="reference"][data-reference-path="system.grant.trait"]');
        await expect(zone?.dataset['referenceMode']).toBe('single');
        await expect(zone?.dataset['referenceAccept']).toBe('trait');
        const clear = canvasElement.querySelector<HTMLElement>('[data-reference-list="system.grant.trait"] [data-action="removeEntry"]');
        await expect(clear?.dataset['path']).toBe('system.grant.trait');
        await expect(clear?.dataset['index']).toBeUndefined();
        await expect(canvasElement.textContent).toContain('Unnatural Perception');
    },
};

/** Mark of Distinction, read-only: granted trait and effect render as text. */
export const MarkReadOnly: Story = {
    args: distinctionArgs(false, false, mark()),
    play: async ({ canvasElement }) => {
        const text = canvasElement.querySelector('[data-distinction-panel]')?.textContent ?? '';
        await expect(text).toContain('Respected');
        await expect(text).toContain('300 XP');
        await expect(text).toContain('Unnatural Perception');
        await expect(text).toContain('Keen Senses');
        await expect(canvasElement.querySelector('[name="system.grant.activeEffect"]')).toBeNull();
    },
};

/** Advanced Special Ability, edit mode: Renown and cost only — no Marks, no grant. */
export const AdvancedEditMode: Story = {
    args: distinctionArgs(true, true, distinctionFields({ category: 'advanced', renownRequired: 'famed', renownReward: 2, cost: 750 })),
    play: async ({ canvasElement }) => {
        assertField(canvasElement, 'system.renownRequired', 'famed');
        await expect(canvasElement.querySelector('[data-reference-list="system.marks"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-reference-list="system.grant.trait"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-drop-zone="reference"]')).toBeNull();
    },
};

// ── Per-system homologation ─────────────────────────────────────────────────
//
// The content-block sheet gates its heading accent colour through per-system
// Tailwind variants (`bc:tw-text-crimson-light dh1:tw-text-gold-raw-l5 …`),
// which only fire when an ancestor carries `data-wh40k-system="<id>"`. Render
// the sheet once per game line, re-stamping the wrapper, so all seven palettes
// are exercised and DH2-only assumptions surface.

/** Render the sheet for `args` and stamp the wrapper with the active game line. */
function renderForSystem(args: SpecialAbilityArgs, systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, args);
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

export const HomologationDH2: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationDH1: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'dh1'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationBC: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'bc'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationOW: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'ow'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationDW: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'dw'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

/** Homologation: render under IM and RT to surface DH2-only assumptions. */
export const HomologationIM: Story = {
    args: { ...baseArgs(true, true), dh: { characteristics: { willpower: { label: 'Willpower', short: 'WP' } } } },
    render: (args) => renderForSystem(args, 'im'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};

export const HomologationRT: Story = {
    args: baseArgs(true, true),
    render: (args) => renderForSystem(args, 'rt'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.wh40k-story-editor')).not.toBeNull();
    },
};
