/**
 * Stories for ArmourModSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import headerSrc from '../../../templates/item/armour-mod-header.hbs?raw';
import restrictionsSrc from '../../../templates/item/armour-mod-restrictions.hbs?raw';
import modifiersSrc from '../../../templates/item/armour-mod-modifiers.hbs?raw';
import propertiesSrc from '../../../templates/item/armour-mod-properties.hbs?raw';
import effectSrc from '../../../templates/item/armour-mod-effect.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { renderSheetParts } from '../../../../stories/test-helpers';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();

const headerTpl = Handlebars.compile(headerSrc);
const restrictionsTpl = Handlebars.compile(restrictionsSrc);
const modifiersTpl = Handlebars.compile(modifiersSrc);
const propertiesTpl = Handlebars.compile(propertiesSrc);
const effectTpl = Handlebars.compile(effectSrc);

const rng = seedRandom(0xaf1200d);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('armour-mod', rng);
    const item = mockItem({ _id: id, id, name: 'Ceramite Plating', type: 'armourMod' });
    return {
        item,
        system: {
            icon: 'fa-shield',
            modifiers: { ap: 2, weight: 1 },
            restrictions: { armourTypes: [] },
            addedProperties: [],
            removedProperties: [],
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
        ...overrides,
    };
}

const meta: Meta = {
    title: 'Item Sheets/ArmourModSheet',
};
export default meta;

type Story = StoryObj;

export const Header: Story = {
    render: () => renderTemplate(headerTpl, makeCtx()),
};

export const Restrictions: Story = {
    render: () => renderTemplate(restrictionsTpl, makeCtx()),
};

export const Modifiers: Story = {
    render: () => renderTemplate(modifiersTpl, makeCtx()),
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
    render: () => renderTemplate(headerTpl, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Ceramite Plating')).toBeTruthy();
    },
};

export const RendersEditImageAction: Story = {
    render: () => renderTemplate(headerTpl, makeCtx()),
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="editImage"]');
        expect(btn).toBeTruthy();
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};
