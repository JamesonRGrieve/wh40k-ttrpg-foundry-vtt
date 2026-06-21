import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/within-homeworld-info-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

/**
 * Storybook stories for WithinHomeworldInfoDialog (GitHub #139 / #338).
 *
 * The dialog reads its mechanical values from the compendium pack
 * `dh2-within-origins-homeworlds` at render time. Stories don't run the
 * Foundry compendium stack, so we build a static view-model here that
 * mirrors what `_prepareContext` emits — the values are the projected
 * compendium basics for Agri / Feudal / Frontier.
 */

interface Args {
    showAll: boolean;
}

const accent = {
    'agri-world': {
        border: 'tw-border-amber-600',
        accentText: 'tw-text-amber-300',
        accentBg: 'tw-bg-amber-900/30',
    },
    'feudal-world': {
        border: 'tw-border-emerald-600',
        accentText: 'tw-text-emerald-300',
        accentBg: 'tw-bg-emerald-900/30',
    },
    'frontier-world': {
        border: 'tw-border-yellow-700',
        accentText: 'tw-text-yellow-200',
        accentBg: 'tw-bg-yellow-900/30',
    },
} as const;

interface WithinHomeworldCardCtx {
    id: keyof typeof accent;
    label: string;
    bonusName: string;
    bonusDescription: string;
    characteristicModsLabel: string;
    fateThresholdLabel: string;
    woundsLabel: string;
    keyAptitudes: readonly string[];
    accent: (typeof accent)[keyof typeof accent];
}

/** The projected compendium basics, mirroring `readHomeworldMechanics` output. */
const CARDS: WithinHomeworldCardCtx[] = [
    {
        id: 'agri-world',
        label: 'Agri World',
        bonusName: 'Strength from the Land',
        bonusDescription: 'An agri-world character starts with the Brutal Charge (2) trait.',
        characteristicModsLabel: '+Fellowship, +Strength, −Agility',
        fateThresholdLabel: '2 (7+)',
        woundsLabel: '8 + 1d5',
        keyAptitudes: ['Strength'],
        accent: accent['agri-world'],
    },
    {
        id: 'feudal-world',
        label: 'Feudal World',
        bonusName: 'At Home in Armour',
        bonusDescription: 'A feudal world character ignores the maximum Agility value imposed by any armour he is wearing.',
        characteristicModsLabel: '+Perception, +Weapon Skill, −Intelligence',
        fateThresholdLabel: '3 (6+)',
        woundsLabel: '9 + 1d5',
        keyAptitudes: ['Weapon Skill'],
        accent: accent['feudal-world'],
    },
    {
        id: 'frontier-world',
        label: 'Frontier World',
        bonusName: 'Rely on None but Yourself',
        bonusDescription:
            'A frontier world character gains a +20 bonus to Tech-Use tests when applying personal weapon modifications, and a +10 bonus when repairing damaged items.',
        characteristicModsLabel: '+Ballistic Skill, +Perception, −Fellowship',
        fateThresholdLabel: '3 (7+)',
        woundsLabel: '7 + 1d5',
        keyAptitudes: ['Ballistic Skill'],
        accent: accent['frontier-world'],
    },
];

const meta = {
    title: 'Dialogs/WithinHomeworldInfoDialog',
    render: (_args) => renderSheet(templateSrc, { cards: CARDS }),
    args: { showAll: true },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const RendersThreeHomeworldCards: Story = {
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        const cards = canvasElement.querySelectorAll('[data-homeworld]');
        void expect(cards.length).toBe(3);
        void expect(cv.getByText(/Agri World/i)).toBeTruthy();
        void expect(cv.getByText(/Feudal World/i)).toBeTruthy();
        void expect(cv.getByText(/Frontier World/i)).toBeTruthy();
    },
};

export const AgriWorldShowsBrutalCharge: Story = {
    play: ({ canvasElement }) => {
        const agri = canvasElement.querySelector('[data-homeworld="agri-world"]');
        void expect(agri).toBeTruthy();
        void expect(agri?.textContent).toMatch(/Brutal Charge/);
        void expect(agri?.textContent).toMatch(/Strength from the Land/);
    },
};

export const FrontierWorldShowsTechUseBonus: Story = {
    play: ({ canvasElement }) => {
        const frontier = canvasElement.querySelector('[data-homeworld="frontier-world"]');
        void expect(frontier).toBeTruthy();
        void expect(frontier?.textContent).toMatch(/Tech-Use/);
        void expect(frontier?.textContent).toMatch(/Rely on None but Yourself/);
    },
};
