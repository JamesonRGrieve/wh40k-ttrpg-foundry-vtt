/**
 * Unit tests for TransactionManager.prepareQuote — the pricing engine behind
 * the player→NPC trade interface.
 *
 * Covers the enhancements: ruleset/system-aware currency resolution (gelt vs
 * influence, gated by the DH2e economy ruleset), the influence-burn discount,
 * the campaign-relationship disposition modifier, and the GM modifier.
 *
 * The ApplicationV2-based approval dialog is mocked away (it destructures
 * `foundry.applications.api` at module load) so the pure pricing path runs
 * headless.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/module/applications/dialogs/transaction-approval-dialog.ts', () => ({
    default: { show: vi.fn() },
}));

import { EventTracker } from '../src/module/managers/event-tracker';
import { TransactionManager } from '../src/module/transactions/transaction-manager';

interface ActorStub {
    id: string;
    name: string;
    system: Record<string, unknown>;
    getFlag: (scope: string, key: string) => unknown;
    items?: { get: (id: string) => unknown };
}

let rulesetSetting: string | undefined;

function installGlobals(actors: ActorStub[]): void {
    const byId = new Map(actors.map((a) => [a.id, a]));
    (globalThis as Record<string, unknown>).game = {
        i18n: {
            localize: (k: string) => k,
            format: (k: string) => k,
            lang: 'en',
        },
        settings: {
            get: (_system: string, key: string) => (key === 'dh2-ruleset' ? rulesetSetting : undefined),
        },
        actors: { get: (id: string) => byId.get(id) },
    };
    (globalThis as Record<string, unknown>).foundry = {
        utils: { deepClone: (o: unknown) => JSON.parse(JSON.stringify(o)) },
    };
}

function makeItem(cost: number, quantity = 99): { id: string; name: string; system: { cost: { value: number }; quantity: number } } {
    return { id: 'i-las', name: 'Lasgun', system: { cost: { value: cost }, quantity } };
}

function makeSource(profile: Record<string, unknown>, item = makeItem(100)): ActorStub {
    return {
        id: 'src-1',
        name: 'Quartermaster',
        system: {},
        getFlag: (_s, key) => (key === 'transactionProfile' ? profile : undefined),
        items: { get: (id: string) => (id === item.id ? item : undefined) },
    };
}

function makeBuyer(system: Record<string, unknown>): ActorStub {
    return {
        id: 'buy-1',
        name: 'Trooper',
        system,
        getFlag: () => undefined,
    };
}

function quote(params: {
    buyer: ActorStub;
    source: ActorStub;
    quantity?: number;
    influenceBurn?: number;
    gmModifierPercent?: number;
}): ReturnType<typeof TransactionManager.prepareQuote> {
    installGlobals([params.buyer, params.source]);
    return TransactionManager.prepareQuote({
        buyerActorId: params.buyer.id,
        sourceActorId: params.source.id,
        itemId: 'i-las',
        quantity: params.quantity,
        influenceBurn: params.influenceBurn,
        gmModifierPercent: params.gmModifierPercent,
    });
}

beforeEach(() => {
    rulesetSetting = undefined; // unset → WH40KSettings defaults to 'homebrew'
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('prepareQuote — currency resolution', () => {
    it('homebrew DH2e barter spends Throne Gelt and allows influence burn', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', influence: 5, throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 2,
        });
        expect(q.resourceType).toBe('throneGelt');
        expect(q.resourceLabel).toBe('WH40K.Trade.Resource.throneGelt');
        expect(q.allowInfluenceBurn).toBe(true);
        expect(q.baseCost).toBe(200);
        expect(q.finalCost).toBe(200);
        expect(q.availableResource).toBe(1000);
        expect(q.canAfford).toBe(true);
        expect(q.remainingResource).toBe(800);
    });

    it('RAW DH2e barter spends Influence and forbids influence burn', () => {
        rulesetSetting = 'raw';
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', influence: 50, throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            influenceBurn: 3,
        });
        expect(q.resourceType).toBe('influence');
        expect(q.allowInfluenceBurn).toBe(false);
        expect(q.influenceBurn).toBe(0);
        expect(q.adjustments.find((a) => a.key === 'influence-burn')).toBeUndefined();
        expect(q.availableResource).toBe(50);
    });

    it('requisition mode always spends Requisition and never burns influence', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'ow', influence: 5, requisition: 300 }),
            source: makeSource({ mode: 'requisition', requisition: { costMultiplier: 2 } }),
            quantity: 1,
            influenceBurn: 2,
        });
        expect(q.resourceType).toBe('requisition');
        expect(q.allowInfluenceBurn).toBe(false);
        expect(q.adjustments.find((a) => a.key === 'requisition-multiplier')?.value).toBe(100);
        expect(q.finalCost).toBe(200);
    });
});

describe('prepareQuote — influence burn discount', () => {
    it('applies a percentage discount and clamps to available / max influence', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', influence: 5, throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 2,
            influenceBurn: 2,
        });
        const burn = q.adjustments.find((a) => a.key === 'influence-burn');
        expect(q.influenceBurn).toBe(2);
        expect(burn?.value).toBe(-40); // 200 * (10% * 2) = 40 discount
        expect(q.finalCost).toBe(160);
        expect(q.remainingInfluence).toBe(3);
    });

    it('caps the burn at the profile maximum', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', influence: 99, throneGelt: 1000 }),
            source: makeSource({ mode: 'barter', barter: { maxInfluenceBurn: 1, influenceDiscountPercent: 10 } }),
            quantity: 1,
            influenceBurn: 9,
        });
        expect(q.influenceBurn).toBe(1);
    });
});

describe('prepareQuote — disposition (campaign relationship tracker)', () => {
    it('discounts for a friendly source', () => {
        vi.spyOn(EventTracker, 'computeCharacterStates').mockReturnValue({
            Quartermaster: { dispositions: { party: { target: 'party', attitude: 'friendly' } }, relationships: [] },
        });
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 2,
        });
        expect(q.dispositionAttitude).toBe('friendly');
        expect(q.adjustments.find((a) => a.key === 'disposition')?.value).toBe(-30); // 200 * -15%
        expect(q.finalCost).toBe(170);
    });

    it('a per-character disposition overrides the party entry', () => {
        vi.spyOn(EventTracker, 'computeCharacterStates').mockReturnValue({
            Quartermaster: {
                dispositions: {
                    party: { target: 'party', attitude: 'neutral' },
                    Trooper: { target: 'Trooper', attitude: 'hostile' },
                },
                relationships: [],
            },
        });
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 2,
        });
        expect(q.dispositionAttitude).toBe('hostile');
        expect(q.adjustments.find((a) => a.key === 'disposition')?.value).toBe(70); // 200 * +35%
    });

    it('no tracker data leaves price untouched', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 2,
        });
        expect(q.dispositionAttitude).toBeNull();
        expect(q.adjustments.find((a) => a.key === 'disposition')).toBeUndefined();
    });
});

describe('prepareQuote — GM modifier', () => {
    it('raises the price for a positive GM modifier', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 2,
            gmModifierPercent: 25,
        });
        expect(q.gmModifierPercent).toBe(25);
        expect(q.adjustments.find((a) => a.key === 'gm-modifier')?.value).toBe(50); // 200 * 25%
        expect(q.finalCost).toBe(250);
    });

    it('lowers the price for a negative GM modifier (good haggle roll)', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 2,
            gmModifierPercent: -50,
        });
        expect(q.adjustments.find((a) => a.key === 'gm-modifier')?.value).toBe(-100);
        expect(q.finalCost).toBe(100);
    });
});

describe('prepareQuote — affordability', () => {
    it('flags an unaffordable transaction', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', throneGelt: 50 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 2,
        });
        expect(q.canAfford).toBe(false);
        expect(q.remainingResource).toBe(0);
    });

    it('throws when the source is not a configured trade source', () => {
        const buyer = makeBuyer({ gameSystem: 'dh2e', throneGelt: 1000 });
        const source = makeSource({ mode: 'none' });
        installGlobals([buyer, source]);
        expect(() => TransactionManager.prepareQuote({ buyerActorId: buyer.id, sourceActorId: source.id, itemId: 'i-las' })).toThrow();
    });
});

describe('toQuoteView', () => {
    it('projects a live quote into a serializable view', () => {
        const q = quote({
            buyer: makeBuyer({ gameSystem: 'dh2e', throneGelt: 1000 }),
            source: makeSource({ mode: 'barter' }),
            quantity: 3,
        });
        const view = TransactionManager.toQuoteView(q);
        expect(view).toMatchObject({
            buyerName: 'Trooper',
            sourceName: 'Quartermaster',
            itemName: 'Lasgun',
            mode: 'barter',
            quantity: 3,
        });
        expect(Array.isArray(view.adjustments)).toBe(true);
    });
});
