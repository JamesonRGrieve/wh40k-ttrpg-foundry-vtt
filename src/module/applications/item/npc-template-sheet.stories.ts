/**
 * Stories for NPCTemplateSheet — multi-part sheet for NPC templates.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect } from 'storybook/test';
import { mockItem, renderTemplate as renderTpl } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheetParts } from '../../../../stories/test-helpers';
import headerSrc from '../../../templates/item/npc-template/header.hbs?raw';
import basicsSrc from '../../../templates/item/npc-template/tab-basics.hbs?raw';
import tabsSrc from '../../../templates/item/npc-template/tabs.hbs?raw';

initializeStoryHandlebars();
const headerTpl = Hbs.compile(headerSrc);
const tabsTpl = Hbs.compile(tabsSrc);
const basicsTpl = Hbs.compile(basicsSrc);
const rng = seedRandom(0x1a2b3c4);

// eslint-disable-next-line no-restricted-syntax -- boundary: story overrides for freeform template testing
function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
    render: () => renderTpl(headerTpl, makeCtx()),
};

export const TabNav: Story = {
    render: () => renderTpl(tabsTpl, makeCtx()),
};

export const BasicsTab: Story = {
    render: () => renderTpl(basicsTpl, makeCtx()),
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
    render: () => renderTpl(headerTpl, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="name"]');
        await expect(field).toBeTruthy();
        await expect(field?.value).toBe('Hive Ganger');
    },
};

export const RendersTabButtons: Story = {
    render: () => renderTpl(tabsTpl, makeCtx()),
    play: async ({ canvasElement }) => {
        const basicBtn = canvasElement.querySelector('[data-tab="basics"]');
        await expect(basicBtn).toBeTruthy();
        basicBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};

// ── Per-system homologation (all 7 game lines) ──────────────────────────────
//
// The header border, tab strip, tag input, and section headings across the
// NPC-template tabs carry per-system Tailwind tints (`bc:tw-border-crimson-light`,
// `dh2:tw-text-gold-raw`, `rt:tw-text-gold`, `im:tw-text-failure`, …). Those
// variants only fire under a `data-wh40k-system="<id>"` ancestor —
// `renderSheetParts({ systemId })` stamps it on the composed tree (matching the
// craft / voidcraft exemplars). One full-sheet story per game line so DH2-only
// theme assumptions surface across all seven.

/** Compose the header + tabs + basics tree under a specific game-line ancestor. */
function renderNpcTemplateForSystem(systemId: SystemId): HTMLElement {
    return renderSheetParts(
        [
            { template: headerSrc, partClass: 'wh40k-part-header' },
            { template: tabsSrc, partClass: 'wh40k-part-tabs' },
            { template: basicsSrc, partClass: 'wh40k-part-basics' },
        ],
        makeCtx(),
        { systemId },
    );
}

/** Build a per-system homologation full-sheet story for one game line. */
function systemStory(systemId: SystemId): Story {
    return {
        render: () => renderNpcTemplateForSystem(systemId),
        play: async ({ canvasElement }) => {
            const nameField = canvasElement.querySelector<HTMLInputElement>('[name="name"]');
            await expect(nameField?.value).toBe('Hive Ganger');
            const root = canvasElement.querySelector<HTMLElement>('[data-wh40k-system]');
            await expect(root?.dataset['wh40kSystem']).toBe(systemId);
        },
    };
}

export const HomologationDH2: Story = systemStory('dh2');
export const HomologationDH1: Story = systemStory('dh1');
export const HomologationRT: Story = systemStory('rt');
export const HomologationBC: Story = systemStory('bc');
export const HomologationOW: Story = systemStory('ow');
export const HomologationDW: Story = systemStory('dw');
export const HomologationIM: Story = systemStory('im');
