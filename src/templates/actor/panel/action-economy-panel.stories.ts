/**
 * Storybook stories for the per-turn action-economy readout (#264) — the Combat-tab
 * surface. Shows the combatant's remaining Full / Half / Reaction and Free-spent
 * count with click-to-spend buttons (auto-disabled when exhausted) and a reset
 * control. The `actionBudget` context (an ActionBudgetView) drives every state; the
 * sheet computes it from the combatant's action-economy flag. Rendered only while
 * in combat (actionBudget set).
 *
 * Values are fixed for screenshot-diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './action-economy-panel.hbs?raw';

initializeStoryHandlebars();

interface ActionBudgetCtx {
    fullAvailable: boolean;
    halfRemaining: number;
    reactionRemaining: number;
    freeSpent: number;
    usedPoints: number;
}
interface PanelCtx {
    actionBudget?: ActionBudgetCtx | null;
    _system?: string;
}

function renderPanel(ctx: PanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = ctx._system ?? 'dh2';
    wrapper.style.maxWidth = '320px';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const meta: Meta<PanelCtx> = {
    title: 'Actor/Character/ActionEconomyPanel',
};
export default meta;
type Story = StoryObj<PanelCtx>;

export const FreshTurn: Story = {
    name: 'Fresh turn — Full + 2 Half + Reaction available',
    args: { actionBudget: { fullAvailable: true, halfRemaining: 2, reactionRemaining: 1, freeSpent: 0, usedPoints: 0 } },
    render: (args) => renderPanel(args),
};

export const OneHalfSpent: Story = {
    name: 'One Half spent — Full no longer available, 1 Half left',
    args: { actionBudget: { fullAvailable: false, halfRemaining: 1, reactionRemaining: 1, freeSpent: 1, usedPoints: 1 } },
    render: (args) => renderPanel(args),
};

export const Exhausted: Story = {
    name: 'Exhausted — Full/Half/Reaction all spent',
    args: { actionBudget: { fullAvailable: false, halfRemaining: 0, reactionRemaining: 0, freeSpent: 2, usedPoints: 2 } },
    render: (args) => renderPanel(args),
};

export const ImperiumMaledictum: Story = {
    name: 'Per-system (IM) — fresh turn',
    args: { actionBudget: { fullAvailable: true, halfRemaining: 2, reactionRemaining: 1, freeSpent: 0, usedPoints: 0 }, _system: 'im' },
    render: (args) => renderPanel(args),
};
