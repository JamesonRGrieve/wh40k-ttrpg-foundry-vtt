import { afterEach, describe, expect, it, vi } from 'vitest';
import { DH2_ACQUISITION_LADDER } from '../config/game-systems/dh2-config.ts';
import {
    buildArmouryCardContext,
    gateArmouryTrade,
    hasInfiniteStock,
    type ItemPilesTradeEntry,
    readRequesterState,
    requestedItemFrom,
    type RequisitionableItem,
    resolveArmouryRequisition,
    standingUpdate,
} from './armoury-requisition.ts';

/**
 * The Inquisition Armoury requisition gate (#496): every item drawn from the
 * armoury merchant is planned by `requisition-transfer`, rolled where the line
 * is a test economy, and the Item Piles trade is cancelled unless every line
 * transfers.
 */

function item(overrides: Partial<RequisitionableItem['system']> = {}, name = 'Hellgun'): RequisitionableItem {
    return { name, system: { availability: 'rare', craftsmanship: 'common', quantity: 1, ...overrides } };
}

function entry(requested: RequisitionableItem, quantity = 1): ItemPilesTradeEntry {
    return { type: 'item', quantity, item: requested };
}

const SPEAKER = { scene: null, actor: null, token: null, alias: 'Acolyte' };
const speaker = (): typeof SPEAKER => SPEAKER;

const ARMOURY = { flags: { 'wh40k-rpg': { inquisitionArmoury: true }, 'item-piles': { data: { infiniteQuantity: true } } } };

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('readRequesterState', () => {
    it('reads each economy off its own schema field', () => {
        const system = { influence: 45, infamy: 30, logisticsRating: 25, requisition: 12, renown: 22, rogueTrader: { profitFactor: { current: 40 } } };
        expect(readRequesterState(system, 'influence')).toEqual({ rating: 45 });
        expect(readRequesterState(system, 'infamy')).toEqual({ rating: 30 });
        expect(readRequesterState(system, 'logistics')).toEqual({ rating: 25 });
        expect(readRequesterState(system, 'requisition-points')).toEqual({ rating: 0, pool: 12, renown: 22 });
        expect(readRequesterState(system, 'profit-factor')).toEqual({ rating: 0, pool: 40 });
        expect(readRequesterState(system, 'none')).toEqual({ rating: 0 });
    });
});

describe('requestedItemFrom', () => {
    it('normalises the stored availability and keeps a known craftsmanship', () => {
        expect(requestedItemFrom(item({ availability: 'very-rare', craftsmanship: 'best' }), 'influence')).toEqual({
            availability: 'veryRare',
            craftsmanship: 'best',
            bound: false,
            cost: undefined,
            renownRequired: undefined,
        });
    });

    it('returns null for an availability the requisition test cannot price', () => {
        expect(requestedItemFrom(item({ availability: 'uncommon' }), 'influence')).toBeNull();
    });

    it('drops an Astartes-grade craftsmanship the test table does not carry', () => {
        expect(requestedItemFrom(item({ craftsmanship: 'master' }), 'influence')?.craftsmanship).toBeUndefined();
    });

    it('prices a Deathwatch line in Requisition and gates it on the Renown rank minimum', () => {
        const dw = requestedItemFrom(item({ renown: 'distinguished', cost: { dw: { requisition: 15 } } }), 'requisition-points');
        expect(dw?.cost).toBe(15);
        expect(dw?.renownRequired).toBe(40);
    });

    it('prices a Rogue Trader line in Profit Factor', () => {
        expect(requestedItemFrom(item({ cost: { rt: { profitFactor: 3 } } }), 'profit-factor')?.cost).toBe(3);
    });
});

describe('resolveArmouryRequisition', () => {
    it('grants a line whose Influence test passes, without touching standing', () => {
        const outcome = resolveArmouryRequisition({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 50 },
            entries: [entry(item({ availability: 'common' }))],
            infiniteStock: true,
            rollD100: () => 20,
        });
        expect(outcome.allowed).toBe(true);
        // DH2 Common is Ordinary (+10): 50 + 10 = 60.
        expect(outcome.attempts[0]).toMatchObject({ outcome: 'granted', target: 60, roll: 20 });
        expect(standingUpdate(outcome)).toBeNull();
    });

    it('grants a rating the ladder prints "Automatic" without rolling', () => {
        const rollD100 = vi.fn(() => 100);
        const outcome = resolveArmouryRequisition({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 5 },
            entries: [entry(item({ availability: 'ubiquitous' }))],
            infiniteStock: true,
            rollD100,
        });
        expect(outcome.allowed).toBe(true);
        expect(outcome.attempts[0]?.outcome).toBe('granted');
        expect(rollD100).not.toHaveBeenCalled();
    });

    it('denies a failed test and drops Influence on a 3+ DoF failure', () => {
        const outcome = resolveArmouryRequisition({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 40 },
            entries: [entry(item({ availability: 'rare' }))],
            infiniteStock: true,
            rollD100: () => 95,
        });
        expect(outcome.allowed).toBe(false);
        expect(outcome.attempts[0]).toMatchObject({ outcome: 'denied', target: 20, roll: 95 });
        expect(standingUpdate(outcome)).toEqual({ 'system.influence': 39 });
    });

    it('refuses a bound item without rolling', () => {
        const rollD100 = vi.fn(() => 1);
        const outcome = resolveArmouryRequisition({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 90 },
            entries: [entry(item({ bound: true }))],
            infiniteStock: true,
            rollD100,
        });
        expect(outcome.allowed).toBe(false);
        expect(outcome.attempts[0]?.refusal).toEqual({ key: 'WH40K.Requisition.Refusal.Bound' });
        expect(rollD100).not.toHaveBeenCalled();
    });

    it('refuses an unrated line by name', () => {
        const outcome = resolveArmouryRequisition({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 90 },
            entries: [entry(item({ availability: 'uncommon' }, 'Relic Blade'))],
            infiniteStock: true,
            rollD100: () => 1,
        });
        expect(outcome.attempts[0]?.refusal).toEqual({ key: 'WH40K.Requisition.Refusal.Unrated', data: { item: 'Relic Blade' } });
    });

    it('refuses more than a finite armoury holds', () => {
        const outcome = resolveArmouryRequisition({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 90 },
            entries: [entry(item({ quantity: 1 }), 3)],
            infiniteStock: false,
            rollD100: () => 1,
        });
        expect(outcome.attempts[0]?.refusal).toEqual({ key: 'WH40K.Requisition.Refusal.Stock', data: { stock: 1, taken: 3 } });
    });

    it('spends a Deathwatch Requisition pool line by line and stops at the first refusal', () => {
        const outcome = resolveArmouryRequisition({
            economy: 'requisition-points',
            ladder: null,
            requester: { rating: 0, pool: 20, renown: 10 },
            entries: [entry(item({ cost: { dw: { requisition: 15 } } }, 'Bolter')), entry(item({ cost: { dw: { requisition: 15 } } }, 'Second Bolter'))],
            infiniteStock: true,
            rollD100: () => 1,
        });
        expect(outcome.attempts.map((a) => a.outcome)).toEqual(['granted', 'refused']);
        expect(outcome.attempts[1]?.refusal).toEqual({ key: 'WH40K.Requisition.Refusal.Pool', data: { cost: 15, pool: 5 } });
        expect(outcome.allowed).toBe(false);
        expect(standingUpdate(outcome)).toEqual({ 'system.requisition': 5 });
    });

    it('ignores currency/attribute lines of the trade', () => {
        const outcome = resolveArmouryRequisition({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 50 },
            entries: [{ type: 'attribute', quantity: 5 }],
            infiniteStock: true,
            rollD100: () => 1,
        });
        expect(outcome.attempts).toEqual([]);
        expect(outcome.allowed).toBe(true);
    });
});

describe('hasInfiniteStock', () => {
    it("reads Item Piles' merchant infiniteQuantity flag", () => {
        expect(hasInfiniteStock(ARMOURY)).toBe(true);
        expect(hasInfiniteStock({ flags: { 'item-piles': { data: { infiniteQuantity: false } } } })).toBe(false);
        expect(hasInfiniteStock({})).toBe(false);
    });
});

function stubI18n(): void {
    vi.stubGlobal('game', {
        i18n: {
            localize: (key: string) => key,
            format: (key: string, data: Record<string, string>) => `${key}:${JSON.stringify(data)}`,
        },
    });
}

describe('buildArmouryCardContext — roll transparency', () => {
    it('prints the rating as the base and one hoverable provenance row per modifier', () => {
        stubI18n();
        const outcome = resolveArmouryRequisition({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 40 },
            entries: [entry(item({ availability: 'rare', craftsmanship: 'good' }))],
            infiniteStock: true,
            rollD100: () => 30,
        });
        const ctx = buildArmouryCardContext(outcome, 'dh2');
        const attempt = ctx.attempts.at(0);
        expect(attempt?.baseLabel).toBe('WH40K.Requisition.Economy.influence');
        expect(attempt?.baseTarget).toBe(40);
        // DH2: Rare −20, Good −20 (core Tables 5-1 / 5-2).
        expect(attempt?.modifierSources.map((r) => r.value)).toEqual([-20, -20]);
        const availabilityRow = attempt?.modifierSources.at(0);
        expect(availabilityRow?.label).toContain('WH40K.Requisition.Source.Availability');
        const tooltip = JSON.parse(availabilityRow?.tooltipData ?? '{}') as { sources: { value: number }[] };
        expect(tooltip.sources.at(0)?.value).toBe(-20);
        expect(attempt?.target).toBe(0);
        expect(ctx.gameSystem).toBe('dh2');
    });

    it('reports a refusal through the langpack, never hard-coded English', () => {
        stubI18n();
        const outcome = resolveArmouryRequisition({
            economy: 'none',
            ladder: null,
            requester: { rating: 0 },
            entries: [entry(item())],
            infiniteStock: true,
            rollD100: () => 1,
        });
        expect(buildArmouryCardContext(outcome, 'im').attempts[0]?.refusalText).toBe('WH40K.Requisition.Refusal.NoEconomy');
    });
});

describe('gateArmouryTrade — the Item Piles hook', () => {
    function stubFoundry(total: number): { create: ReturnType<typeof vi.fn> } {
        stubI18n();
        const create = vi.fn().mockResolvedValue({});
        class RollStub {
            total = total;
            evaluateSync(): this {
                return this;
            }
        }
        vi.stubGlobal('Roll', RollStub);
        vi.stubGlobal('ChatMessage', { create });
        vi.stubGlobal('foundry', { applications: { handlebars: { renderTemplate: vi.fn().mockResolvedValue('<div></div>') } } });
        return { create };
    }

    it('leaves every non-armoury trade alone', () => {
        stubFoundry(1);
        const buyer = { system: { gameSystem: 'dh2', influence: 0 }, update: vi.fn() };
        expect(gateArmouryTrade({ flags: {} }, buyer, { buyerReceive: [entry(item())] }, 'u1', speaker)).toBeUndefined();
        expect(buyer.update).not.toHaveBeenCalled();
    });

    it('cancels the trade when the Influence test fails, and writes the Influence loss', async () => {
        const { create } = stubFoundry(99);
        const buyer = { system: { gameSystem: 'dh2', influence: 40 }, update: vi.fn().mockResolvedValue({}) };
        expect(gateArmouryTrade(ARMOURY, buyer, { buyerReceive: [entry(item())] }, 'u1', speaker)).toBe(false);
        await vi.waitFor(() => {
            expect(create).toHaveBeenCalledTimes(1);
        });
        expect(buyer.update).toHaveBeenCalledWith({ 'system.influence': 39 });
    });

    it('lets the trade through when the test passes', async () => {
        const { create } = stubFoundry(5);
        const buyer = { system: { gameSystem: 'dh2', influence: 60 }, update: vi.fn().mockResolvedValue({}) };
        expect(gateArmouryTrade(ARMOURY, buyer, { buyerReceive: [entry(item())] }, 'u1', speaker)).toBeUndefined();
        await vi.waitFor(() => {
            expect(create).toHaveBeenCalledTimes(1);
        });
        expect(buyer.update).not.toHaveBeenCalled();
    });
});
