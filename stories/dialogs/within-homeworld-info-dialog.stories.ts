import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../src/templates/prompt/within-homeworld-info-dialog.hbs?raw';
import { WITHIN_HOMEWORLDS, WITHIN_HOMEWORLD_IDS } from '../../src/module/rules/within-homeworlds.ts';
import { renderSheet } from '../test-helpers';

interface Args {
    showAll: boolean;
}

/* Pure-data accent palette parallel to the dialog's runtime accent map.
 * Stories don't share the Foundry localization stack, so we build a
 * static view-model here that mirrors what _prepareContext emits. */
const accent = {
    agriWorld: {
        border: 'tw-border-amber-600',
        accentText: 'tw-text-amber-300',
        accentBg: 'tw-bg-amber-900/30',
    },
    feudalWorld: {
        border: 'tw-border-emerald-600',
        accentText: 'tw-text-emerald-300',
        accentBg: 'tw-bg-emerald-900/30',
    },
    frontierWorld: {
        border: 'tw-border-yellow-700',
        accentText: 'tw-text-yellow-200',
        accentBg: 'tw-bg-yellow-900/30',
    },
} as const;

const CHAR_LABEL: Record<string, string> = {
    weaponSkill: 'Weapon Skill',
    ballisticSkill: 'Ballistic Skill',
    strength: 'Strength',
    toughness: 'Toughness',
    agility: 'Agility',
    intelligence: 'Intelligence',
    perception: 'Perception',
    willpower: 'Willpower',
    fellowship: 'Fellowship',
};

function modsLabel(id: keyof typeof WITHIN_HOMEWORLDS): string {
    const def = WITHIN_HOMEWORLDS[id];
    const pos = def.characteristicMods.positive.map((c) => `+${CHAR_LABEL[c] ?? c}`);
    const neg = def.characteristicMods.negative.map((c) => `−${CHAR_LABEL[c] ?? c}`);
    return [...pos, ...neg].join(', ');
}

function buildCards(): unknown[] {
    return WITHIN_HOMEWORLD_IDS.map((id) => {
        const def = WITHIN_HOMEWORLDS[id];
        return {
            id,
            label: def.label,
            bonusName: def.homeWorldBonus.name,
            bonusDescription: def.homeWorldBonus.description,
            characteristicModsLabel: modsLabel(id),
            fateThresholdLabel: `${String(def.fateThreshold.base)} (${String(def.fateThreshold.emperorsBlessingMin)}+)`,
            woundsLabel: `${String(def.wounds.flat)} + ${String(def.wounds.dice)}d${String(def.wounds.faces)}`,
            keyAptitudes: def.keyAptitudes.map((c) => CHAR_LABEL[c] ?? c),
            accent: accent[id],
        };
    });
}

const meta = {
    title: 'Dialogs/WithinHomeworldInfoDialog',
    render: (_args) => renderSheet(templateSrc, { cards: buildCards() }),
    args: { showAll: true },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const RendersThreeHomeworldCards: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const cards = canvasElement.querySelectorAll('[data-homeworld]');
        expect(cards.length).toBe(3);
        expect(canvas.getByText(/Agri World/i)).toBeTruthy();
        expect(canvas.getByText(/Feudal World/i)).toBeTruthy();
        expect(canvas.getByText(/Frontier World/i)).toBeTruthy();
    },
};

export const AgriWorldShowsBrutalCharge: Story = {
    play: async ({ canvasElement }) => {
        const agri = canvasElement.querySelector('[data-homeworld="agriWorld"]');
        expect(agri).toBeTruthy();
        expect(agri?.textContent).toMatch(/Brutal Charge/);
        expect(agri?.textContent).toMatch(/Strength from the Land/);
    },
};

export const FrontierWorldShowsTechUseBonus: Story = {
    play: async ({ canvasElement }) => {
        const frontier = canvasElement.querySelector('[data-homeworld="frontierWorld"]');
        expect(frontier).toBeTruthy();
        expect(frontier?.textContent).toMatch(/Tech-Use/);
        expect(frontier?.textContent).toMatch(/Rely on None but Yourself/);
    },
};
