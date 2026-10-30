/**
 * Storybook stories for the Only War Comrade panel (#152).
 * The states an operator needs to verify in review:
 *
 *   - Unharmed / Wounded / Dead: the state badge, and Wound / Heal / Replace
 *     enabled exactly when they change the state.
 *   - Cohesion broken: past 5 m, or behind a solid barrier.
 *   - Fleeing / Pinned: failed with its PC; the recovery Order is enabled.
 *   - Actions spent: the Comrade's Half Actions left this Turn.
 *
 * Each context is built by `buildComradePanel` — the same rules-layer builder the
 * character sheet passes through, with Only War's printed rules from its line
 * config — so a value the builder leaves out shows here as "undefined" text,
 * which the plays reject.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, clickAction, renderSheet } from '../../../../stories/test-helpers';
import { comradeRulesFor } from '../../../module/config/game-systems/index';
import { buildComradePanel, type ComradePanelView, type ComradeRecord, type ComradeRules } from '../../../module/rules/ow-comrade';
import panelSrc from './ow-comrade-panel.hbs?raw';

initializeStoryHandlebars();

interface ComradePanelCtx {
    comradePanel: ComradePanelView;
}

const RULES: ComradeRules = comradeRulesFor('ow') ?? { cohesionRangeM: 5, actionBudget: 2, mentalDeathThreshold: 10 };
const NOW = { combatId: 'story-combat', round: 1 };

function comrade(over: Partial<ComradeRecord>): ComradeRecord {
    return {
        name: 'Comrade Jaeger',
        state: 'unharmed',
        distanceM: 3,
        hasVisualLine: true,
        fleeing: false,
        pinned: false,
        fearImmune: false,
        pinningImmune: false,
        turn: { combatId: '', round: 0, halvesSpent: 0 },
        mental: { combatId: '', round: 0, insanity: 0, corruption: 0 },
        ...over,
    };
}

function buildContext(over: Partial<ComradeRecord>, inCamp = false): ComradePanelCtx {
    return { comradePanel: buildComradePanel(comrade(over), inCamp, RULES, NOW) };
}

function renderPanel(ctx: ComradePanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

function button(root: HTMLElement, action: string): HTMLButtonElement | null {
    return root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`);
}

/** The enabled state of the Wound / Heal / Replace buttons, in that order. */
function enabled(root: HTMLElement): boolean[] {
    return ['owComradeWound', 'owComradeHeal', 'owComradeReplace'].map((action) => button(root, action)?.disabled === false);
}

function cohesion(root: HTMLElement): string | undefined {
    return root.querySelector<HTMLElement>('[data-cohesion]')?.dataset['cohesion'];
}

async function expectNoUndefined(root: HTMLElement): Promise<void> {
    await expect(root.textContent).not.toContain('undefined');
    await expect(root.querySelector('[data-field="distance-m"]')?.textContent).toContain('5 m');
}

const meta: Meta<ComradePanelCtx> = {
    title: 'Actor/Character/OwComradePanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<ComradePanelCtx>;

export const Unharmed: Story = {
    name: 'Unharmed — green badge, in Cohesion at 3 m, two Half Actions',
    args: buildContext({}),
    play: async ({ canvasElement }) => {
        await expectNoUndefined(canvasElement);
        await expect(cohesion(canvasElement)).toBe('in');
        await expect(enabled(canvasElement)).toEqual([true, false, false]);
        await expect(canvasElement.querySelector<HTMLElement>('[data-comrade-actions-left]')?.dataset['comradeActionsLeft']).toBe('2');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="system.comrade.distanceM"]')?.value).toBe('3');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="system.comrade.hasVisualLine"]')?.checked).toBe(true);
        await expect(button(canvasElement, 'owComradeRecover')?.disabled).toBe(true);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'owComradeWound');
        button(canvasElement, 'owComradeHeal')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeWound']);
    },
};

export const Wounded: Story = {
    name: 'Wounded — yellow badge, in Cohesion, Heal enabled',
    args: buildContext({ state: 'wounded', distanceM: 4 }),
    play: async ({ canvasElement }) => {
        await expectNoUndefined(canvasElement);
        await expect(enabled(canvasElement)).toEqual([true, true, false]);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'owComradeHeal');
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeHeal']);
    },
};

/** Cohesion breaks past 5 m … */
export const CohesionBrokenByDistance: Story = {
    name: 'Out of Cohesion — 8 m away',
    args: buildContext({ distanceM: 8 }),
    play: async ({ canvasElement }) => {
        await expect(cohesion(canvasElement)).toBe('out');
        await expect(canvasElement.querySelector('[data-ow-comrade-cohesion]')?.getAttribute('data-ow-comrade-cohesion')).toBe('out');
    },
};

/** … or when a solid barrier separates them, however close. */
export const CohesionBrokenByBarrier: Story = {
    name: 'Out of Cohesion — behind a solid barrier at 2 m',
    args: buildContext({ distanceM: 2, hasVisualLine: false }),
    play: async ({ canvasElement }) => {
        await expect(cohesion(canvasElement)).toBe('out');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="system.comrade.hasVisualLine"]')?.checked).toBe(false);
    },
};

/** Failed a Pinning test with its PC: pinned until a recovery Order. */
export const Pinned: Story = {
    name: 'Pinned — the recovery Order is enabled',
    args: buildContext({ pinned: true }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-comrade-status="pinned"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-comrade-status="fleeing"]')).toBeNull();
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'owComradeRecover');
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeRecover']);
    },
};

/** Failed a Fear test with its PC: fleeing; immunity is a toggle. */
export const Fleeing: Story = {
    name: 'Fleeing — failed Fear with its PC',
    args: buildContext({ fleeing: true, pinningImmune: true }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-comrade-status="fleeing"]')).not.toBeNull();
        await expect(button(canvasElement, 'owComradeRecover')?.disabled).toBe(false);
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="system.comrade.pinningImmune"]')?.checked).toBe(true);
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="system.comrade.fearImmune"]')?.checked).toBe(false);
    },
};

/** The Comrade has spent its Turn: "two Half Actions or one Full Action". */
export const ActionsSpent: Story = {
    name: 'Actions spent this Turn',
    args: buildContext({ turn: { combatId: NOW.combatId, round: NOW.round, halvesSpent: 2 } }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector<HTMLElement>('[data-comrade-actions-left]')?.dataset['comradeActionsLeft']).toBe('0');
        await expect(canvasElement.querySelector('[data-field="actions-left"]')?.textContent).toContain('0 of 2');
    },
};

/** Insanity and Corruption: the amount and the two buttons. */
export const MentalDamage: Story = {
    name: 'Insanity and Corruption controls',
    args: buildContext({}),
    play: async ({ canvasElement }) => {
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('button[data-action="owComradeMental"][data-mental-kind="corruption"]')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeMental']);
        await expect(canvasElement.querySelector('input[data-comrade-mental-amount]')?.getAttribute('name')).toBeNull();
    },
};

export const DeadInField: Story = {
    name: 'Dead in the field — red badge, nothing enabled, no actions',
    args: buildContext({ state: 'dead', distanceM: 12, hasVisualLine: false }),
    play: async ({ canvasElement }) => {
        await expectNoUndefined(canvasElement);
        await expect(cohesion(canvasElement)).toBe('out');
        await expect(enabled(canvasElement)).toEqual([false, false, false]);
        await expect(canvasElement.querySelector('[data-field="actions-left"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-field="mental"]')).toBeNull();
    },
};

export const Dead: Story = {
    name: 'Dead in camp — Replace enabled',
    args: buildContext({ state: 'dead', distanceM: 12, hasVisualLine: false }, true),
    play: async ({ canvasElement }) => {
        await expectNoUndefined(canvasElement);
        await expect(enabled(canvasElement)).toEqual([false, false, true]);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'owComradeReplace');
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeReplace']);
    },
};
