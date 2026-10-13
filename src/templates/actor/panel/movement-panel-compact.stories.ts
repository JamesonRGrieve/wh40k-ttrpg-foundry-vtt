/**
 * Storybook stories for the combat movement cluster (#235 / #234). This Combat-tab
 * panel is the single in-combat move-mode selector: Half/Full/Charge/Run toggles
 * (`data-action="setMovementMode"`), each showing its distance + action
 * cost, the selected mode highlighted, and the whole cluster greyed/turn-gated when
 * it is not the player's turn. The `combatMovement` context (selectedMode / disabled
 * / remaining / inCombat) drives those states; the sheet computes it from combat
 * state (GM is never greyed — GMs move freely).
 *
 * Values are fixed for screenshot-diff stability (no Math.random).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './movement-panel-compact.hbs?raw';

initializeStoryHandlebars();

interface CombatMovementCtx {
    inCombat: boolean;
    disabled: boolean;
    selectedMode?: string;
    remaining?: number;
}
interface MovementCompactCtx {
    system: {
        movement: { half: number; full: number; charge: number; run: number };
        lifting: { lift: number; push: number };
    };
    combatMovement?: CombatMovementCtx;
    _system?: string;
}

const RATES = { half: 4, full: 8, charge: 12, run: 24 };
const LIFTING = { lift: 90, push: 225 };

function renderPanel(ctx: MovementCompactCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = ctx._system ?? 'dh2';
    wrapper.style.maxWidth = '280px';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const meta: Meta<MovementCompactCtx> = {
    title: 'Actor/Character/MovementPanelCompact',
};
export default meta;
type Story = StoryObj<MovementCompactCtx>;

export const OutOfCombat: Story = {
    name: 'Out of combat — all modes selectable, no turn budget',
    args: { system: { movement: RATES, lifting: LIFTING } },
    render: (args) => renderPanel(args),
};

/** The move-mode toggles shown as selected (`aria-pressed`). */
function pressedModes(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('[aria-pressed="true"]')).map((el) => el.dataset['movementType'] ?? '');
}

export const YourTurnChargeSelected: Story = {
    name: 'Your turn — Charge selected, allowance raised to 12m',
    args: {
        system: { movement: RATES, lifting: LIFTING },
        combatMovement: { inCombat: true, disabled: false, selectedMode: 'charge', remaining: 12 },
    },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        await expect(pressedModes(canvasElement)).toEqual(['charge']);
    },
};

/**
 * The next turn after a Run (#610): the turn end cleared the token's move mode, so
 * no toggle is pressed and every mode is selectable again.
 */
export const NewTurnModeCleared: Story = {
    name: 'New turn — last turn’s mode cleared, nothing selected',
    args: {
        system: { movement: RATES, lifting: LIFTING },
        combatMovement: { inCombat: true, disabled: false, remaining: 8 },
    },
    render: (args) => renderPanel(args),
    play: async ({ canvasElement }) => {
        await expect(pressedModes(canvasElement)).toEqual([]);
        const selectable = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-action="setMovementMode"]')).map((el) => el.dataset['movementType']);
        await expect(selectable).toEqual(['half', 'full', 'charge', 'run']);
    },
};

export const YourTurnBudgetLow: Story = {
    name: 'Your turn — Full move, 3m left this turn',
    args: {
        system: { movement: RATES, lifting: LIFTING },
        combatMovement: { inCombat: true, disabled: false, selectedMode: 'full', remaining: 3 },
    },
    render: (args) => renderPanel(args),
};

export const NotYourTurn: Story = {
    name: 'Not your turn — cluster greyed + turn-gated',
    args: {
        system: { movement: RATES, lifting: LIFTING },
        combatMovement: { inCombat: true, disabled: true, selectedMode: 'full' },
    },
    render: (args) => renderPanel(args),
};

export const RogueTraderYourTurn: Story = {
    name: 'Per-system (RT) — Run selected',
    args: {
        system: { movement: RATES, lifting: LIFTING },
        combatMovement: { inCombat: true, disabled: false, selectedMode: 'run', remaining: 24 },
        _system: 'rt',
    },
    render: (args) => renderPanel(args),
};
