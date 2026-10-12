/**
 * Armoury Requisition chat card (#496) — the card the Inquisition Armoury gate
 * posts for every Item Piles trade it decides.
 *
 * Contexts are built by the real pure resolver (`resolveArmouryRequisition`) and
 * card builder (`buildArmouryCardContext`), with the langpack resolved from
 * en.json, so a change to the live payload shape surfaces here first. Covers a
 * granted test, a denied test with the big-failure Influence loss, a refusal
 * before any test, a pool-economy (Deathwatch Requisition) spend, and the same
 * granted card framed under every game system.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import type { SystemId } from '../../../stories/mocks/extended';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { renderSheet } from '../../../stories/test-helpers';
import { DH2_ACQUISITION_LADDER } from '../../module/config/game-systems/dh2-config';
import {
    buildArmouryCardContext,
    type ItemPilesTradeEntry,
    type RequisitionableItem,
    resolveArmouryRequisition,
} from '../../module/integrations/armoury-requisition';
import type { RequisitionEconomy } from '../../module/rules/requisition-rail';
import type { I18nKey } from '../../module/types/i18n-keys';
import cardSrc from './armoury-requisition-chat.hbs?raw';

const meta: Meta = { title: 'Chat / Armoury Requisition (#496)' };
export default meta;
type Story = StoryObj;

/** en.json-backed stand-in for `t()`, substituting `{name}` placeholders. */
function translate(key: I18nKey, data?: Record<string, string | number | boolean>): string {
    let text = localizeKey(key);
    for (const [name, value] of Object.entries(data ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
}

function line(name: string, system: Partial<RequisitionableItem['system']>, quantity = 1): ItemPilesTradeEntry {
    return { type: 'item', quantity, item: { name, system: { availability: 'common', craftsmanship: 'common', quantity: 1, ...system } } };
}

function card(opts: {
    economy: RequisitionEconomy;
    rating?: number;
    pool?: number;
    entries: ItemPilesTradeEntry[];
    roll: number;
    gameSystem: SystemId;
}): HTMLElement {
    const outcome = resolveArmouryRequisition({
        economy: opts.economy,
        // Influence stories price against DH2's ladder; the per-system story only reframes the card.
        ladder: opts.economy === 'influence' ? DH2_ACQUISITION_LADDER : null,
        requester: { rating: opts.rating ?? 0, pool: opts.pool, renown: 30 },
        entries: opts.entries,
        infiniteStock: true,
        rollD100: () => opts.roll,
    });
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.appendChild(renderSheet(cardSrc, buildArmouryCardContext(outcome, opts.gameSystem, translate)));
    return wrapper;
}

const HELLGUN = line('Hellgun', { availability: 'rare', craftsmanship: 'good' });

export const Granted: Story = {
    name: 'Granted — Influence test passes',
    render: () => card({ economy: 'influence', rating: 55, entries: [HELLGUN], roll: 12, gameSystem: 'dh2' }),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Hellgun')).toBeTruthy();
        await expect(scope.getByText('Requisition Granted')).toBeTruthy();
        // Roll transparency: Influence base + one hoverable row per modifier.
        await expect(scope.getByText('Influence')).toBeTruthy();
        const rows = canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]');
        await expect(rows.length).toBe(2);
        await expect(scope.getByText('Availability (Rare)')).toBeTruthy();
        await expect(scope.getByText('Craftsmanship (Good)')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-requisition-outcome="granted"]')).not.toBeNull();
    },
};

export const DeniedWithInfluenceLoss: Story = {
    name: 'Denied — 3+ DoF failure costs Influence',
    render: () => card({ economy: 'influence', rating: 40, entries: [HELLGUN], roll: 96, gameSystem: 'dh2' }),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Requisition Denied')).toBeTruthy();
        await expect(scope.getByText('Influence falls from 40 to 39.')).toBeTruthy();
    },
};

export const RefusedBound: Story = {
    name: 'Refused — bound item, no test rolled',
    render: () => card({ economy: 'influence', rating: 70, entries: [line('Inquisitorial Rosette', { bound: true })], roll: 1, gameSystem: 'dh2' }),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Requisition Refused')).toBeTruthy();
        await expect(scope.getByText('This item is bound and cannot be traded.')).toBeTruthy();
        await expect(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]').length).toBe(0);
    },
};

export const PoolSpend: Story = {
    name: 'Pool — Deathwatch Requisition spent',
    render: () =>
        card({
            economy: 'requisition-points',
            pool: 40,
            entries: [line('Astartes Bolter', { cost: { dw: { requisition: 15 } } })],
            roll: 1,
            gameSystem: 'dw',
        }),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Requisition Granted')).toBeTruthy();
        await expect(scope.getByText('Requisition: 15 spent — 25 remaining.')).toBeTruthy();
    },
};

const SYSTEMS: SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

export const PerSystem: Story = {
    name: 'Per system — granted card framed under each line',
    render: () => {
        const root = document.createElement('div');
        for (const system of SYSTEMS) root.appendChild(card({ economy: 'influence', rating: 55, entries: [HELLGUN], roll: 12, gameSystem: system }));
        return root;
    },
    play: async ({ canvasElement }) => {
        const cards = canvasElement.querySelectorAll<HTMLElement>('.wh40k-armreq-card');
        await expect(cards.length).toBe(SYSTEMS.length);
        await expect(Array.from(cards).map((c) => c.dataset['wh40kSystem'])).toEqual(SYSTEMS);
    },
};
