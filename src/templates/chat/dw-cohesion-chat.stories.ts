/**
 * Storybook stories for the DW Kill-team Cohesion chat card (#162).
 * Covers the three chat-card outcomes the runtime emits:
 *
 *   1. ChallengeSuccess — rolled ≤ current Cohesion.
 *   2. ChallengeFailure — rolled > current Cohesion (fragments).
 *   3. Recovered       — objective-completion recovery (+1).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import { renderTemplate as renderMockTemplate } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import cardSrc from './dw-cohesion-chat.hbs?raw';

initializeStoryHandlebars();

interface CohesionChatCtx {
    gameSystem: 'dw';
    headerKey: string;
    outcomeKey: string;
    rolled: number | null;
    cohesionBefore: number;
    cohesionAfter: number;
    cohesionMax: number;
    sourceKey: string | null;
}

const cardTpl = HandlebarsLib.compile(cardSrc);

function renderCard(ctx: CohesionChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'dw';
    wrapper.appendChild(renderMockTemplate(cardTpl, ctx));
    return wrapper;
}

const meta: Meta<CohesionChatCtx> = {
    title: 'Chat/DwCohesionChat',
};
export default meta;
type Story = StoryObj<CohesionChatCtx>;

export const ChallengeSuccess: Story = {
    name: 'Cohesion Challenge — success (rolled ≤ current)',
    args: {
        gameSystem: 'dw',
        headerKey: 'WH40K.DW.Cohesion.Challenge.Title',
        outcomeKey: 'WH40K.DW.Cohesion.Challenge.Success',
        rolled: 3,
        cohesionBefore: 5,
        cohesionAfter: 5,
        cohesionMax: 6,
        sourceKey: null,
    },
    render: (args) => renderCard(args),
};

export const ChallengeFailure: Story = {
    name: 'Cohesion Challenge — failure (rolled > current)',
    args: {
        gameSystem: 'dw',
        headerKey: 'WH40K.DW.Cohesion.Challenge.Title',
        outcomeKey: 'WH40K.DW.Cohesion.Challenge.Failure',
        rolled: 9,
        cohesionBefore: 3,
        cohesionAfter: 3,
        cohesionMax: 6,
        sourceKey: null,
    },
    render: (args) => renderCard(args),
};

export const Recovered: Story = {
    name: 'Cohesion Recovered — objective completion (+1)',
    args: {
        gameSystem: 'dw',
        headerKey: 'WH40K.DW.Cohesion.Recovered',
        outcomeKey: 'WH40K.DW.Cohesion.Recovered',
        rolled: null,
        cohesionBefore: 3,
        cohesionAfter: 4,
        cohesionMax: 6,
        sourceKey: 'WH40K.DW.Cohesion.Source.Objective',
    },
    render: (args) => renderCard(args),
};
