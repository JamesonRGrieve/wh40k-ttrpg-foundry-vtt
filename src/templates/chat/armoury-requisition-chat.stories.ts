/**
 * Armoury Requisition chat card (#496) — the card the Inquisition Armoury gate
 * posts for every Item Piles trade it decides.
 *
 * Contexts are built by the real pure resolver (`resolveArmouryRequisition`) and
 * card builder (`buildArmouryCardContext`), with the langpack resolved from
 * en.json, so a change to the live payload shape surfaces here first. Covers a
 * granted test, a denied DH2 test with its printed Influence loss, a denied OW
 * Logistics Test (Table 6-2 rows, no rating loss), a refusal
 * before any test, a pool-economy (Deathwatch Requisition) spend, and the same
 * granted card framed under every game system.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import type { SystemId } from '../../../stories/mocks/extended';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { renderSheet } from '../../../stories/test-helpers';
import { DH2_ACQUISITION_LADDER } from '../../module/config/game-systems/dh2-config';
import { OW_ACQUISITION_LADDER } from '../../module/config/game-systems/ow-config';
import {
    buildArmouryCardContext,
    type ItemPilesTradeEntry,
    type RequisitionableItem,
    readRequesterState,
    resolveArmouryRequisition,
} from '../../module/integrations/armoury-requisition';
import { resolveDegreesMethod } from '../../module/rolls/roll-helpers';
import type { AcquisitionLadder } from '../../module/rules/acquisition-ladder';
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

/** The ladder each story economy prices against: DH2 for Influence, OW for Logistics; the per-system story only reframes the card. */
function storyLadder(economy: RequisitionEconomy): AcquisitionLadder | null {
    if (economy === 'influence') return DH2_ACQUISITION_LADDER;
    if (economy === 'logistics') return OW_ACQUISITION_LADDER;
    return null;
}

function card(opts: {
    economy: RequisitionEconomy;
    rating?: number;
    pool?: number;
    fellowshipBonus?: number;
    partsRequisitionBonus?: number;
    entries: ItemPilesTradeEntry[];
    roll: number;
    gameSystem: SystemId;
}): HTMLElement {
    const requester =
        opts.economy === 'logistics'
            ? readRequesterState({ logisticsRating: opts.rating ?? 0 }, 'logistics')
            : { rating: opts.rating ?? 0, pool: opts.pool, renown: 30, fellowshipBonus: opts.fellowshipBonus };
    const outcome = resolveArmouryRequisition({
        economy: opts.economy,
        ladder: storyLadder(opts.economy),
        requester,
        entries: opts.entries,
        infiniteStock: true,
        rollD100: () => opts.roll,
        // The card's line decides how degrees are counted (Gen 1: DH1 / DW / RT).
        degreesMethod: resolveDegreesMethod(opts.gameSystem),
        partsRequisitionBonus: opts.partsRequisitionBonus ?? null,
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
    name: 'Denied — DH2 loses the DoF beyond Fellowship bonus',
    // 96 vs 0: 10 DoF, 6 beyond a Fellowship bonus of 4 (core p. 269).
    render: () => card({ economy: 'influence', rating: 40, fellowshipBonus: 4, entries: [HELLGUN], roll: 96, gameSystem: 'dh2' }),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Requisition Denied')).toBeTruthy();
        await expect(scope.getByText('Influence falls from 40 to 34.')).toBeTruthy();
    },
};

export const ModificationParts: Story = {
    name: 'Granted — DH2 weapon-modification parts (+30, p. 162)',
    render: () =>
        card({
            economy: 'influence',
            rating: 40,
            partsRequisitionBonus: 30,
            entries: [
                { type: 'item', quantity: 1, item: { name: 'Red-Dot Laser Sight', type: 'weaponModification', system: { availability: 'rare', quantity: 1 } } },
            ],
            roll: 45,
            gameSystem: 'dh2',
        }),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Requisition Granted')).toBeTruthy();
        await expect(scope.getByText('Modification parts, to fit personally')).toBeTruthy();
        // Availability (Rare) and the parts row, each hoverable.
        await expect(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]').length).toBe(2);
    },
};

export const LogisticsDeniedNoLoss: Story = {
    name: 'Denied — OW Logistics Test, Table 6-2 rows, no rating lost',
    render: () => card({ economy: 'logistics', rating: 30, entries: [HELLGUN], roll: 100, gameSystem: 'ow' }),
    play: async ({ canvasElement }) => {
        const scope = within(canvasElement);
        await expect(scope.getByText('Requisition Denied')).toBeTruthy();
        // The same provenance rows as the Logistics Test card: availability, both time rows, war conditions, craftsmanship.
        await expect(canvasElement.querySelectorAll('[data-wh40k-tooltip="modifier"]').length).toBe(5);
        await expect(scope.getByText('War Conditions')).toBeTruthy();
        // OW prints no Logistics Rating loss on a failure.
        await expect(scope.queryByText(/falls from/)).toBeNull();
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
