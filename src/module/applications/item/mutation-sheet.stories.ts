import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-content-block-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { assertField, renderSheet } from '../../../../stories/test-helpers';
import type { GiftData } from '../../rules/bc-gifts.ts';
import { buildGiftPanelContext, type GiftPanelContext } from './mutation-gift-panel.ts';

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
    /** Present only for a Gift of the Gods (category `gift`), as MutationSheet's prepareContext supplies it. */
    giftPanel?: GiftPanelContext;
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
            { value: 'gift', labelKey: 'WH40K.MutationCategory.Gift', selected: false },
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
        // A non-Gift mutation renders exactly as before: no Gift panel, no Gift fields.
        await expect(canvasElement.querySelector('[data-gift-panel]')).toBeNull();
        await expect(canvasElement.querySelector('[name^="system.gift."]')).toBeNull();
    },
};

// ── Gift of the Gods (#597) ─────────────────────────────────────────────────
//
// A mutation whose category is `gift` gets the Gift panel. The context comes
// from the real `buildGiftPanelContext`, so the form paths the stories assert
// are the ones the sheet renders.

const giftCharacteristics = {
    strength: { label: 'WH40K.Characteristic.Strength', abbreviation: 'S' },
    toughness: { label: 'WH40K.Characteristic.Toughness', abbreviation: 'T' },
    intelligence: { label: 'WH40K.Characteristic.Intelligence', abbreviation: 'Int' },
};

const sampleGift = (): GiftData => ({
    grants: ['Compendium.wh40k-rpg.bc-traits.Item.daemonicHorns'],
    riders: [
        {
            alignment: 'khorne',
            description: '<p>The horns drip with gore: +5 Strength.</p>',
            characteristics: { strength: 5 },
            skills: {},
            grants: ['Compendium.wh40k-rpg.bc-traits.Item.frenzy'],
            activeEffect: 'bloodRage',
        },
    ],
    subTable: 'limb',
    characteristicRolls: [{ characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' }],
});

const storyNames: Record<string, string> = {
    'Compendium.wh40k-rpg.bc-traits.Item.daemonicHorns': 'Daemonic Horns',
    'Compendium.wh40k-rpg.bc-traits.Item.frenzy': 'Frenzy',
};

const giftArgs = (canEdit: boolean, inEditMode: boolean, gift: GiftData = sampleGift()): MutationArgs => {
    const args = baseArgs(canEdit, inEditMode);
    const system = { ...args.system, category: 'gift' };
    return {
        ...args,
        item: { ...args.item, name: 'Daemonic Horns', system },
        system,
        contentScalars: args.contentScalars.map((scalar) =>
            scalar.kind === 'select' ? { ...scalar, value: 'gift', options: scalar.options.map((o) => ({ ...o, selected: o.value === 'gift' })) } : scalar,
        ),
        giftPanel: buildGiftPanelContext({
            gift,
            characteristics: giftCharacteristics,
            effects: [{ id: 'bloodRage', name: 'Blood Rage' }],
            resolveName: (uuid) => storyNames[uuid] ?? uuid,
        }),
    };
};

/** Gift, read-only: grants, rider, sub-table and roll render as text; no inputs, drop zones or remove buttons. */
export const GiftReadOnly: Story = {
    args: giftArgs(false, false),
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector('[data-gift-panel]');
        await expect(panel).not.toBeNull();
        await expect(panel?.textContent).toContain('Daemonic Horns');
        await expect(panel?.textContent).toContain('Khorne Rider');
        await expect(panel?.textContent).toContain('S +5');
        await expect(panel?.textContent).toContain('Frenzy');
        await expect(panel?.textContent).toContain('Blood Rage');
        await expect(panel?.textContent).toContain('Roll on the Limb Table');
        await expect(panel?.textContent).toContain('1d10+5');
        await expect(canvasElement.querySelector('[name^="system.gift."]')).toBeNull();
        await expect(canvasElement.querySelector('[data-drop-zone="reference"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="removeEntry"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-action="addGiftRider"]')).toBeNull();
        // References stay openable outside edit mode.
        await expect(canvasElement.querySelector('[data-action="viewReference"][data-uuid="Compendium.wh40k-rpg.bc-traits.Item.frenzy"]')).not.toBeNull();
    },
};

/** Gift, empty, read-only: every section reports that it is empty. */
export const GiftEmptyReadOnly: Story = {
    args: giftArgs(false, false, { grants: [], riders: [], subTable: '', characteristicRolls: [] }),
    play: async ({ canvasElement }) => {
        const text = canvasElement.querySelector('[data-gift-panel]')?.textContent ?? '';
        await expect(text).toContain('Grants nothing');
        await expect(text).toContain('No alignment riders');
        await expect(text).toContain('No acquisition rolls');
        await expect(text).toContain('No sub-table');
    },
};

/** Gift, edit mode: every field is a control whose name matches the schema path. */
export const GiftEditMode: Story = {
    args: giftArgs(true, true),
    play: async ({ canvasElement }) => {
        assertField(canvasElement, 'system.gift.subTable', 'limb');
        assertField(canvasElement, 'system.gift.riders.0.alignment', 'khorne');
        assertField(canvasElement, 'system.gift.riders.0.characteristics.strength', 5);
        assertField(canvasElement, 'system.gift.riders.0.characteristics.toughness', '');
        assertField(canvasElement, 'system.gift.riders.0.activeEffect', 'bloodRage');
        assertField(canvasElement, 'system.gift.characteristicRolls.0.characteristic', 'intelligence');
        assertField(canvasElement, 'system.gift.characteristicRolls.0.direction', 'loss');
        assertField(canvasElement, 'system.gift.characteristicRolls.0.formula', '1d10+5');
        // Rider description is a ProseMirror editor targeting its schema path.
        await expect(canvasElement.querySelector('[data-editor-target="system.gift.riders.0.description"]')).not.toBeNull();
        // Drop zones for base grants and rider grants accept traits and talents.
        const zones = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-drop-zone="reference"]')).map((zone) => ({ ...zone.dataset }));
        await expect(zones).toEqual([
            { dropZone: 'reference', referencePath: 'system.gift.grants', referenceMode: 'list', referenceAccept: 'trait,talent' },
            { dropZone: 'reference', referencePath: 'system.gift.riders.0.grants', referenceMode: 'list', referenceAccept: 'trait,talent' },
        ]);
        await expect(canvasElement.querySelector('[data-action="addGiftRider"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-action="addGiftCharacteristicRoll"]')).not.toBeNull();
    },
};

/** Gift, edit mode: the remove buttons address the right list and element. */
export const GiftEditRemoveButtons: Story = {
    args: giftArgs(true, true),
    play: async ({ canvasElement }) => {
        const clicked: Array<{ path?: string; index?: string }> = [];
        canvasElement.addEventListener('click', (event) => {
            const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action="removeEntry"]') : null;
            if (button !== null) clicked.push({ path: button.dataset['path'], index: button.dataset['index'] });
        });
        const removeButtons = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-action="removeEntry"]'));
        // Click in document order, one after another.
        await removeButtons.reduce<Promise<void>>(async (previous, button) => {
            await previous;
            await userEvent.click(button);
        }, Promise.resolve());
        await expect(clicked).toEqual([
            { path: 'system.gift.grants', index: '0' },
            { path: 'system.gift.riders', index: '0' },
            { path: 'system.gift.riders.0.grants', index: '0' },
            { path: 'system.gift.characteristicRolls', index: '0' },
        ]);
        await expect(removeButtons.map((button) => button.getAttribute('aria-label'))).toEqual(['Remove', 'Remove', 'Remove', 'Remove']);
    },
};

/** Gift, edit mode, all four alignments taken: no further rider can be added. */
export const GiftEditAllRiders: Story = {
    args: giftArgs(true, true, {
        ...sampleGift(),
        riders: (['khorne', 'slaanesh', 'nurgle', 'tzeentch'] as const).map((alignment) => ({
            alignment,
            description: '',
            characteristics: {},
            skills: {},
            grants: [],
            activeEffect: '',
        })),
    }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-gift-rider]').length).toBe(4);
        await expect(canvasElement.querySelector('[data-action="addGiftRider"]')).toBeNull();
        const alignment = canvasElement.querySelector<HTMLSelectElement>('select[name="system.gift.riders.3.alignment"]');
        await expect(alignment).not.toBeNull();
        if (alignment !== null) await userEvent.selectOptions(alignment, 'nurgle');
        assertField(canvasElement, 'system.gift.riders.3.alignment', 'nurgle');
    },
};

// ── Per-system homologation (dh2 / dh1 / rt / bc / ow / dw / im) ──────────────
//
// The mutation content-block template colours its section headings per game
// line (`bc:tw-text-crimson-light … im:tw-text-failure`); those variants fire
// only under a `data-wh40k-system="<id>"` ancestor. Each story re-stamps the
// rendered wrapper with its system id so visual review exercises all seven.

/** Render the edit-mode mutation sheet, then stamp the active game-system id. */
function renderForSystem(systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, baseArgs(true, true));
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

export const HomologationDH2: Story = {
    render: () => renderForSystem('dh2'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh2"]')).not.toBeNull();
    },
};

export const HomologationDH1: Story = {
    render: () => renderForSystem('dh1'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dh1"]')).not.toBeNull();
    },
};

export const HomologationRT: Story = {
    render: () => renderForSystem('rt'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="rt"]')).not.toBeNull();
    },
};

export const HomologationBC: Story = {
    render: () => renderForSystem('bc'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="bc"]')).not.toBeNull();
    },
};

export const HomologationOW: Story = {
    render: () => renderForSystem('ow'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="ow"]')).not.toBeNull();
    },
};

export const HomologationDW: Story = {
    render: () => renderForSystem('dw'),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-system="dw"]')).not.toBeNull();
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
        await expect(canvasElement.querySelector('[data-wh40k-system="im"]')).not.toBeNull();
    },
};
