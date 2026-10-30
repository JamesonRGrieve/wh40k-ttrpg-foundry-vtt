/**
 * Stories for ReinforcementCallDialog (#77): the GM calls a Reinforcement
 * Character into play (DH2). The stories render the dialog's
 * `.hbs` against the same `buildReinforcementCallView` context the dialog
 * builds. RCs are a DH2 rule (the NPC sheet only offers the call on a DH2
 * NPC), so the wrapper carries `data-wh40k-system="dh2"`.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/reinforcement-call.hbs?raw';
import { randomId, seedRandom } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { buildReinforcementCallView, type ReinforcementCallChoices, type ReinforcementTerms } from './reinforcement-call-view.ts';

initializeStoryHandlebars();

const rng = seedRandom(0x77);
const IBNAD = randomId('pc', rng);
const MAGNUS = randomId('pc', rng);
const GUS = randomId('pc', rng);
// Magnus has Forbidden Lore (Daemonology) at Trained (rank 2); Ibnad only Known.
const WARBAND = [
    { id: IBNAD, name: 'Ibnad', influence: 55, skillRank: 1 },
    { id: MAGNUS, name: 'Magnus', influence: 52, skillRank: 2 },
    { id: GUS, name: 'Gus', influence: 20, skillRank: 0 },
];

// Sister of Battle Canoness.
const CANONESS: ReinforcementTerms = {
    influenceMinimum: 50,
    influenceCost: 5,
    peerDiscount: { peer: 'Adepta Sororitas', amount: '2' },
    caller: { skill: '', specialization: '', rank: null, corruption: '' },
};

// Thrice-Bound Daemonhost.
const DAEMONHOST: ReinforcementTerms = {
    influenceMinimum: 50,
    influenceCost: 5,
    peerDiscount: { peer: '', amount: '' },
    caller: { skill: 'forbiddenLore', specialization: 'Daemonology', rank: 2, corruption: '1d5' },
};

interface Args {
    rcName: string;
    terms: ReinforcementTerms;
    choices: ReinforcementCallChoices;
    peerApplied: boolean;
}

function render(args: Args): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg reinforcement-call-dialog';
    root.dataset['wh40kSystem'] = 'dh2';
    root.append(
        renderSheet(templateSrc, {
            rcName: args.rcName,
            view: buildReinforcementCallView(args.terms, WARBAND, args.choices, args.terms.caller.skill === '' ? '' : 'Forbidden Lore'),
            peerFormula: false,
            peerApplied: args.peerApplied,
        }),
    );
    return root;
}

const meta = {
    title: 'Dialogs/ReinforcementCallDialog',
    render,
    args: {
        rcName: 'Sister of Battle Canoness',
        terms: CANONESS,
        choices: { callerId: IBNAD, contributions: { [MAGNUS]: 1 }, peerDiscount: 2, gmAdjustment: 0 },
        peerApplied: true,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const ReadyToCall: Story = {
    play: async ({ canvasElement }) => {
        // 5 − 2 (Peer) = 3; Magnus puts in 1, Ibnad spends 2.
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-final-cost"]')?.textContent).toBe('3');
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-caller-pays"]')?.textContent).toBe('2');
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="callerId"]')?.value).toBe(IBNAD);
        // The caller gets no contribution row.
        await expect(canvasElement.querySelectorAll('[data-wh40k-hook="rc-contribution"]')).toHaveLength(2);
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="peerApplied"]')?.checked).toBe(true);
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]')?.disabled).toBe(false);
    },
};

export const OverContributionCap: Story = {
    args: { choices: { callerId: IBNAD, contributions: { [MAGNUS]: 2, [GUS]: 2 }, peerDiscount: 0, gmAdjustment: 0 }, peerApplied: false },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-problem"]')?.textContent).toContain('at most half the cost');
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]')?.disabled).toBe(true);
    },
};

export const CallerBelowMinimum: Story = {
    args: { choices: { callerId: GUS, contributions: {}, peerDiscount: 0, gmAdjustment: 0 }, peerApplied: false },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-problem"]')?.textContent).toContain('below the Influence Minimum');
    },
};

/** Ibnad has the Influence but only Known Forbidden Lore (Daemonology): the Daemonhost refuses him. */
export const DaemonhostCallerLacksSkill: Story = {
    args: {
        rcName: 'Thrice-Bound Daemonhost',
        terms: DAEMONHOST,
        choices: { callerId: IBNAD, contributions: {}, peerDiscount: 0, gmAdjustment: 0 },
        peerApplied: false,
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-caller-skill"]')?.textContent).toContain('Forbidden Lore (Daemonology) at Trained');
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-caller-corruption"]')?.textContent).toContain('1d5 Corruption');
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-problem"]')?.textContent).toContain('does not have the skill');
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]')?.disabled).toBe(true);
        // No Peer discount is printed, so no Peer checkbox.
        await expect(canvasElement.querySelector('input[name="peerApplied"]')).toBeNull();
    },
};

/** Magnus has Forbidden Lore (Daemonology) at Trained: the call can go ahead. */
export const DaemonhostCallerTrained: Story = {
    args: {
        rcName: 'Thrice-Bound Daemonhost',
        terms: DAEMONHOST,
        choices: { callerId: MAGNUS, contributions: {}, peerDiscount: 0, gmAdjustment: 0 },
        peerApplied: false,
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-wh40k-hook="rc-problem"]')).toBeNull();
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="callReinforcement"]')?.disabled).toBe(false);
    },
};
