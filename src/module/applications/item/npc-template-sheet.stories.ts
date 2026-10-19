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
import characteristicsSrc from '../../../templates/item/npc-template/tab-characteristics.hbs?raw';
import equipmentSrc from '../../../templates/item/npc-template/tab-equipment.hbs?raw';
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
        // The sheet's `_getTabs` hands the strip localized labels and full icon classes.
        tabs: [
            { tab: 'basics', icon: 'fa-solid fa-user', label: 'Basics', active: true },
            { tab: 'characteristics', icon: 'fa-solid fa-chart-bar', label: 'Characteristics', active: false },
            { tab: 'equipment', icon: 'fa-solid fa-swords', label: 'Equipment', active: false },
            { tab: 'abilities', icon: 'fa-solid fa-sparkles', label: 'Abilities', active: false },
            { tab: 'preview', icon: 'fa-solid fa-eye', label: 'Preview', active: false },
        ],
        // The characteristics tab's list, as `_prepareContext` builds it.
        characteristics: [
            { key: 'weaponSkill', label: 'Weapon Skill', short: 'WS', value: 30, unnatural: 0 },
            { key: 'ballisticSkill', label: 'Ballistic Skill', short: 'BS', value: 25, unnatural: 0 },
            { key: 'strength', label: 'Strength', short: 'S', value: 30, unnatural: 0 },
            { key: 'toughness', label: 'Toughness', short: 'T', value: 30, unnatural: 0 },
            { key: 'agility', label: 'Agility', short: 'Ag', value: 30, unnatural: 0 },
            { key: 'intelligence', label: 'Intelligence', short: 'Int', value: 25, unnatural: 0 },
            { key: 'perception', label: 'Perception', short: 'Per', value: 25, unnatural: 0 },
            { key: 'willpower', label: 'Willpower', short: 'WP', value: 25, unnatural: 0 },
            { key: 'fellowship', label: 'Fellowship', short: 'Fel', value: 20, unnatural: 0 },
            { key: 'influence', label: 'Influence', short: 'Inf', value: 20, unnatural: 0 },
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

/** A template's saved equipment, as the Equipment tab reads it. */
const EQUIPPED = {
    baseArmour: 3,
    armourNotes: 'Flak coat',
    customWeapons: [{ name: 'Autogun', damage: '1d10+3', pen: 0, range: '90m', rof: 'S/3/10', special: '' }],
    equipment: [{ name: 'Stummer', quantity: 2 }],
};

/**
 * #656: the Equipment tab's rows wrote `system.weapons.*` and `system.equipment.*`,
 * which the schema lacked, so they never saved. They now render from, and name,
 * `customWeapons` and `equipment`, and every add/remove control is a sheet action.
 */
export const EquipmentTabNamesSchemaPaths: Story = {
    render: () => renderTpl(Hbs.compile(equipmentSrc), makeCtx({ tab: { cssClass: 'active' }, system: EQUIPPED, source: EQUIPPED })),
    play: async ({ canvasElement }) => {
        const value = (name: string): string | undefined => canvasElement.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value;
        await expect(value('system.customWeapons.0.name')).toBe('Autogun');
        await expect(value('system.customWeapons.0.rof')).toBe('S/3/10');
        await expect(value('system.equipment.0.name')).toBe('Stummer');
        await expect(value('system.equipment.0.quantity')).toBe('2');
        await expect(value('system.armourNotes')).toBe('Flak coat');
        const actions = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-action]'), (el) => el.dataset['action']);
        await expect(actions).toEqual(['addWeapon', 'removeWeapon', 'addEquipment', 'removeEquipment']);
        await expect(canvasElement.querySelector('[name^="system.weapons."]')).toBeNull();
    },
};

/** The sheet's default width (NPCTemplateSheet `position.width`). */
const DEFAULT_WIDTH_PX = 700;

const GAME_LINES: readonly SystemId[] = ['dh1', 'dh2', 'rt', 'bc', 'dw', 'ow'];

/** Where `inner` ends horizontally: the right edge of its text, not of its box. */
function textRight(inner: Element): number {
    const range = document.createRange();
    range.selectNodeContents(inner);
    return range.getBoundingClientRect().right;
}

/**
 * #656: at the default width the tab row cut off its fifth tab, the Base
 * Characteristics heading ran into its subtitle, and the Trained Skills "+" sat
 * glued to its heading. Under every line: each tab sits inside the strip, the
 * subtitle sits below the heading, and the "+" clears the heading text.
 */
export const DefaultWidthLayout: Story = {
    render: () => {
        const host = document.createElement('div');
        host.className = 'tw-flex tw-flex-col tw-gap-4';
        for (const systemId of GAME_LINES) {
            const sheet = renderSheetParts(
                [
                    { template: tabsSrc, partClass: 'wh40k-part-tabs' },
                    { template: characteristicsSrc, partClass: 'wh40k-part-characteristics' },
                ],
                makeCtx({ tab: { cssClass: 'active' } }),
                { systemId },
            );
            sheet.style.width = `${DEFAULT_WIDTH_PX}px`;
            host.append(sheet);
        }
        return host;
    },
    play: async ({ canvasElement }) => {
        const problems: string[] = [];
        for (const nav of Array.from(canvasElement.querySelectorAll('nav.tabs'))) {
            const box = nav.getBoundingClientRect();
            for (const tab of Array.from(nav.querySelectorAll('[data-tab]'))) {
                const r = tab.getBoundingClientRect();
                if (r.right > box.right + 0.5 || r.left < box.left - 0.5) problems.push(`tab ${tab.getAttribute('data-tab') ?? ''} outside the strip`);
            }
        }
        for (const heading of Array.from(canvasElement.querySelectorAll('[data-field="base-characteristics-heading"]'))) {
            const title = heading.firstElementChild;
            const subtitle = heading.lastElementChild;
            if (title === null || subtitle === null || title === subtitle) problems.push('heading without its subtitle');
            else if (subtitle.getBoundingClientRect().top < title.getBoundingClientRect().bottom - 0.5) problems.push('subtitle overlaps the heading');
        }
        for (const add of Array.from(canvasElement.querySelectorAll('[data-action="addSkill"]'))) {
            const title = add.parentElement?.querySelector('h3');
            if (title == null) problems.push('add-skill without its heading');
            else if (add.getBoundingClientRect().left - textRight(title) < 8) problems.push('add-skill glued to its heading');
        }
        await expect(canvasElement.querySelectorAll('nav.tabs').length).toBe(GAME_LINES.length);
        await expect(problems).toEqual([]);
    },
};
