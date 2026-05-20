/**
 * Storybook stories for the Black Crusade Supplement Mechanics panel (#181).
 *
 * Covers the three canonical UI states an operator needs to verify in
 * review:
 *
 *   1. Inactive    — daemon engine rating 0 (panel hides rage readout),
 *                    Quick & the Dead off (initiative readout hidden).
 *   2. DaemonEngine — rating 3 idle for 2 turns; rage bonus = 3 + 2 = 5.
 *   3. QuickAndTheDead — Khorne-aligned, base initiative 35 → +10 → 45.
 *
 * Story factories use fixed inputs (no Math.random) per the "Seeded RNG
 * in stories" rule in CLAUDE.md — every readout in these stories is the
 * engine's deterministic output for the documented inputs.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import {
    daemonEngineRageBonus,
    QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT,
    quickAndTheDeadInitiativeBonus,
    type QuickAndTheDeadAlignment,
} from '../../../module/rules/bc-supplement-mechanics';
import panelSrc from './bc-supplements-panel.hbs?raw';

initializeStoryHandlebars();

interface SupplementsPanelCtx {
    supplementsPanel: {
        daemonEngineRating: number;
        daemonEngineActive: boolean;
        turnsSinceLastDamage: number;
        daemonEngineRageBonus: number;
        quickAndTheDeadActive: boolean;
        chaosAlignment: QuickAndTheDeadAlignment;
        baseInitiative: number;
        quickAndTheDeadBonus: number;
        quickAndTheDeadInitiative: number;
    };
}

const panelTpl = Handlebars.compile(panelSrc);

function renderPanel(ctx: SupplementsPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'bc';
    wrapper.appendChild(renderTemplate(panelTpl, ctx));
    return wrapper;
}

/** Build a panel context driven by the live resolver — never hand-author the readouts. */
function buildCtx(input: {
    daemonEngineRating: number;
    turnsSinceLastDamage: number;
    quickAndTheDeadActive: boolean;
    chaosAlignment: QuickAndTheDeadAlignment;
    baseInitiative: number;
}): SupplementsPanelCtx {
    const daemonEngineActive = input.daemonEngineRating > 0;
    const rageBonus = daemonEngineActive ? daemonEngineRageBonus({ rating: input.daemonEngineRating, turnsSinceLastDamage: input.turnsSinceLastDamage }) : 0;
    const bonus = QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT[input.chaosAlignment];
    const initiative = quickAndTheDeadInitiativeBonus(input.baseInitiative, input.chaosAlignment);
    return {
        supplementsPanel: {
            daemonEngineRating: input.daemonEngineRating,
            daemonEngineActive,
            turnsSinceLastDamage: input.turnsSinceLastDamage,
            daemonEngineRageBonus: rageBonus,
            quickAndTheDeadActive: input.quickAndTheDeadActive,
            chaosAlignment: input.chaosAlignment,
            baseInitiative: input.baseInitiative,
            quickAndTheDeadBonus: bonus,
            quickAndTheDeadInitiative: initiative,
        },
    };
}

const meta: Meta<SupplementsPanelCtx> = {
    title: 'Actor/Character/BcSupplementsPanel',
};
export default meta;
type Story = StoryObj<SupplementsPanelCtx>;

export const Inactive: Story = {
    name: 'Inactive — no Daemon Engine, Quick & the Dead off',
    args: buildCtx({
        daemonEngineRating: 0,
        turnsSinceLastDamage: 0,
        quickAndTheDeadActive: false,
        chaosAlignment: 'unaligned',
        baseInitiative: 30,
    }),
    render: (args) => renderPanel(args),
};

export const DaemonEngine: Story = {
    name: 'Daemon Engine(3), idle 2 turns — rage bonus +5',
    args: buildCtx({
        daemonEngineRating: 3,
        turnsSinceLastDamage: 2,
        quickAndTheDeadActive: false,
        chaosAlignment: 'unaligned',
        baseInitiative: 30,
    }),
    render: (args) => renderPanel(args),
};

export const QuickAndTheDead: Story = {
    name: 'Quick & the Dead — Khorne, base 35 → +10 → 45',
    args: buildCtx({
        daemonEngineRating: 0,
        turnsSinceLastDamage: 0,
        quickAndTheDeadActive: true,
        chaosAlignment: 'khorne',
        baseInitiative: 35,
    }),
    render: (args) => renderPanel(args),
};
