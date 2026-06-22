/**
 * Stories for ArmourModSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsStory from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheetParts } from '../../../../stories/test-helpers';
import effectSrc from '../../../templates/item/armour-mod-effect.hbs?raw';
import headerSrc from '../../../templates/item/armour-mod-header.hbs?raw';
import modifiersSrc from '../../../templates/item/armour-mod-modifiers.hbs?raw';
import propertiesSrc from '../../../templates/item/armour-mod-properties.hbs?raw';
import restrictionsSrc from '../../../templates/item/armour-mod-restrictions.hbs?raw';

initializeStoryHandlebars();

const headerTpl = HbsStory.compile(headerSrc);
const restrictionsTpl = HbsStory.compile(restrictionsSrc);
const modifiersTpl = HbsStory.compile(modifiersSrc);

const rng = seedRandom(0xaf1200d);

interface TabEntry {
    id: string;
    tab: string;
    group: string;
    active: boolean;
    cssClass: string;
}

interface ArmourModCtx {
    item: ReturnType<typeof mockItem>;
    system: {
        icon: string;
        modifiers: { ap: number; weight: number };
        restrictions: { armourTypes: never[] };
        addedProperties: never[];
        removedProperties: never[];
        restrictionsLabelEnhanced: string;
        modifierSummary: string;
        effect: string;
        notes: string;
    };
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    tabs: Record<string, TabEntry>;
}

function makeBaseCtx(): ArmourModCtx {
    const id = randomId('armour-mod', rng);
    const item = mockItem({ _id: id, id, name: 'Ceramite Plating', type: 'armourMod' });
    return {
        item,
        system: {
            icon: 'fa-shield',
            modifiers: { ap: 2, weight: 1 },
            restrictions: { armourTypes: [] as never[] },
            addedProperties: [] as never[],
            removedProperties: [] as never[],
            restrictionsLabelEnhanced: 'Light, Flak only',
            modifierSummary: '+2 AP, +1 Weight',
            effect: '<p>Grants extra protection versus flame.</p>',
            notes: 'Must be fitted by a skilled armsmith.',
        },
        canEdit: true,
        inEditMode: false,
        editable: true,
        tabs: {
            restrictions: { id: 'restrictions', tab: 'restrictions', group: 'primary', active: true, cssClass: 'active' },
            modifiers: { id: 'modifiers', tab: 'modifiers', group: 'primary', active: false, cssClass: '' },
            properties: { id: 'properties', tab: 'properties', group: 'primary', active: false, cssClass: '' },
            effect: { id: 'effect', tab: 'effect', group: 'primary', active: false, cssClass: '' },
        },
    };
}

function makeCtx(overrides: Partial<ArmourModCtx> = {}): ArmourModCtx {
    return { ...makeBaseCtx(), ...overrides };
}

const FULL_SHEET_PARTS = [
    { template: headerSrc, partClass: 'wh40k-part-header' },
    { template: restrictionsSrc, partClass: 'wh40k-part-restrictions' },
    { template: modifiersSrc, partClass: 'wh40k-part-modifiers' },
    { template: propertiesSrc, partClass: 'wh40k-part-properties' },
    { template: effectSrc, partClass: 'wh40k-part-effect' },
];

/**
 * Compose the full armour-mod sheet under a `data-wh40k-system="<id>"` ancestor.
 * The restrictions / modifiers / properties / effect partials gate their accent
 * colour with `<id>:tw-*` variant chains that only fire when that attribute is
 * present, so passing `systemId` exercises every game line's palette.
 */
function renderFullSheetForSystem(systemId?: SystemId): HTMLElement {
    return renderSheetParts(FULL_SHEET_PARTS, makeCtx(), systemId === undefined ? {} : { systemId });
}

const meta: Meta = {
    title: 'Item Sheets/ArmourModSheet',
};
export default meta;

type Story = StoryObj;

export const Header: Story = {
    render: () => renderStoryTemplate(headerTpl, makeCtx()),
};

export const Restrictions: Story = {
    render: () => renderStoryTemplate(restrictionsTpl, makeCtx()),
};

export const Modifiers: Story = {
    render: () => renderStoryTemplate(modifiersTpl, makeCtx()),
};

export const FullSheet: Story = {
    render: () => renderFullSheetForSystem(),
};

export const RendersItemName: Story = {
    render: () => renderStoryTemplate(headerTpl, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Ceramite Plating')).toBeTruthy();
    },
};

export const RendersEditImageAction: Story = {
    render: () => renderStoryTemplate(headerTpl, makeCtx()),
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="editImage"]');
        await expect(btn).toBeTruthy();
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// The restrictions / modifiers / properties / effect partials gate their accent
// colour with `<id>:tw-*` variant chains (`bc:tw-text-crimson-light
// dh1:tw-text-gold-raw-l5 …`) that only fire when an ancestor carries
// `data-wh40k-system="<id>"`. Rendering the composed full sheet under each of the
// seven game lines exercises every variant — catching a "works in DH2 but not the
// other six" regression. One FullSheet export per system keeps the composed-tree
// (CSS-composition) coverage symmetric across systems.

const ALL_SYSTEMS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

export const FullSheetDh2: Story = { name: 'Per-system — DH2e', render: () => renderFullSheetForSystem('dh2') };
export const FullSheetDh1: Story = { name: 'Per-system — DH1', render: () => renderFullSheetForSystem('dh1') };
export const FullSheetRt: Story = { name: 'Per-system — Rogue Trader', render: () => renderFullSheetForSystem('rt') };
export const FullSheetBc: Story = { name: 'Per-system — Black Crusade', render: () => renderFullSheetForSystem('bc') };
export const FullSheetOw: Story = { name: 'Per-system — Only War', render: () => renderFullSheetForSystem('ow') };
export const FullSheetDw: Story = { name: 'Per-system — Deathwatch', render: () => renderFullSheetForSystem('dw') };
export const FullSheetIm: Story = { name: 'Per-system — Imperium Maledictum', render: () => renderFullSheetForSystem('im') };

export const PerSystemAllRenderName: Story = {
    name: 'Per-system — every line renders the mod name',
    render: () => renderFullSheetForSystem('dh2'),
    play: () => {
        for (const systemId of ALL_SYSTEMS) {
            const root = renderFullSheetForSystem(systemId);
            void expect(root.dataset['wh40kSystem']).toBe(systemId);
            const view = within(root);
            void expect(view.getByDisplayValue('Ceramite Plating')).toBeTruthy();
        }
    },
};
