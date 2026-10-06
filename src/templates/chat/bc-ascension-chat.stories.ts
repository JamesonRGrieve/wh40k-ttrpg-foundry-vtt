/**
 * Storybook stories for the Black Crusade apotheosis chat card (#182 —
 * BC Core p267).
 *
 * The two fates the action records:
 *
 *   1. Tzeentch — Infamy met the GM threshold → Daemon Prince.
 *   2. Khorne   — Infamy fell short → Chaos Spawn.
 *
 * Either way the card states that the champion leaves play; the book prints
 * no stats for either fate.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import { resolveApotheosis, type DaemonPrinceAlignment } from '../../module/rules/bc-daemon-prince';
import cardSrc from './bc-ascension-chat.hbs?raw';

initializeStoryHandlebars();

interface AscensionChatCtx {
    gameSystem: 'bc';
    ascendedAt: number;
    alignmentAtAscension: DaemonPrinceAlignment;
    isDaemonPrince: boolean;
}

function renderCard(ctx: AscensionChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

function buildCtx(args: { ascendedAt: number; alignmentAtAscension: DaemonPrinceAlignment; infamy: number }): AscensionChatCtx {
    const { outcome } = resolveApotheosis({ corruption: 100, infamy: args.infamy, infamyThreshold: 100 });
    return {
        gameSystem: 'bc',
        ascendedAt: args.ascendedAt,
        alignmentAtAscension: args.alignmentAtAscension,
        isDaemonPrince: outcome === 'daemonPrince',
    };
}

const meta: Meta<AscensionChatCtx> = {
    title: 'Chat/BcAscensionChat',
};
export default meta;
type Story = StoryObj<AscensionChatCtx>;

export const Tzeentch: Story = {
    name: 'Tzeentch — Infamy met, Daemon Prince',
    args: buildCtx({ ascendedAt: 7, alignmentAtAscension: 'tzeentch', infamy: 100 }),
    render: (args) => renderCard(args),
};

export const Khorne: Story = {
    name: 'Khorne — Infamy short, Chaos Spawn',
    args: buildCtx({ ascendedAt: 12, alignmentAtAscension: 'khorne', infamy: 60 }),
    render: (args) => renderCard(args),
};
