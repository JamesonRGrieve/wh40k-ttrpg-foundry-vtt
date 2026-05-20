/**
 * Storybook story for the Deathwatch Squad Mode / Solo Mode transition
 * chat card (#163). One story per direction (Solo → Squad, Squad →
 * Solo) so the visual treatment of both transitions surfaces in
 * review.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { getSupportRange, type DwMode } from '../../module/rules/dw-squad-mode';
import type { RenownRank } from '../../module/rules/dw-renown';
import chatSrc from './dw-mode-chat.hbs?raw';

initializeStoryHandlebars();

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

const chatTpl = Handlebars.compile(chatSrc);

function renderChat(ctx: DwModeChatCtx): HTMLElement {
    return renderTemplate(chatTpl, ctx);
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
