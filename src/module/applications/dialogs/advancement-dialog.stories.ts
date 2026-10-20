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
import { toStructuredPrerequisites, unmetPrerequisites } from '../../data/shared/prerequisites-field.ts';
import { psychicPowerCharge, psychicPowerXpCost } from '../../rules/xp-costs.ts';
import { type SupportedLineKey, systemForLine } from '../../utils/item-variant-utils.ts';

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
    isPsyker?: boolean;
    psychic?: PsychicPanel;
}

interface PsychicRow {
    name: string;
    displayName: string;
    prCost: number;
    cost: number;
    index: number;
    canPurchase: boolean;
    blocked?: boolean;
    prereqDisplay?: string[];
}

interface PsychicPanel {
    psyAdvance: { currentRating: number; nextRating: number; cost: number; canPurchase: boolean; cantAfford: boolean; maxed: boolean; offered: boolean };
    disciplines: Array<{ label: string; items: PsychicRow[]; tiers: Array<{ prCost: number; label: string; accessible: boolean; items: PsychicRow[] }> }>;
    chips: never[];
    availableOnly: boolean;
    hasBlocked: boolean;
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

// ── Printed XP per line (content#30) ──────────────────────────────────────────
//
// A power shared across lines prints a different XP value in each book:
// Precognition is 400 xp in DH2 core and 100 xp in BC core, and DH1 prints none
// (its powers are bought from career tables). The compendium index carries the
// per-line map raw; the dialog resolves it to the actor's line before charging.

/** Raw index entries as the packs author them: the per-line cost map and its source lines. */
const SHARED_POWERS = [
    {
        name: 'Precognition',
        cost: { dh2: 400, bc: 100, dh1: null },
        source: { dh2: { provenance: 'raw' }, bc: { provenance: 'raw' }, dh1: { provenance: 'raw' } },
    },
    {
        name: 'Cauterise',
        cost: 300,
        source: { dh2: { provenance: 'raw' } },
    },
] as const;

/** The psychic tab as the dialog prepares it for `line`, each power charged through the real resolver. */
function pricedPsychicPanel(line: SupportedLineKey): PsychicPanel {
    const items = SHARED_POWERS.map((power, index) => ({
        name: power.name,
        displayName: power.name,
        prCost: 1,
        cost: psychicPowerCharge(psychicPowerXpCost(systemForLine({ cost: power.cost, source: power.source }, line).cost), 1),
        index,
        canPurchase: true,
    }));
    return {
        psyAdvance: { currentRating: 2, nextRating: 3, cost: 600, canPurchase: true, cantAfford: false, maxed: false, offered: true },
        disciplines: [{ label: 'Telepathy', items, tiers: [{ prCost: 1, label: 'PR 1', accessible: true, items }] }],
        chips: [],
        availableOnly: false,
        hasBlocked: false,
    };
}

function printedXpStory(line: 'dh2' | 'bc', expected: Record<string, number>): Story {
    return {
        name: `Psychic powers at printed XP — ${line.toUpperCase()}`,
        args: {
            _gameSystemId: line,
            activeTab: 'psychic',
            isPsyker: true,
            tabs: [...CAREER_TABS, { id: 'psychic', label: 'WH40K.Advancement.Tab.Psychic', icon: 'fa-brain', active: true }],
            psychic: pricedPsychicPanel(line),
        },
        play: async ({ canvasElement }) => {
            const buttons = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>('[data-action="purchaseAdvance"][data-type="psychic-power"]'));
            const charged = Object.fromEntries(buttons.map((button) => [SHARED_POWERS[Number(button.dataset['index'])]?.name, button.textContent.trim()]));
            await expect(charged).toEqual(
                Object.fromEntries(Object.entries(expected).map(([name, xp]) => [name, expect.stringMatching(new RegExp(`^${xp}\\b`))])),
            );
        },
    };
}

// Cauterise is DH2-only, so a BC psyker sees it at the same printed 300.
export const PsychicPrintedXpBC = printedXpStory('bc', { Precognition: 100, Cauterise: 300 });
export const PsychicPrintedXpDH2 = printedXpStory('dh2', { Precognition: 400, Cauterise: 300 });

// ── Printed prerequisites (#673) ──────────────────────────────────────────────
//
// DH2 core prints Smite's prerequisite as "Willpower 40". A psyker with Willpower 25
// sees Smite blocked, its row naming the unmet gate the shared check reports.

/** Smite's psychic tab for a psyker with `willpower`, gated through the real prerequisite check. */
function smitePanel(willpower: number): PsychicPanel {
    const unmet = unmetPrerequisites(toStructuredPrerequisites({ text: 'Willpower 40', characteristics: { willpower: 40 } }), {
        characteristics: { willpower },
        skillRanks: {},
        talents: [],
    });
    const smite: PsychicRow = {
        name: 'Smite',
        displayName: 'Smite',
        prCost: 1,
        cost: 200,
        index: 0,
        canPurchase: unmet.length === 0,
        blocked: unmet.length > 0,
        prereqDisplay: unmet,
    };
    return {
        psyAdvance: { currentRating: 2, nextRating: 3, cost: 600, canPurchase: true, cantAfford: false, maxed: false, offered: true },
        disciplines: [{ label: 'Biomancy', items: [smite], tiers: [{ prCost: 1, label: 'PR 1', accessible: true, items: [smite] }] }],
        chips: [],
        availableOnly: false,
        hasBlocked: unmet.length > 0,
    };
}

function smiteStory(willpower: number, expectBlocked: boolean): Story {
    return {
        name: `Smite at Willpower ${willpower}`,
        args: {
            activeTab: 'psychic',
            isPsyker: true,
            tabs: [...CAREER_TABS, { id: 'psychic', label: 'WH40K.Advancement.Tab.Psychic', icon: 'fa-brain', active: true }],
            psychic: smitePanel(willpower),
        },
        play: async ({ canvasElement }) => {
            const blocked = canvasElement.querySelector<HTMLElement>('.fa-lock')?.parentElement ?? null;
            const purchase = canvasElement.querySelector('[data-action="purchaseAdvance"][data-type="psychic-power"]');
            await expect({ blocked: blocked?.textContent.includes('willpower 40+') ?? false, purchasable: purchase !== null }).toEqual({
                blocked: expectBlocked,
                purchasable: !expectBlocked,
            });
        },
    };
}

export const PrerequisiteBlocksSmite = smiteStory(25, true);
export const PrerequisiteMetSmite = smiteStory(40, false);
