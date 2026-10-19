/**
 * Storybook stories for the Only War Orders panel (#152, #153; OW Core pp. 269–271).
 * Each context is built by `orderPanelRows` — the builder the character sheet
 * uses — over Only War's printed Orders and rules from its line config:
 *
 *   1. InCohesion        — a fresh Turn: every Order but none blocked.
 *   2. OutOfCohesion     — the Comrade cannot follow; Ranged Volley and Close
 *                          Quarters are carried out but grant nothing.
 *   3. ActionsSpent      — the Comrade has used its two Half Actions: nothing.
 *   4. WoundedCannotRun  — a wounded Comrade cannot Run.
 *   5. Pinned            — a pinned Comrade takes no Actions.
 *   6. WithSweeping      — a Sergeant's Sweeping Order broadcasting to four members.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { localizeKey } from '../../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import { type OrderPanelRow, orderPanelRows } from '../../../module/actions/ow-orders-actions';
import { comradeOrdersFor, comradeRulesFor } from '../../../module/config/game-systems/index';
import type { ComradeRecord, ComradeRules } from '../../../module/rules/ow-comrade';
import panelSrc from './ow-orders-panel.hbs?raw';

initializeStoryHandlebars();

interface SweepingOrderCtx {
    orderId: string;
    nameKey: string;
    effectKey: string | null;
    appliedCount: number;
}

interface OrdersPanelCtx {
    ordersPanel: {
        available: OrderPanelRow[];
        sweepingActive: SweepingOrderCtx[];
    };
}

const RULES: ComradeRules = comradeRulesFor('ow') ?? { cohesionRangeM: 5, actionBudget: 2, mentalDeathThreshold: 10 };
const NOW = { combatId: 'story-combat', round: 1 };

function rows(over: Partial<ComradeRecord> = {}, now: typeof NOW | null = NOW): OrderPanelRow[] {
    const comrade: ComradeRecord = {
        name: 'Comrade Voss',
        state: 'unharmed',
        distanceM: 2,
        hasVisualLine: true,
        fleeing: false,
        pinned: false,
        fearImmune: false,
        pinningImmune: false,
        turn: { combatId: '', round: 0, halvesSpent: 0 },
        mental: { combatId: '', round: 0, insanity: 0, corruption: 0 },
        ...over,
    };
    return orderPanelRows(comradeOrdersFor('ow'), comrade, RULES, now);
}

function renderPanel(ctx: OrdersPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

/** The Order ids with an Issue button. */
function issuable(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll<HTMLButtonElement>('button[data-action="owIssueOrder"]'), (b) => b.dataset['orderId'] ?? '');
}

function row(root: HTMLElement, id: string): Element | null {
    return root.querySelector(`li[data-order-id="${id}"]`);
}

const meta: Meta<OrdersPanelCtx> = {
    title: 'Actor/Character/OwOrdersPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<OrdersPanelCtx>;

const ALL_IDS = ['follow', 'disengage', 'move-half', 'move-full', 'run', 'stand-mount', 'tactical-advance', 'ranged-volley', 'close-quarters', 'take-cover'];

export const InCohesion: Story = {
    name: 'In Cohesion — a fresh Turn, every Order available',
    args: { ordersPanel: { available: rows(), sweepingActive: [] } },
    play: async ({ canvasElement }) => {
        await expect(issuable(canvasElement)).toEqual(ALL_IDS);
        await expect(canvasElement.querySelector('[data-order-no-benefit]')).toBeNull();
        await expect(row(canvasElement, 'ranged-volley')?.textContent).toContain(localizeKey('WH40K.OW.Orders.Effect.RangedVolley'));
        await expect(row(canvasElement, 'take-cover')?.getAttribute('data-action-cost')).toBe('full');
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLButtonElement>('button[data-order-id="ranged-volley"]')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['owIssueOrder']);
    },
};

export const OutOfCohesion: Story = {
    name: 'Out of Cohesion — no following; volley and close quarters grant nothing',
    args: { ordersPanel: { available: rows({ distanceM: 9 }), sweepingActive: [] } },
    play: async ({ canvasElement }) => {
        await expect(issuable(canvasElement)).not.toContain('follow');
        await expect(row(canvasElement, 'follow')?.querySelector('[data-order-block]')?.textContent).toContain(
            localizeKey('WH40K.OW.Orders.Block.NeedsCohesion'),
        );
        await expect(row(canvasElement, 'ranged-volley')?.querySelector('[data-order-no-benefit]')).not.toBeNull();
        await expect(row(canvasElement, 'close-quarters')?.querySelector('[data-order-no-benefit]')).not.toBeNull();
        await expect(row(canvasElement, 'take-cover')?.querySelector('[data-order-no-benefit]')).toBeNull();
        await expect(issuable(canvasElement)).toContain('move-half');
    },
};

export const ActionsSpent: Story = {
    name: 'Actions spent — every Order has no effect',
    args: { ordersPanel: { available: rows({ turn: { combatId: NOW.combatId, round: NOW.round, halvesSpent: 2 } }), sweepingActive: [] } },
    play: async ({ canvasElement }) => {
        await expect(issuable(canvasElement)).toEqual([]);
        await expect(canvasElement.querySelectorAll('[data-order-block]').length).toBe(ALL_IDS.length);
    },
};

export const WoundedCannotRun: Story = {
    name: 'Wounded — cannot Run',
    args: { ordersPanel: { available: rows({ state: 'wounded' }), sweepingActive: [] } },
    play: async ({ canvasElement }) => {
        await expect(issuable(canvasElement)).not.toContain('run');
        await expect(issuable(canvasElement)).toContain('move-full');
    },
};

export const Pinned: Story = {
    name: 'Pinned — no Actions until a recovery Order',
    args: { ordersPanel: { available: rows({ pinned: true }), sweepingActive: [] } },
    play: async ({ canvasElement }) => {
        await expect(issuable(canvasElement)).toEqual([]);
        await expect(row(canvasElement, 'move-half')?.textContent).toContain(localizeKey('WH40K.OW.Orders.Block.Pinned'));
    },
};

export const OutOfCombat: Story = {
    name: 'Out of combat — Orders are given on your Turn',
    args: { ordersPanel: { available: rows({}, null), sweepingActive: [] } },
    play: async ({ canvasElement }) => {
        await expect(issuable(canvasElement)).toEqual([]);
        await expect(row(canvasElement, 'ranged-volley')?.textContent).toContain(localizeKey('WH40K.OW.Orders.Block.NotInCombat'));
    },
};

export const WithSweeping: Story = {
    name: 'Sergeant with active Sweeping Order broadcasting to four members',
    args: {
        ordersPanel: {
            available: rows(),
            sweepingActive: [
                {
                    orderId: 'sgt-ranged-discipline',
                    nameKey: 'WH40K.OW.Orders.Generic.RangedVolley',
                    effectKey: 'WH40K.OW.Orders.Effect.RangedVolley',
                    appliedCount: 4,
                },
            ],
        },
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.OW.Orders.Sweeping.Header'));
    },
};
