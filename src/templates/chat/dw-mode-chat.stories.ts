/**
 * Storybook story for the Deathwatch Squad Mode / Solo Mode transition
 * chat card (#163). One story per direction (Solo → Squad, Squad →
 * Solo) so the visual treatment of both transitions surfaces in
 * review.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { randomId, seedRandom, type SystemId } from '../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import type { RenownRank } from '../../module/rules/dw-renown';
import { getSupportRange, type DwMode } from '../../module/rules/dw-squad-mode';
import chatSrc from './dw-mode-chat.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xd_3a4_b1c);

interface DwModeChatCtx {
    gameSystem: string;
    actorName: string;
    previousMode: DwMode;
    newMode: DwMode;
    previousModeKey: string;
    newModeKey: string;
    transitionMessageKey: string;
    viaKey: string;
    renownRankKey: string;
    supportRange: { visual: number; vocal: number };
}

function renderChat(ctx: DwModeChatCtx): HTMLElement {
    return renderSheet(chatSrc, ctx);
}

function rankKey(rank: RenownRank): string {
    return rank.charAt(0).toUpperCase() + rank.slice(1);
}

const meta: Meta<DwModeChatCtx> = {
    title: 'Chat/DW Mode Transition (#163)',
};
export default meta;
type Story = StoryObj<DwModeChatCtx>;

export const EnterSquadFullAction: Story = {
    name: 'Solo → Squad (Full Action)',
    args: {
        gameSystem: 'dw',
        actorName: 'Brother Voracius',
        previousMode: 'solo',
        newMode: 'squad',
        previousModeKey: 'WH40K.DW.Mode.Solo',
        newModeKey: 'WH40K.DW.Mode.Squad',
        transitionMessageKey: 'WH40K.DW.Mode.Enter.FullAction',
        viaKey: 'WH40K.DW.Mode.Enter.FullAction',
        renownRankKey: rankKey('respected'),
        supportRange: getSupportRange('respected'),
    },
    render: (args) => renderChat(args),
};

export const LeaveSquad: Story = {
    name: 'Squad → Solo (return to Solo Mode)',
    args: {
        gameSystem: 'dw',
        actorName: 'Brother Voracius',
        previousMode: 'squad',
        newMode: 'solo',
        previousModeKey: 'WH40K.DW.Mode.Squad',
        newModeKey: 'WH40K.DW.Mode.Solo',
        transitionMessageKey: 'WH40K.DW.Mode.Leave',
        viaKey: '',
        renownRankKey: rankKey('respected'),
        supportRange: getSupportRange('respected'),
    },
    render: (args) => renderChat(args),
};

// ── Per-system homologation ──────────────────────────────────────────────────
//
// Squad Mode is a Deathwatch mechanic, but the card's `data-wh40k-system`
// anchor (`{{gameSystem}}`) is what activates the per-system Tailwind variants
// on the frame. Render the SAME Solo → Squad transition under each of the seven
// system ids so the card chrome is proven to cascade correctly for all lines —
// "renders correctly for dw but breaks under the other six" regressions surface
// here. Seeded ids keep the screenshot diff deterministic.

const ALL_SYSTEM_IDS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

function perSystemModeArgs(gameSystem: SystemId): DwModeChatCtx {
    return {
        gameSystem,
        actorName: `Brother ${randomId('voracius', rng)}`,
        previousMode: 'solo',
        newMode: 'squad',
        previousModeKey: 'WH40K.DW.Mode.Solo',
        newModeKey: 'WH40K.DW.Mode.Squad',
        transitionMessageKey: 'WH40K.DW.Mode.Enter.FullAction',
        viaKey: 'WH40K.DW.Mode.Enter.FullAction',
        renownRankKey: rankKey('respected'),
        supportRange: getSupportRange('respected'),
    };
}

export const PerSystemFrames: Story = {
    name: 'Per-system — Solo → Squad card frame across all 7 lines',
    render: () => {
        const container = document.createElement('div');
        container.className = 'tw-flex tw-flex-col tw-gap-3';
        for (const systemId of ALL_SYSTEM_IDS) {
            container.appendChild(renderChat(perSystemModeArgs(systemId)));
        }
        return container;
    },
};
