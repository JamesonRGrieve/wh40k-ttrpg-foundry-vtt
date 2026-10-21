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
import { renderSheet, clickAction, toggleControls } from '../../../../stories/test-helpers';
import { type PrerequisiteActorView, toStructuredPrerequisites, unmetPrerequisites } from '../../rules/prerequisites.ts';
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
    chips: Array<{ key: string; label: string; accessible: number; count: number; active: boolean }>;
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
// DH2 core prints Smite's prerequisite as "Willpower 40"; BC core prints Field of
// Pestilence's as "Aligned Nurgle" and Wind of Chaos's as "Corruption 30+" (#675). A
// psyker who falls short sees the power blocked, its row naming the unmet gates the
// shared check reports.

/** A psyker's characteristics, alignment and thresholds, with nothing else owned. */
function psyker(view: Partial<PrerequisiteActorView>): PrerequisiteActorView {
    return { characteristics: {}, skillRanks: {}, talents: [], alignment: 'unaligned', thresholds: {}, ...view };
}

interface GatedPower {
    power: string;
    discipline: string;
    line: SystemId;
    /** The power's stored prerequisites, as the packs author them. */
    prerequisites: object;
    actor: PrerequisiteActorView;
    /** The unmet gates the row must name; empty when the power is purchasable. */
    unmet: readonly string[];
}

/** The psychic tab with one power, gated through the real prerequisite check. */
function gatedPanel({ power, discipline, prerequisites, actor }: GatedPower): PsychicPanel {
    const unmet = unmetPrerequisites(toStructuredPrerequisites(prerequisites), actor);
    const row: PsychicRow = {
        name: power,
        displayName: power,
        prCost: 1,
        cost: 200,
        index: 0,
        canPurchase: unmet.length === 0,
        blocked: unmet.length > 0,
        prereqDisplay: unmet,
    };
    return {
        psyAdvance: { currentRating: 2, nextRating: 3, cost: 600, canPurchase: true, cantAfford: false, maxed: false, offered: true },
        disciplines: [{ label: discipline, items: [row], tiers: [{ prCost: 1, label: 'PR 1', accessible: true, items: [row] }] }],
        chips: [],
        availableOnly: false,
        hasBlocked: unmet.length > 0,
    };
}

function gatedStory(name: string, gated: GatedPower): Story {
    return {
        name,
        args: {
            _gameSystemId: gated.line,
            activeTab: 'psychic',
            isPsyker: true,
            tabs: [...CAREER_TABS, { id: 'psychic', label: 'WH40K.Advancement.Tab.Psychic', icon: 'fa-brain', active: true }],
            psychic: gatedPanel(gated),
        },
        play: async ({ canvasElement }) => {
            const lock = canvasElement.querySelector<HTMLElement>('.fa-lock')?.parentElement ?? null;
            const chips = Array.from(lock?.querySelectorAll('span.tw-whitespace-nowrap') ?? [], (chip) => chip.textContent.trim());
            const purchase = canvasElement.querySelector('[data-action="purchaseAdvance"][data-type="psychic-power"]');
            await expect({ chips, purchasable: purchase !== null }).toEqual({ chips: [...gated.unmet], purchasable: gated.unmet.length === 0 });
        },
    };
}

const SMITE = { power: 'Smite', discipline: 'Biomancy', line: 'dh2', prerequisites: { text: 'Willpower 40', characteristics: { willpower: 40 } } } as const;
export const PrerequisiteBlocksSmite = gatedStory('Smite at Willpower 25', {
    ...SMITE,
    actor: psyker({ characteristics: { willpower: 25 } }),
    unmet: ['willpower 40+'],
});
export const PrerequisiteMetSmite = gatedStory('Smite at Willpower 40', { ...SMITE, actor: psyker({ characteristics: { willpower: 40 } }), unmet: [] });

const FIELD_OF_PESTILENCE = {
    power: 'Field of Pestilence',
    discipline: 'Nurgle Powers',
    line: 'bc',
    prerequisites: { text: 'Aligned Nurgle', alignment: 'nurgle' },
} as const;
export const PrerequisiteBlocksUnaligned = gatedStory('Field of Pestilence, unaligned', {
    ...FIELD_OF_PESTILENCE,
    actor: psyker({ alignment: 'unaligned' }),
    unmet: ['aligned nurgle'],
});
export const PrerequisiteMetAligned = gatedStory('Field of Pestilence, aligned to Nurgle', {
    ...FIELD_OF_PESTILENCE,
    actor: psyker({ alignment: 'nurgle' }),
    unmet: [],
});

// #676: a row with many unmet gates wraps them below its name rather than squeezing it.
export const PrerequisiteManyGates: Story = {
    ...gatedStory('Aegis of Euphedros, five unmet gates', {
        power: 'Aegis of Euphedros',
        discipline: 'Tzeentch Powers',
        line: 'bc',
        prerequisites: {
            text: 'Psy Rating 7, Infamy 70+, Forbidden Lore (The Warp) +30, Scholastic Lore (Occult) +30, Child of the Warp',
            skills: ['Forbidden Lore (The Warp) +30', 'Scholastic Lore (Occult) +30'],
            talents: ['Child of the Warp'],
            thresholds: { infamy: 70 },
        },
        actor: psyker({}),
        unmet: ['Forbidden Lore (The Warp) +30', 'Scholastic Lore (Occult) +30', 'Child of the Warp', 'infamy 70+'],
    }),
    play: async ({ canvasElement }) => {
        const lock = canvasElement.querySelector<HTMLElement>('.fa-lock')?.parentElement ?? null;
        const row = lock?.parentElement ?? null;
        const name = row?.firstElementChild ?? null;
        // The row wraps, and the name keeps a basis wide enough to read rather than shrinking to nothing.
        await expect({ wraps: row?.classList.contains('tw-flex-wrap'), nameBasis: name?.classList.contains('tw-flex-[1_1_14rem]') }).toEqual({
            wraps: true,
            nameBasis: true,
        });
    },
};

const WIND_OF_CHAOS: GatedPower = {
    power: 'Wind of Chaos',
    discipline: 'Chaos Powers',
    line: 'bc',
    prerequisites: { text: 'Corruption 30+', thresholds: { corruption: 30 } },
    actor: psyker({ thresholds: { corruption: 10 } }),
    unmet: ['corruption 30+'],
};
export const PrerequisiteBlocksCorruption = gatedStory('Wind of Chaos at Corruption 10', WIND_OF_CHAOS);

// #696: the "Available only" filter is one accessible toggle. The button carries its
// state as aria-pressed, and its check square is decorative.
function availableOnlyStory(on: boolean): Story {
    const gated = gatedStory(`Available only ${on ? 'on' : 'off'}`, WIND_OF_CHAOS);
    // The toolbar, and the toggle in it, render only beside the discipline chips.
    const chips = [{ key: 'chaos', label: WIND_OF_CHAOS.discipline, accessible: 0, count: 1, active: true }];
    const psychic = { ...gatedPanel(WIND_OF_CHAOS), chips, availableOnly: on };
    return {
        ...gated,
        args: { ...gated.args, psychic },
        play: async ({ canvasElement }) => {
            const button = canvasElement.querySelector<HTMLElement>('[data-action="toggleAvailableOnly"]');
            if (button === null) throw new Error('no Available only toggle rendered');
            const [control] = toggleControls(button.parentElement ?? button).filter((c) => c.name === button.textContent.trim());
            await expect(control).toEqual({ name: button.textContent.trim(), pressed: String(on), checkboxes: 0, icons: 1, iconsHidden: true });
            await expect(button.querySelector(on ? '.fa-check-square' : '.fa-square')).not.toBeNull();
        },
    };
}
export const AvailableOnlyOff = availableOnlyStory(false);
export const AvailableOnlyOn = availableOnlyStory(true);
