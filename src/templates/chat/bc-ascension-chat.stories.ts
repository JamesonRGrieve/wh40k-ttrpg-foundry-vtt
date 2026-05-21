/**
 * Storybook stories for the Black Crusade Daemon Prince ascension chat
 * card (#182).
 *
 * Two canonical outcomes the action produces:
 *
 *   1. Tzeentch — patron of change; standard RAW boost.
 *   2. Khorne   — patron of blood; same RAW boost (alignment is preserved
 *                 on the record but does not alter the base mechanical
 *                 package per the resolver).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HBS from 'handlebars';
import { renderTemplate as renderTpl } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { getDaemonPrinceBoost, type DaemonPrinceAlignment, type DaemonPrinceStatBoost } from '../../module/rules/bc-daemon-prince';
import cardSrc from './bc-ascension-chat.hbs?raw';

initializeStoryHandlebars();

interface AscensionChatCtx {
    gameSystem: 'bc';
    ascendedAt: number;
    alignmentAtAscension: DaemonPrinceAlignment;
    boost: DaemonPrinceStatBoost;
}

const cardTpl = HBS.compile(cardSrc);

function renderCard(ctx: AscensionChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderTpl(cardTpl, ctx));
    return wrapper;
}

function buildCtx(args: { ascendedAt: number; alignmentAtAscension: DaemonPrinceAlignment }): AscensionChatCtx {
    return {
        gameSystem: 'bc',
        ascendedAt: args.ascendedAt,
        alignmentAtAscension: args.alignmentAtAscension,
        boost: getDaemonPrinceBoost({ ascendedAt: args.ascendedAt, alignmentAtAscension: args.alignmentAtAscension }),
    };
}

const meta: Meta<AscensionChatCtx> = {
    title: 'Chat/BcAscensionChat',
};
export default meta;
type Story = StoryObj<AscensionChatCtx>;

export const Tzeentch: Story = {
    name: 'Tzeentch — patron of change',
    args: buildCtx({ ascendedAt: 7, alignmentAtAscension: 'tzeentch' }),
    render: (args) => renderCard(args),
};

export const Khorne: Story = {
    name: 'Khorne — patron of blood',
    args: buildCtx({ ascendedAt: 12, alignmentAtAscension: 'khorne' }),
    render: (args) => renderCard(args),
};
