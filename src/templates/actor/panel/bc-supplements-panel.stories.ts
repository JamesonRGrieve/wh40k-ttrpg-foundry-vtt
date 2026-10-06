/**
 * Storybook stories for the Black Crusade Supplement Mechanics panel (#181).
 *
 * Covers the two canonical UI states an operator needs to verify in
 * review:
 *
 *   1. Inactive     — daemon engine rating 0 (panel hides rage readout).
 *   2. DaemonEngine — rating 3 idle for 2 turns; rage bonus = 3 + 2 = 5.
 *
 * Story factories use fixed inputs (no Math.random) per the "Seeded RNG
 * in stories" rule in CLAUDE.md — every readout in these stories is the
 * engine's deterministic output for the documented inputs.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import { daemonEngineRageBonus } from '../../../module/rules/bc-supplement-mechanics';
import panelSrc from './bc-supplements-panel.hbs?raw';

initializeStoryHandlebars();

interface SupplementsPanelCtx {
    supplementsPanel: {
        daemonEngineRating: number;
        daemonEngineActive: boolean;
        turnsSinceLastDamage: number;
        daemonEngineRageBonus: number;
    };
}

function renderPanel(ctx: SupplementsPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

/** Build a panel context driven by the live resolver — never hand-author the readouts. */
function buildCtx(input: { daemonEngineRating: number; turnsSinceLastDamage: number }): SupplementsPanelCtx {
    const daemonEngineActive = input.daemonEngineRating > 0;
    const rageBonus = daemonEngineActive ? daemonEngineRageBonus({ rating: input.daemonEngineRating, turnsSinceLastDamage: input.turnsSinceLastDamage }) : 0;
    return {
        supplementsPanel: {
            daemonEngineRating: input.daemonEngineRating,
            daemonEngineActive,
            turnsSinceLastDamage: input.turnsSinceLastDamage,
            daemonEngineRageBonus: rageBonus,
        },
    };
}

const meta: Meta<SupplementsPanelCtx> = {
    title: 'Actor/Character/BcSupplementsPanel',
};
export default meta;
type Story = StoryObj<SupplementsPanelCtx>;

export const Inactive: Story = {
    name: 'Inactive — no Daemon Engine',
    args: buildCtx({ daemonEngineRating: 0, turnsSinceLastDamage: 0 }),
    render: (args) => renderPanel(args),
};

export const DaemonEngine: Story = {
    name: 'Daemon Engine(3), idle 2 turns — rage bonus +5',
    args: buildCtx({ daemonEngineRating: 3, turnsSinceLastDamage: 2 }),
    render: (args) => renderPanel(args),
};
