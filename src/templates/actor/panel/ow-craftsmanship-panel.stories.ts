/**
 * Storybook stories for the Only War Craftsmanship readout panel (#158).
 *
 *   1. EmptyLoadout — no equipped weapons / armour; the empty-state
 *      notice renders and neither the weapons nor the armours sub-list
 *      is emitted.
 *   2. MixedLoadout — a Poor lasgun (ranged, gains Unreliable), a Good
 *      chainsword (melee, +5 WS), and a Common flak armour (no shift).
 *   3. BestEverywhere — all three tiers at their RAW maximum: a Best
 *      bolt pistol (Never Jams), a Best power sword (+10 WS, +1 dmg),
 *      and a Best carapace armour (+1 AP, half weight).
 *
 * Values come straight from `getRanged/Melee/ArmourCraftsmanshipEffect`
 * so the stories stay in lockstep with the engine without re-encoding
 * the static tables.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { renderTemplate as renderTpl } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import {
    type ArmourCraftsmanshipEffect,
    type Craftsmanship,
    getArmourCraftsmanshipEffect,
    getMeleeCraftsmanshipEffect,
    getRangedCraftsmanshipEffect,
    type MeleeCraftsmanshipEffect,
    type RangedCraftsmanshipEffect,
} from '../../../module/rules/ow-craftsmanship.ts';
import panelSrc from './ow-craftsmanship-panel.hbs?raw';

initializeStoryHandlebars();

interface RangedEntry {
    kind: 'ranged';
    itemId: string;
    name: string;
    tier: Craftsmanship;
    effect: RangedCraftsmanshipEffect;
}

interface MeleeEntry {
    kind: 'melee';
    itemId: string;
    name: string;
    tier: Craftsmanship;
    effect: MeleeCraftsmanshipEffect;
}

interface ArmourEntry {
    itemId: string;
    name: string;
    tier: Craftsmanship;
    effect: ArmourCraftsmanshipEffect;
}

interface CraftsmanshipPanelCtx {
    craftsmanshipPanel: {
        weapons: ReadonlyArray<RangedEntry | MeleeEntry>;
        armours: ReadonlyArray<ArmourEntry>;
        hasEntries: boolean;
    };
}

function ranged(itemId: string, name: string, tier: Craftsmanship): RangedEntry {
    return { kind: 'ranged', itemId, name, tier, effect: getRangedCraftsmanshipEffect(tier) };
}

function melee(itemId: string, name: string, tier: Craftsmanship): MeleeEntry {
    return { kind: 'melee', itemId, name, tier, effect: getMeleeCraftsmanshipEffect(tier) };
}

function armour(itemId: string, name: string, tier: Craftsmanship): ArmourEntry {
    return { itemId, name, tier, effect: getArmourCraftsmanshipEffect(tier) };
}

const panelTpl = Hbs.compile(panelSrc);

function renderPanel(ctx: CraftsmanshipPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderTpl(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<CraftsmanshipPanelCtx> = {
    title: 'Actor/Character/OwCraftsmanshipPanel',
};
export default meta;
type Story = StoryObj<CraftsmanshipPanelCtx>;

export const EmptyLoadout: Story = {
    name: 'Empty loadout — nothing equipped, empty-state notice',
    args: {
        craftsmanshipPanel: {
            weapons: [],
            armours: [],
            hasEntries: false,
        },
    },
    render: (args) => renderPanel(args),
};

export const MixedLoadout: Story = {
    name: 'Mixed loadout — Poor lasgun, Good chainsword, Common flak',
    args: {
        craftsmanshipPanel: {
            weapons: [ranged('weapon-las', 'Lasgun', 'poor'), melee('weapon-cs', 'Chainsword', 'good')],
            armours: [armour('armour-flak', 'Flak Armour', 'common')],
            hasEntries: true,
        },
    },
    render: (args) => renderPanel(args),
};

export const BestEverywhere: Story = {
    name: 'Best across the board — Never Jams pistol, +10 WS power sword, +1 AP / half-weight carapace',
    args: {
        craftsmanshipPanel: {
            weapons: [ranged('weapon-bp', 'Bolt Pistol', 'best'), melee('weapon-ps', 'Power Sword', 'best')],
            armours: [armour('armour-cara', 'Carapace Armour', 'best')],
            hasEntries: true,
        },
    },
    render: (args) => renderPanel(args),
};
