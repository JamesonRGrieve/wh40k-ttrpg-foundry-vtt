/**
 * Stories for NPCTemplateSheet — multi-part sheet for NPC templates.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect } from 'storybook/test';
import headerSrc from '../../../templates/item/npc-template/header.hbs?raw';
import tabsSrc from '../../../templates/item/npc-template/tabs.hbs?raw';
import basicsSrc from '../../../templates/item/npc-template/tab-basics.hbs?raw';
import charsSrc from '../../../templates/item/npc-template/tab-characteristics.hbs?raw';
import equipmentSrc from '../../../templates/item/npc-template/tab-equipment.hbs?raw';
import abilitiesSrc from '../../../templates/item/npc-template/tab-abilities.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { renderSheetParts } from '../../../../stories/test-helpers';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const headerTpl = Handlebars.compile(headerSrc);
const tabsTpl = Handlebars.compile(tabsSrc);
const basicsTpl = Handlebars.compile(basicsSrc);
const rng = seedRandom(0x1a2b3c4);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('npc-tpl', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Hive Ganger',
        type: 'npcTemplate',
        img: 'icons/portraits/ganger-default.webp',
        system: {
            category: 'humanoid',
            role: 'minion',
            baseThreatLevel: 5,
            description: '',
            tags: ['criminal', 'hive'],
            characteristics: {
                weaponSkill: { total: 30 },
                ballisticSkill: { total: 25 },
                strength: { total: 30 },
                toughness: { total: 30 },
                agility: { total: 30 },
                intelligence: { total: 25 },
                perception: { total: 25 },
                willpower: { total: 25 },
                fellowship: { total: 20 },
            },
            wounds: { formula: '1d10+2', min: 3, max: 12 },
            movement: 3,
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        categories: [
            { key: 'humanoid', label: 'Humanoid', selected: true },
            { key: 'daemon', label: 'Daemon', selected: false },
            { key: 'beast', label: 'Beast', selected: false },
        ],
        roles: [
            { key: 'minion', name: 'Minion', selected: true },
            { key: 'elite', name: 'Elite', selected: false },
            { key: 'master', name: 'Master', selected: false },
        ],
        tabs: [
            { tab: 'basics', icon: 'fa-scroll', label: 'WH40K.NPC.Template.Tabs.Basics', active: true },
            { tab: 'characteristics', icon: 'fa-dna', label: 'WH40K.NPC.Template.Tabs.Characteristics', active: false },
            { tab: 'equipment', icon: 'fa-shield', label: 'WH40K.NPC.Template.Tabs.Equipment', active: false },
            { tab: 'abilities', icon: 'fa-star', label: 'WH40K.NPC.Template.Tabs.Abilities', active: false },
            { tab: 'preview', icon: 'fa-eye', label: 'WH40K.NPC.Template.Tabs.Preview', active: false },
        ],
        canEdit: true,
        inEditMode: false,
        editable: true,
        fields: { description: {} },
        enrichedDescription: '',
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/NPCTemplateSheet' };
export default meta;

type Story = StoryObj;

export const Header: Story = {
    render: () => renderTemplate(headerTpl, makeCtx()),
};

export const TabNav: Story = {
    render: () => renderTemplate(tabsTpl, makeCtx()),
};

export const BasicsTab: Story = {
    render: () => renderTemplate(basicsTpl, makeCtx()),
};

export const FullSheet: Story = {
    render: () =>
        renderSheetParts(
            [
                { template: headerSrc, partClass: 'wh40k-part-header' },
                { template: tabsSrc, partClass: 'wh40k-part-tabs' },
                { template: basicsSrc, partClass: 'wh40k-part-basics' },
            ],
            makeCtx(),
        ),
};

export const RendersNPCName: Story = {
    render: () => renderTemplate(headerTpl, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="name"]');
        expect(field).toBeTruthy();
        expect(field?.value).toBe('Hive Ganger');
    },
};

export const RendersTabButtons: Story = {
    render: () => renderTemplate(tabsTpl, makeCtx()),
    play: async ({ canvasElement }) => {
        const basicBtn = canvasElement.querySelector('[data-tab="basics"]');
        expect(basicBtn).toBeTruthy();
        basicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};
