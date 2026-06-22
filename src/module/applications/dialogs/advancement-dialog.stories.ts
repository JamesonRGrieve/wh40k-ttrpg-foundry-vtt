/**
 * Stories for AdvancementDialog — the XP-spend dialog. The dialog is a
 * HandlebarsApplicationMixin app whose `_prepareContext` assembles a large
 * context from the actor + compendium; these stories render the dialog's
 * `.hbs` template against representative prepared contexts (the no-career
 * blocked state, a populated career state with the characteristics tab, and
 * the aptitude-systems psychic/traits tab set) so layout regressions surface.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/advancement-dialog.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';

interface Tab {
    id: string;
    label: string;
    icon: string;
    active: boolean;
}

interface CharacteristicRow {
    key: string;
    label: string;
    abbreviation: string;
    currentValue: number;
    currentAdvances: number;
    nextCost: number | null;
    nextTierLabel: string | null;
    isMaxed: boolean;
    canPurchase: boolean;
    cantAfford: boolean;
}

interface Args {
    _gameSystemId: string;
    hasCareer: boolean;
    originCareerName: string | null;
    xp: { total: number; used: number; available: number; usedPercent: number };
    activeTab: string;
    tabs: Tab[];
    characteristics: CharacteristicRow[];
    skills: never[];
    talents: never[];
    recentPurchases: string[];
}

const CAREER_TABS: Tab[] = [
    { id: 'characteristics', label: 'WH40K.Advancement.Tab.Characteristics', icon: 'fa-chart-bar', active: true },
    { id: 'skills', label: 'WH40K.Advancement.Tab.Skills', icon: 'fa-book', active: false },
    { id: 'talents', label: 'WH40K.Advancement.Tab.Talents', icon: 'fa-star', active: false },
];

const CHARACTERISTICS: CharacteristicRow[] = [
    {
        key: 'weaponSkill',
        label: 'Weapon Skill',
        abbreviation: 'WS',
        currentValue: 35,
        currentAdvances: 1,
        nextCost: 250,
        nextTierLabel: 'Trained',
        isMaxed: false,
        canPurchase: true,
        cantAfford: false,
    },
    {
        key: 'ballisticSkill',
        label: 'Ballistic Skill',
        abbreviation: 'BS',
        currentValue: 30,
        currentAdvances: 0,
        nextCost: 500,
        nextTierLabel: 'Known',
        isMaxed: false,
        canPurchase: false,
        cantAfford: true,
    },
];

const meta = {
    title: 'Dialogs/AdvancementDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        _gameSystemId: 'dh2',
        hasCareer: true,
        originCareerName: 'Adept',
        xp: { total: 1000, used: 250, available: 750, usedPercent: 25 },
        activeTab: 'characteristics',
        tabs: CAREER_TABS,
        characteristics: CHARACTERISTICS,
        skills: [],
        talents: [],
        recentPurchases: [],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Characteristics: Story = {
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        // localize() returns the raw key when no langpack is mounted.
        await expect(scope.getByText(/WH40K\.Advancement\.XPAvailable|XP Available/)).toBeTruthy();
        await expect(scope.getByText('750')).toBeTruthy();
    },
};

export const NoCareer: Story = {
    args: {
        hasCareer: false,
        originCareerName: null,
        xp: { total: 0, used: 0, available: 0, usedPercent: 0 },
        tabs: [],
        characteristics: [],
    },
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText(/WH40K\.Advancement\.NoCareerTitle|No Career/)).toBeTruthy();
    },
};

export const AptitudeSystem: Story = {
    name: 'Aptitude system tabs',
    args: {
        _gameSystemId: 'ow',
        originCareerName: 'Sanctioned Psyker',
        tabs: [
            ...CAREER_TABS,
            { id: 'psychic', label: 'WH40K.Advancement.Tab.Psychic', icon: 'fa-brain', active: false },
            { id: 'traits', label: 'WH40K.Advancement.Tab.Traits', icon: 'fa-medal', active: false },
        ],
    },
    play: ({ canvasElement }) => {
        // The switchTab action handle must exist for the runtime dialog to wire tabs.
        clickAction(canvasElement, 'switchTab');
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// The dialog root carries `data-wh40k-system="{{_gameSystemId}}"`, which gates
// the per-system `<id>:tw-text-*` accent variants on the XP-summary heading.
// One story per game line keeps the seven palettes under visual review so a
// DH2-only assumption in the header treatment surfaces (CLAUDE.md "Per-system
// homologation in stories"). The shared career context is reused unchanged; only
// the active system id (and a representative career label) differs per line.

const SYSTEM_CAREER: Record<SystemId, string> = {
    dh2: 'Adept',
    dh1: 'Scribe',
    rt: 'Seneschal',
    bc: 'Apostate',
    ow: 'Operator',
    dw: 'Tactical Marine',
    im: 'Savant',
};

function perSystemStory(systemId: SystemId): Story {
    return {
        name: `Per-system — ${systemId.toUpperCase()}`,
        args: {
            _gameSystemId: systemId,
            originCareerName: SYSTEM_CAREER[systemId],
        },
        play: async ({ canvasElement }) => {
            // The dialog root must surface the active system so the variants cascade.
            const root = canvasElement.querySelector<HTMLElement>(`[data-wh40k-system="${systemId}"]`);
            await expect(root).not.toBeNull();
        },
    };
}

export const SystemDH2 = perSystemStory('dh2');
export const SystemDH1 = perSystemStory('dh1');
export const SystemRT = perSystemStory('rt');
export const SystemBC = perSystemStory('bc');
export const SystemOW = perSystemStory('ow');
export const SystemDW = perSystemStory('dw');
export const SystemIM = perSystemStory('im');
