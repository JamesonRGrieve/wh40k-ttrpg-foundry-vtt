/**
 * Storybook stories for the Deathwatch Special-Issue Ammunition panel (#172).
 *
 * Three stories covering the panel's render states:
 *   1. Standard — no special ammunition loaded; effect block collapses
 *      to the `NoSelection` placeholder.
 *   2. Kraken  — a "simple" Special-Issue type (single Penetration
 *      bonus); exercises the effect-block path and the selected-radio
 *      highlight.
 *   3. Hellfire — a conditional Special-Issue type
 *      (`conditionalUnarmored`); exercises the conditional-line render
 *      and a damage-dice bonus.
 *
 * Mock context shape matches the contract in the panel HBS header. Per
 * the "Seeded RNG in stories" rule in CLAUDE.md every value is fixed
 * for diff stability — no Math.random in this module.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { DW_SPECIAL_AMMO_EFFECTS, type DwSpecialAmmoId } from '../../../module/rules/dw-special-ammo.ts';
import panelSrc from './dw-ammo-panel.hbs?raw';

initializeStoryHandlebars();

type DwSelectedAmmoId = DwSpecialAmmoId | 'standard';

interface AmmoOption {
    id: DwSelectedAmmoId;
    label: string;
    selected: boolean;
    summary: string;
}

interface AmmoEffectCtx {
    bonusDamageDice: number;
    bonusFlatDamage: number;
    bonusPenetration: number;
    bonusHitsPerDoS: number;
    ignoresCover: boolean;
    ignoresEnergyFields: boolean;
    reliabilityShift: number;
    stealthBonus: number;
    fireDamage: boolean;
    conditionalUnarmored: boolean;
}

interface AmmoPanelCtx {
    ammoPanel: {
        selected: DwSelectedAmmoId;
        selectedLabel: string;
        options: AmmoOption[];
        effect: AmmoEffectCtx | null;
    };
}

const AMMO_LABELS: Readonly<Record<DwSelectedAmmoId, string>> = Object.freeze({
    'standard': 'Standard',
    'hellfire': 'Hellfire',
    'kraken': 'Kraken',
    'metal-storm': 'Metal Storm',
    'tempest': 'Tempest',
    'stalker': 'Stalker',
    'vengeance': 'Vengeance',
    'dragonfire': 'Dragonfire',
});

const AMMO_SUMMARIES: Readonly<Record<DwSelectedAmmoId, string>> = Object.freeze({
    'standard': 'No engine effect.',
    'hellfire': '+1d10 damage vs. unarmored targets.',
    'kraken': '+3 Penetration.',
    'metal-storm': '+1 hit per Degree of Success.',
    'tempest': 'Ignores energy fields.',
    'stalker': 'Silent; +10 Stealth.',
    'vengeance': '+2 damage; -1 Reliability.',
    'dragonfire': '+1d10 Fire damage; ignores cover.',
});

const SELECT_ORDER: ReadonlyArray<DwSelectedAmmoId> = ['standard', 'hellfire', 'kraken', 'metal-storm', 'tempest', 'stalker', 'vengeance', 'dragonfire'];

function buildOptions(selected: DwSelectedAmmoId): AmmoOption[] {
    return SELECT_ORDER.map((id) => ({
        id,
        label: AMMO_LABELS[id],
        selected: id === selected,
        summary: AMMO_SUMMARIES[id],
    }));
}

function buildEffectCtx(id: DwSpecialAmmoId): AmmoEffectCtx {
    const effect = DW_SPECIAL_AMMO_EFFECTS[id];
    return {
        bonusDamageDice: effect.bonusDamageDice,
        bonusFlatDamage: effect.bonusFlatDamage,
        bonusPenetration: effect.bonusPenetration,
        bonusHitsPerDoS: effect.bonusHitsPerDoS,
        ignoresCover: effect.ignoresCover,
        ignoresEnergyFields: effect.ignoresEnergyFields,
        reliabilityShift: effect.reliabilityShift,
        stealthBonus: effect.stealthBonus,
        fireDamage: effect.fireDamage,
        conditionalUnarmored: effect.conditionalUnarmored === true,
    };
}

function renderPanel(ctx: AmmoPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const meta: Meta<AmmoPanelCtx> = {
    title: 'Actor/Character/DwAmmoPanel',
};
export default meta;
type Story = StoryObj<AmmoPanelCtx>;

export const Standard: Story = {
    name: 'Standard — no special ammunition loaded',
    args: {
        ammoPanel: {
            selected: 'standard',
            selectedLabel: AMMO_LABELS.standard,
            options: buildOptions('standard'),
            effect: null,
        },
    },
    render: (args) => renderPanel(args),
};

export const Kraken: Story = {
    name: 'Kraken — +3 Penetration, unconditional',
    args: {
        ammoPanel: {
            selected: 'kraken',
            selectedLabel: AMMO_LABELS.kraken,
            options: buildOptions('kraken'),
            effect: buildEffectCtx('kraken'),
        },
    },
    render: (args) => renderPanel(args),
};

export const Hellfire: Story = {
    name: 'Hellfire — +1d10 vs. unarmored (conditional)',
    args: {
        ammoPanel: {
            selected: 'hellfire',
            selectedLabel: AMMO_LABELS.hellfire,
            options: buildOptions('hellfire'),
            effect: buildEffectCtx('hellfire'),
        },
    },
    render: (args) => renderPanel(args),
};
