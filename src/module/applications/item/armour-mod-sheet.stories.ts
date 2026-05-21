/**
 * Stories for ArmourModSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsStory from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
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
    render: () =>
        renderSheetParts(
            [
                { template: headerSrc, partClass: 'wh40k-part-header' },
                { template: restrictionsSrc, partClass: 'wh40k-part-restrictions' },
                { template: modifiersSrc, partClass: 'wh40k-part-modifiers' },
                { template: propertiesSrc, partClass: 'wh40k-part-properties' },
                { template: effectSrc, partClass: 'wh40k-part-effect' },
            ],
            makeCtx(),
        ),
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
