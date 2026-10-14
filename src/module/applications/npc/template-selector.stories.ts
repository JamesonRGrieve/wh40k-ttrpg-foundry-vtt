/**
 * Stories for TemplateSelector — the GM dialog that lists NPC templates, filters
 * them, previews the chosen one at a threat level and creates an NPC from it.
 * The args are the shape `TemplateSelector._prepareContext` returns.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/template-selector.hbs?raw';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';

interface Row {
    uuid: string;
    name: string;
    img: string;
    category: string;
    categoryLabel: string;
    faction: string;
    baseThreat: number;
    type: string;
    role: string;
    summary: string;
    selected: boolean;
}

interface Button {
    action: string;
    icon: string;
    label: string;
    disabled?: boolean;
}

interface Preview {
    threatLevel: number;
    characteristics: Array<{ key: string; label: string; value: number }>;
    wounds: number;
    armour: number;
    weaponCount: number;
    skillCount: number;
}

interface Args {
    templates: Row[];
    hasTemplates: boolean;
    templateCount: number;
    filters: { category: string; faction: string; search: string };
    categories: Array<{ key: string; label: string; selected: boolean }>;
    factions: Array<{ key: string; label: string; selected: boolean }>;
    selectedTemplate?: { name: string };
    hasSelection: boolean;
    preview: Preview | null;
    threatLevel: number;
    isHorde: boolean;
    buttons: Button[];
}

const ROWS: Row[] = [
    {
        uuid: 'Item.cultist',
        name: 'Chaos Cultist',
        img: 'icons/svg/mystery-man.svg',
        category: 'humanoid',
        categoryLabel: 'Humanoid',
        faction: 'Chaos',
        baseThreat: 4,
        type: 'troop',
        role: 'bruiser',
        summary: 'A frenzied heretic armed with whatever came to hand.',
        selected: false,
    },
    {
        uuid: 'Item.enforcer',
        name: 'Hive Enforcer',
        img: 'icons/svg/mystery-man.svg',
        category: 'humanoid',
        categoryLabel: 'Humanoid',
        faction: 'Adeptus Arbites',
        baseThreat: 6,
        type: 'troop',
        role: 'specialist',
        summary: '',
        selected: false,
    },
    {
        uuid: 'Item.daemonette',
        name: 'Daemonette',
        img: 'icons/svg/mystery-man.svg',
        category: 'daemon',
        categoryLabel: 'Daemon',
        faction: 'Slaanesh',
        baseThreat: 12,
        type: 'elite',
        role: 'skirmisher',
        summary: 'A lithe daemon of the Dark Prince.',
        selected: false,
    },
];

const createButton = (disabled: boolean): Button[] => [
    { action: 'create', icon: 'fa-solid fa-plus', label: 'WH40K.NPC.Template.CreateFromTemplate', disabled },
    { action: 'cancel', icon: 'fa-solid fa-times', label: 'WH40K.Cancel' },
];

const meta = {
    title: 'NPC/TemplateSelector',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        templates: ROWS,
        hasTemplates: true,
        templateCount: ROWS.length,
        filters: { category: '', faction: '', search: '' },
        categories: [
            { key: 'daemon', label: 'Daemon', selected: false },
            { key: 'humanoid', label: 'Humanoid', selected: false },
        ],
        factions: [
            { key: 'Adeptus Arbites', label: 'Adeptus Arbites', selected: false },
            { key: 'Chaos', label: 'Chaos', selected: false },
            { key: 'Slaanesh', label: 'Slaanesh', selected: false },
        ],
        hasSelection: false,
        preview: null,
        threatLevel: 5,
        isHorde: false,
        buttons: createButton(true),
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Nothing chosen yet: every template is listed and Create is disabled. */
export const Browse: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Chaos Cultist')).toBeTruthy();
        await expect(scope.getByText('Daemonette')).toBeTruthy();
        await expect(canvasElement.querySelectorAll('[data-action="selectTemplate"]').length).toBe(3);
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="create"]')?.disabled).toBe(true);
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-uuid="Item.daemonette"] h4')?.click();
        await expect(clicks).toEqual([{ action: 'selectTemplate', dataset: { uuid: 'Item.daemonette', tsel: 'row' } }]);
    },
};

/** A template chosen: preview at threat 9 as a horde, Create enabled. */
export const Selected: Story = {
    args: {
        templates: ROWS.map((row) => ({ ...row, selected: row.uuid === 'Item.cultist' })),
        selectedTemplate: { name: 'Chaos Cultist' },
        hasSelection: true,
        threatLevel: 9,
        isHorde: true,
        preview: {
            threatLevel: 9,
            characteristics: [
                { key: 'weaponSkill', label: 'WS', value: 38 },
                { key: 'ballisticSkill', label: 'BS', value: 33 },
                { key: 'strength', label: 'S', value: 35 },
                { key: 'toughness', label: 'T', value: 35 },
                { key: 'agility', label: 'Ag', value: 32 },
                { key: 'intelligence', label: 'Int', value: 25 },
                { key: 'perception', label: 'Per', value: 30 },
                { key: 'willpower', label: 'WP', value: 30 },
                { key: 'fellowship', label: 'Fel', value: 22 },
            ],
            wounds: 14,
            armour: 3,
            weaponCount: 2,
            skillCount: 4,
        },
        buttons: createButton(false),
    },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(canvasElement.querySelector('[data-uuid="Item.cultist"]')?.getAttribute('aria-selected')).toBe('true');
        await expect(scope.getByText(/Selected Template: Chaos Cultist/)).toBeTruthy();
        await expect(canvasElement.querySelector<HTMLInputElement>('[name="threatLevel"]')?.value).toBe('9');
        await expect(canvasElement.querySelector<HTMLInputElement>('[name="isHorde"]')?.checked).toBe(true);
        await expect(canvasElement.querySelector('[data-preview="wounds"]')?.textContent).toBe('14');
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="create"]')?.disabled).toBe(false);
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('[data-action="create"]')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['create']);
    },
};

/** Filters that match nothing: the empty state and a Clear Filters control. */
export const NoMatches: Story = {
    args: {
        templates: [],
        hasTemplates: false,
        templateCount: 0,
        filters: { category: 'daemon', faction: 'Chaos', search: 'zzz' },
        categories: [
            { key: 'daemon', label: 'Daemon', selected: true },
            { key: 'humanoid', label: 'Humanoid', selected: false },
        ],
        factions: [{ key: 'Chaos', label: 'Chaos', selected: true }],
    },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('No templates found matching your filters')).toBeTruthy();
        await expect(canvasElement.querySelector<HTMLSelectElement>('[name="filterCategory"]')?.value).toBe('daemon');
        await expect(canvasElement.querySelector<HTMLInputElement>('[name="filterSearch"]')?.value).toBe('zzz');
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('[data-action="clearFilter"]')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['clearFilter']);
    },
};
