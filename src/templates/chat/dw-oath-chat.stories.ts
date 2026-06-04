/**
 * Storybook stories for the DW Mission Oath chat card (#168). Covers
 * the two chat-card outcomes the runtime emits:
 *
 *   1. Sworn    — Oath sworn, buff + granted Squad-Mode abilities listed.
 *   2. Released — Oath released, no buff/abilities (bookkeeping card).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './dw-oath-chat.hbs?raw';

initializeStoryHandlebars();

interface OathBuffCtx {
    id: string;
    characteristic?: string;
    modifier?: number;
    trait?: string;
    description?: string;
}

interface OathChatCtx {
    gameSystem: 'dw';
    eventKind: 'sworn' | 'released';
    headerKey: string;
    outcomeKey: string;
    oathLabel: string | null;
    buff: OathBuffCtx | null;
    grantedSquadAbilities: string[];
    showGrantedEmpty: boolean;
}

function renderCard(ctx: OathChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<OathChatCtx> = {
    title: 'Chat/DwOathChat',
};
export default meta;
type Story = StoryObj<OathChatCtx>;

export const Sworn: Story = {
    name: 'Mission Oath — sworn with buff + granted abilities',
    args: {
        gameSystem: 'dw',
        eventKind: 'sworn',
        headerKey: 'WH40K.DW.Oath.Label',
        outcomeKey: 'WH40K.DW.Oath.Sworn',
        oathLabel: 'Oath of Glory',
        buff: {
            id: 'Compendium.wh40k-rpg.dw-oath-buffs.Item.glory',
            characteristic: 'weaponSkill',
            modifier: 10,
            description: 'Re-roll failed Weapon Skill tests while in support range of the leader.',
        },
        grantedSquadAbilities: ['Furious Charge', 'Heroic Last Stand'],
        showGrantedEmpty: false,
    },
    render: (args) => renderCard(args),
};

export const Released: Story = {
    name: 'Mission Oath — released (bookkeeping)',
    args: {
        gameSystem: 'dw',
        eventKind: 'released',
        headerKey: 'WH40K.DW.Oath.Label',
        outcomeKey: 'WH40K.DW.Oath.Released',
        oathLabel: 'Oath of Glory',
        buff: null,
        grantedSquadAbilities: [],
        showGrantedEmpty: false,
    },
    render: (args) => renderCard(args),
};
