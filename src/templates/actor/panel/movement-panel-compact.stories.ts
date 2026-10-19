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
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
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
    // Picking a mode sends setMovementMode with that mode; the sheet writes it and redraws this cluster (#235).
    play: async ({ canvasElement }) => {
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-movement-type="run"]')?.click();
        await expect(clicks.map((c) => [c.action, c.dataset['movementType']])).toEqual([['setMovementMode', 'run']]);
    },
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

/** Panel widths from a cramped column up to the panel's usual width. */
const NARROW_WIDTHS_PX = [180, 220, 280] as const;

/**
 * The selected mode's check sits inside its row at every width (#617): the label and
 * distance column shrinks first, so the check is never pushed past the row's clipped
 * edge. A three-digit Run distance is the widest the row has to hold.
 */
export const RunSelectedCheckFitsNarrowWidths: Story = {
    name: 'Run selected — the check fits at narrow widths',
    render: () => {
        const root = document.createElement('div');
        for (const width of NARROW_WIDTHS_PX) {
            const panel = renderPanel({
                system: { movement: { ...RATES, run: 120 }, lifting: LIFTING },
                combatMovement: { inCombat: true, disabled: false, selectedMode: 'run', remaining: 120 },
            });
            panel.style.maxWidth = `${width}px`;
            root.append(panel);
        }
        return root;
    },
    play: async ({ canvasElement }) => {
        const checks = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-move-mode-selected]'));
        await expect(checks.length).toBe(NARROW_WIDTHS_PX.length);
        const clipped = checks.filter((check) => {
            const row = check.closest('[aria-pressed]')?.getBoundingClientRect();
            const box = check.getBoundingClientRect();
            return row === undefined || box.left < row.left - 1 || box.right > row.right + 1;
        });
        await expect(clipped.length).toBe(0);
        await expect(pressedModes(canvasElement)).toEqual(['run', 'run', 'run']);
    },
};

/** DH2 and RT side by side: DH2 frames the panel header in old gold, RT in void blue. */
export const PaletteDH2VersusRT: Story = {
    name: 'DH2 vs RT palette — the header frame is gold on DH2, void on RT',
    args: { system: { movement: RATES, lifting: LIFTING } },
    render: (args) => {
        const host = document.createElement('div');
        host.className = 'tw-flex tw-flex-col tw-gap-3';
        host.append(renderPanel({ ...args, _system: 'dh2' }), renderPanel({ ...args, _system: 'rt' }));
        return host;
    },
    play: async ({ canvasElement }) => {
        // The two line roots (the panel itself also stamps its line on inner elements).
        const roots = Array.from(canvasElement.querySelectorAll<HTMLElement>('.wh40k-rpg[data-wh40k-system]')).filter(
            (root) => root.parentElement?.closest('[data-wh40k-system]') == null,
        );
        await expect(roots.map((root) => root.dataset['wh40kSystem'])).toEqual(['dh2', 'rt']);
        // The panel header carries both lines' frame variants; each line's own resolves on its root.
        const header = canvasElement.querySelector('[data-wh40k-system="rt"] [class*="rt:tw-border-b-"]');
        await expect(header?.className).toContain('rt:tw-border-b-void-l20');
        await expect(header?.className).toContain('dh2:tw-border-b-gold-raw');
    },
};
