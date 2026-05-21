/**
 * Storybook stories for the Only War Battlefield Awareness panel
 * (#161 — core.md §"BATTLEFIELD AWARENESS AND MANOEUVRES" line 13361,
 * §"Support" line 13411; §"CREATING REGIMENTAL AWARDS" line 13103).
 *
 * Three visual states an operator needs to verify:
 *
 *   1. ReadyNoAwards — cooldown 0, no awards conferred. The Request
 *      button is enabled, the cooldown badge shows the success colour,
 *      the awards list shows the empty-state notice.
 *   2. CooldownWithAwards — cooldown 3 turns, two awards conferred
 *      (one characteristic delta, one Fate Point bonus). Request
 *      button disabled; the merged-bonus readout surfaces.
 *   3. ReadyMultiAwards — cooldown 0, three awards conferred with
 *      mixed bonus shapes (characteristic, trait, fate point). The
 *      merged-bonus readout shows each fold-step.
 *
 * Award bonuses are computed through `mergeRegimentalAwards` so any
 * change to the merge arithmetic surfaces here first.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { renderTemplate as renderTpl } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { mergeRegimentalAwards, type RegimentalAward } from '../../../module/rules/ow-regimental-award';
import panelSrc from './ow-battlefield-panel.hbs?raw';

initializeStoryHandlebars();

interface AvailableAward {
    id: string;
    name: string;
    description: string;
    conferred: boolean;
}

interface MergedView {
    characteristicDelta: Record<string, number>;
    traits: string[];
    bonusFatePoints: number;
    entryCount: number;
    hasAny: boolean;
}

interface BattlefieldPanelCtx {
    battlefieldPanel: {
        supportCooldown: number;
        canRequestSupport: boolean;
        cooldownActive: boolean;
        availableAwards: ReadonlyArray<AvailableAward>;
        merged: MergedView;
    };
}

function mergedView(awards: ReadonlyArray<RegimentalAward>): MergedView {
    const merged = mergeRegimentalAwards(awards);
    return {
        characteristicDelta: merged.characteristicDelta,
        traits: merged.traits,
        bonusFatePoints: merged.bonusFatePoints,
        entryCount: awards.length,
        hasAny: awards.length > 0 && (Object.keys(merged.characteristicDelta).length > 0 || merged.traits.length > 0 || merged.bonusFatePoints > 0),
    };
}

function buildContext(opts: {
    supportCooldown: number;
    awards: ReadonlyArray<RegimentalAward>;
    extraAvailable?: ReadonlyArray<Omit<AvailableAward, 'conferred'>>;
}): BattlefieldPanelCtx {
    const cooldownActive = opts.supportCooldown > 0;
    const conferredEntries: AvailableAward[] = opts.awards.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        conferred: true,
    }));
    const extras: AvailableAward[] = (opts.extraAvailable ?? []).map((a) => ({ ...a, conferred: false }));
    return {
        battlefieldPanel: {
            supportCooldown: opts.supportCooldown,
            canRequestSupport: !cooldownActive,
            cooldownActive,
            availableAwards: [...conferredEntries, ...extras],
            merged: mergedView(opts.awards),
        },
    };
}

const panelTpl = Hbs.compile(panelSrc);

function renderPanel(ctx: BattlefieldPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderTpl(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<BattlefieldPanelCtx> = {
    title: 'Actor/Character/OwBattlefieldPanel',
};
export default meta;
type Story = StoryObj<BattlefieldPanelCtx>;

const AWARD_VALOUR: RegimentalAward = {
    id: 'award-cadian-valour',
    name: 'Cadian Commendation for Valour',
    description: '+3 Willpower, awarded for steadfast conduct under fire.',
    bonus: { characteristic: 'WP', modifier: 3 },
};
const AWARD_PURGE: RegimentalAward = {
    id: 'award-purgation-cross',
    name: 'Purgation Cross',
    description: 'Granted Trait: Honoured; +1 bonus Fate Point.',
    bonus: { trait: 'Honoured', bonusFatePoint: 1 },
};
const AWARD_SHOCK: RegimentalAward = {
    id: 'award-shock-troop',
    name: 'Shock-Troop Pennant',
    description: '+2 Toughness, awarded to surviving members of a forlorn-hope assault.',
    bonus: { characteristic: 'T', modifier: 2 },
};

export const ReadyNoAwards: Story = {
    name: 'Ready — cooldown 0, no awards conferred',
    args: buildContext({
        supportCooldown: 0,
        awards: [],
        extraAvailable: [{ id: AWARD_VALOUR.id, name: AWARD_VALOUR.name, description: AWARD_VALOUR.description }],
    }),
    render: (args) => renderPanel(args),
};

export const CooldownWithAwards: Story = {
    name: 'Cooldown — 3 turns, two awards conferred',
    args: buildContext({
        supportCooldown: 3,
        awards: [AWARD_VALOUR, AWARD_PURGE],
    }),
    render: (args) => renderPanel(args),
};

export const ReadyMultiAwards: Story = {
    name: 'Ready — three awards conferred, merged-bonus readout surfaces',
    args: buildContext({
        supportCooldown: 0,
        awards: [AWARD_VALOUR, AWARD_PURGE, AWARD_SHOCK],
    }),
    render: (args) => renderPanel(args),
};
