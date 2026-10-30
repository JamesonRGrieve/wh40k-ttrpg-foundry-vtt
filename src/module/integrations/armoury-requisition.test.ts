import { afterEach, describe, expect, it, vi } from 'vitest';
import { DH2_ACQUISITION_LADDER } from '../config/game-systems/dh2-config.ts';
import { OW_ACQUISITION_LADDER } from '../config/game-systems/ow-config.ts';
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

type ResolveInput = Parameters<typeof resolveArmouryRequisition>[0];

/**
 * Resolve a trade on the DH2-shaped defaults most cases use — Gen 2 degrees and
 * no parts bonus — so each test states only what it is about.
 */
function resolve(input: Omit<ResolveInput, 'degreesMethod' | 'partsRequisitionBonus'> & Partial<ResolveInput>): ReturnType<typeof resolveArmouryRequisition> {
    return resolveArmouryRequisition({ degreesMethod: 'gen2', partsRequisitionBonus: null, ...input });
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
        const system = {
            influence: 45,
            infamy: 30,
            logisticsRating: 25,
            munitorum: true,
            situational: 5,
            logisticsFront: { troopCount: 'regiment', timeInFront: 'years1to5', frontActive: 'years5plus', warCondition: 'dominant' },
            characteristics: { fellowship: { bonus: 4 } },
            requisition: 12,
            renown: 22,
            rogueTrader: { profitFactor: { current: 40 } },
        };
        expect(readRequesterState(system, 'influence')).toEqual({ rating: 45, fellowshipBonus: 4 });
        expect(readRequesterState(system, 'infamy')).toEqual({ rating: 30 });
        // OW reads the squad's whole Logistics standing, including the persisted front (#496).
        expect(readRequesterState(system, 'logistics')).toEqual({
            rating: 25,
            logistics: {
                rating: 25,
                munitorum: true,
                situational: 5,
                front: { troopCount: 'regiment', timeInFront: 'years1to5', frontActive: 'years5plus', warCondition: 'dominant' },
            },
        });
        expect(readRequesterState(system, 'requisition-points')).toEqual({ rating: 0, pool: 12, renown: 22 });
        expect(readRequesterState(system, 'profit-factor')).toEqual({ rating: 0, pool: 40 });
        expect(readRequesterState(system, 'none')).toEqual({ rating: 0 });
    });
});

describe('requestedItemFrom', () => {
    it('normalises the stored availability and keeps a known craftsmanship', () => {
        expect(requestedItemFrom(item({ availability: 'very-rare', craftsmanship: 'best' }), 'influence', null)).toEqual({
            availability: 'veryRare',
            craftsmanship: 'best',
            bound: false,
            cost: undefined,
            renownRequired: undefined,
            modificationParts: undefined,
        });
    });

    it('returns null for an availability the requisition test cannot price', () => {
        expect(requestedItemFrom(item({ availability: 'uncommon' }), 'influence', null)).toBeNull();
    });

    it('drops an Astartes-grade craftsmanship the test table does not carry', () => {
        expect(requestedItemFrom(item({ craftsmanship: 'master' }), 'influence', null)?.craftsmanship).toBeUndefined();
    });

    it('prices a Deathwatch line in Requisition and gates it on the Renown rank minimum', () => {
        const dw = requestedItemFrom(item({ renown: 'distinguished', cost: { dw: { requisition: 15 } } }), 'requisition-points', null);
        expect(dw?.cost).toBe(15);
        expect(dw?.renownRequired).toBe(40);
    });

    it('prices a Rogue Trader line in Profit Factor', () => {
        expect(requestedItemFrom(item({ cost: { rt: { profitFactor: 3 } } }), 'profit-factor', null)?.cost).toBe(3);
    });

    it('takes a weapon modification as parts, with the line’s printed bonus (#136)', () => {
        const parts = { ...item({}, 'Red-Dot Laser Sight'), type: 'weaponModification' };
        expect(requestedItemFrom(parts, 'influence', 30)?.modificationParts).toBe(30);
        // A line that prints no bonus (DH1 / RT / OW: null) adds no row.
        expect(requestedItemFrom(parts, 'influence', null)?.modificationParts).toBeUndefined();
        // Anything that is not a weapon modification is not parts.
        expect(requestedItemFrom({ ...item(), type: 'weapon' }, 'influence', 30)?.modificationParts).toBeUndefined();
    });
});

describe('resolveArmouryRequisition', () => {
    it('grants a line whose Influence test passes, without touching standing', () => {
        const outcome = resolve({
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
        const outcome = resolve({
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

    it('DH2: denies a failed test and drops Influence by the DoF beyond Fellowship bonus', () => {
        const outcome = resolve({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 40, fellowshipBonus: 3 },
            entries: [entry(item({ availability: 'rare' }))],
            infiniteStock: true,
            rollD100: () => 95,
        });
        expect(outcome.allowed).toBe(false);
        // 95 vs 20: 8 DoF, 5 beyond Fellowship bonus 3.
        expect(outcome.attempts[0]).toMatchObject({ outcome: 'denied', target: 20, roll: 95, dof: 8 });
        expect(standingUpdate(outcome)).toEqual({ 'system.influence': 35 });
    });

    it('counts degrees with the line’s own method: Gen 1 (DH1) full tens, Gen 2 (DH2) tens digits (#496)', () => {
        const fail = (degreesMethod: 'gen1' | 'gen2'): number | undefined =>
            resolve({
                economy: 'influence',
                ladder: DH2_ACQUISITION_LADDER,
                requester: { rating: 35 },
                // Rare −20 → target 15; a 24 misses by 9 points but crosses one tens digit.
                entries: [entry(item({ availability: 'rare' }))],
                infiniteStock: true,
                rollD100: () => 24,
                degreesMethod,
            }).attempts[0]?.dof;
        // The card prints the line's own count (#335): Gen 1 has no base degree, so a
        // miss by 9 points is 0 DoF (as DH1 counts them), Gen 2's crossed tens digit 2.
        expect(fail('gen1')).toBe(0);
        expect(fail('gen2')).toBe(2);
        const pass = (degreesMethod: 'gen1' | 'gen2'): number | undefined =>
            resolve({
                economy: 'influence',
                ladder: DH2_ACQUISITION_LADDER,
                requester: { rating: 41 },
                // target 21; a 19 succeeds by 2 points but crosses one tens digit.
                entries: [entry(item({ availability: 'rare' }))],
                infiniteStock: true,
                rollD100: () => 19,
                degreesMethod,
            }).attempts[0]?.dos;
        expect(pass('gen1')).toBe(0);
        expect(pass('gen2')).toBe(2);
    });

    it('DH1: the rating loss reads the engine count, so 4 printed DoF (and not 3) costs Influence (#335)', () => {
        const run = (roll: number): ReturnType<typeof resolve> =>
            resolve({
                economy: 'influence',
                // DH1's printed loss: 1 Influence at 4+ degrees of failure, counted in full tens.
                ladder: { ...DH2_ACQUISITION_LADDER, failureLoss: { kind: 'flat', minDegrees: 4, loss: 1, counting: 'fullTens' } },
                requester: { rating: 35 },
                entries: [entry(item({ availability: 'rare' }))],
                infiniteStock: true,
                rollD100: () => roll,
                degreesMethod: 'gen1',
            });
        // Target 15. A 55 misses by 40: 4 DoF printed, Influence 35 → 34.
        const four = run(55);
        expect(four.attempts[0]?.dof).toBe(4);
        expect(four.after.rating).toBe(34);
        // A 54 misses by 39: 3 DoF printed, no loss.
        const three = run(54);
        expect(three.attempts[0]?.dof).toBe(3);
        expect(three.after.rating).toBe(35);
    });

    it('DH2: weapon-modification parts take +30, printed as their own row (#136)', () => {
        const outcome = resolve({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 40 },
            entries: [entry({ ...item({ availability: 'rare' }, 'Red-Dot Laser Sight'), type: 'weaponModification' })],
            infiniteStock: true,
            rollD100: () => 45,
            partsRequisitionBonus: 30,
        });
        // 40 − 20 (Rare) + 30 (parts) = 50.
        expect(outcome.attempts[0]).toMatchObject({ outcome: 'granted', target: 50 });
        expect(outcome.attempts[0]?.breakdown).toContainEqual({ source: 'modificationParts', value: 30 });
    });

    it('OW: a failed Logistics request costs no Logistics Rating, however badly it fails (#496)', () => {
        const outcome = resolve({
            economy: 'logistics',
            ladder: OW_ACQUISITION_LADDER,
            requester: readRequesterState({ logisticsRating: 30 }, 'logistics'),
            entries: [entry(item({ availability: 'rare' }))],
            infiniteStock: true,
            rollD100: () => 100,
        });
        expect(outcome.allowed).toBe(false);
        expect(outcome.attempts[0]).toMatchObject({ outcome: 'denied', roll: 100 });
        expect(standingUpdate(outcome)).toBeNull();
    });

    it('OW: prices the request on the squad’s persisted front, as the Logistics Test dialog does (#496)', () => {
        const system = {
            logisticsRating: 30,
            logisticsFront: { troopCount: 'regiments', timeInFront: 'months6to12', frontActive: 'years1to5', warCondition: 'nearVictorious' },
        };
        const outcome = resolve({
            economy: 'logistics',
            ladder: OW_ACQUISITION_LADDER,
            requester: readRequesterState(system, 'logistics'),
            entries: [entry(item({ availability: 'rare' }))],
            infiniteStock: true,
            rollD100: () => 1,
        });
        // 30, Rare / Multiple Regiments −10, +10, +20, +10 = 60.
        expect(outcome.attempts[0]).toMatchObject({ outcome: 'granted', target: 60 });
    });

    it('refuses a bound item without rolling', () => {
        const rollD100 = vi.fn(() => 1);
        const outcome = resolve({
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
        const outcome = resolve({
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
        const outcome = resolve({
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
        const outcome = resolve({
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
        const outcome = resolve({
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
        const outcome = resolve({
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
        // DH2: Rare −20, Good −20 (DH2's availability and craftsmanship modifier tables).
        expect(attempt?.modifierSources.map((r) => r.value)).toEqual([-20, -20]);
        const availabilityRow = attempt?.modifierSources.at(0);
        expect(availabilityRow?.label).toContain('WH40K.Requisition.Source.Availability');
        const tooltip = JSON.parse(availabilityRow?.tooltipData ?? '{}') as { sources: { value: number }[] };
        expect(tooltip.sources.at(0)?.value).toBe(-20);
        expect(attempt?.target).toBe(0);
        expect(ctx.gameSystem).toBe('dh2');
    });

    it('OW: prints the same troop-difficulty / craftsmanship provenance rows as the Logistics Test card (#496)', () => {
        stubI18n();
        const outcome = resolve({
            economy: 'logistics',
            ladder: OW_ACQUISITION_LADDER,
            requester: readRequesterState({ logisticsRating: 40, munitorum: true }, 'logistics'),
            entries: [entry(item({ availability: 'rare', craftsmanship: 'good' }))],
            infiniteStock: true,
            rollD100: () => 1,
        });
        const attempt = buildArmouryCardContext(outcome, 'ow').attempts.at(0);
        expect(attempt?.baseTarget).toBe(40);
        // Default front: Munitorum +5, Rare / Company −30, +0, +0, Violent Impasse −10, Good −30.
        expect(attempt?.modifierSources.map((r) => r.value)).toEqual([5, -30, 0, 0, -10, -30]);
        expect(attempt?.modifierSources.map((r) => r.label)).toContain('WH40K.OW.Logistics.Modifier.WarCondition');
        expect(attempt?.target).toBe(0);
    });

    it('names the weapon-modification parts bonus as its own hoverable row (#136)', () => {
        stubI18n();
        const outcome = resolve({
            economy: 'influence',
            ladder: DH2_ACQUISITION_LADDER,
            requester: { rating: 40 },
            entries: [entry({ ...item({ availability: 'rare' }, 'Red-Dot Laser Sight'), type: 'weaponModification' })],
            infiniteStock: true,
            rollD100: () => 45,
            partsRequisitionBonus: 30,
        });
        const rows = buildArmouryCardContext(outcome, 'dh2').attempts.at(0)?.modifierSources ?? [];
        const parts = rows.find((r) => r.label === 'WH40K.Requisition.Source.ModificationParts');
        expect(parts?.value).toBe(30);
        expect(JSON.parse(parts?.tooltipData ?? '{}')).toEqual({
            title: 'WH40K.Requisition.Source.ModificationParts',
            sources: [{ name: 'WH40K.Requisition.Source.ModificationParts', value: 30 }],
        });
    });

    it('reports a refusal through the langpack, never hard-coded English', () => {
        stubI18n();
        const outcome = resolve({
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
    /**
     * Stub the V14 dice surface the hook really uses. `Roll#evaluateSync` is
     * deliberately absent: V14 throws on any dice term there, which is the bug
     * the old evaluateSync stub hid (found by Tier B, #496). The face comes from
     * `Die#randomFace` and is rebuilt with `Roll.fromData`.
     */
    function stubFoundry(total: number): { create: ReturnType<typeof vi.fn>; fromData: ReturnType<typeof vi.fn> } {
        stubI18n();
        const create = vi.fn().mockResolvedValue({});
        const fromData = vi.fn((data: { total: number }) => ({ total: data.total }));
        class DieStub {
            randomFace(): number {
                return total;
            }
        }
        vi.stubGlobal('Roll', { fromData });
        vi.stubGlobal('ChatMessage', { create });
        vi.stubGlobal('foundry', {
            applications: { handlebars: { renderTemplate: vi.fn().mockResolvedValue('<div></div>') } },
            dice: { terms: { Die: DieStub } },
        });
        return { create, fromData };
    }

    it('rolls the d100 without Roll#evaluateSync, recording an evaluated 1d100 for the card', () => {
        const { fromData } = stubFoundry(37);
        const buyer = { system: { gameSystem: 'dh2', influence: 60 }, update: vi.fn().mockResolvedValue({}) };
        gateArmouryTrade(ARMOURY, buyer, { buyerReceive: [entry(item())] }, 'u1', speaker);
        expect(fromData).toHaveBeenCalledWith(
            expect.objectContaining({
                formula: '1d100',
                total: 37,
                terms: [expect.objectContaining({ class: 'Die', faces: 100, results: [{ result: 37, active: true }] })],
            }),
        );
    });

    it('leaves every non-armoury trade alone', () => {
        stubFoundry(1);
        const buyer = { system: { gameSystem: 'dh2', influence: 0 }, update: vi.fn() };
        expect(gateArmouryTrade({ flags: {} }, buyer, { buyerReceive: [entry(item())] }, 'u1', speaker)).toBeUndefined();
        expect(buyer.update).not.toHaveBeenCalled();
    });

    it('cancels the trade when the Influence test fails, and writes the Influence loss', async () => {
        const { create } = stubFoundry(99);
        const buyer = {
            system: { gameSystem: 'dh2', influence: 40, characteristics: { fellowship: { bonus: 4 } } },
            update: vi.fn().mockResolvedValue({}),
        };
        expect(gateArmouryTrade(ARMOURY, buyer, { buyerReceive: [entry(item())] }, 'u1', speaker)).toBe(false);
        await vi.waitFor(() => {
            expect(create).toHaveBeenCalledTimes(1);
        });
        // 99 vs 20 (Rare): 8 DoF, 4 beyond the buyer's Fellowship bonus.
        expect(buyer.update).toHaveBeenCalledWith({ 'system.influence': 36 });
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

    it('reads the buyer line’s parts bonus: a DH2 weapon modification passes at +30 (#136)', () => {
        stubFoundry(25);
        const parts = { ...item({ availability: 'rare' }, 'Red-Dot Laser Sight'), type: 'weaponModification' };
        // 20 Influence − 20 (Rare) + 30 (parts) = 30: a 25 passes, where the bare item (target 0) would fail.
        const dh2 = { system: { gameSystem: 'dh2', influence: 20 }, update: vi.fn().mockResolvedValue({}) };
        expect(gateArmouryTrade(ARMOURY, dh2, { buyerReceive: [entry(parts)] }, 'u1', speaker)).toBeUndefined();
        // DH1 prints no parts bonus: 20 − 10 (DH1 Rare) = 10, so the same 25 fails.
        const dh1 = { system: { gameSystem: 'dh1', influence: 20 }, update: vi.fn().mockResolvedValue({}) };
        expect(gateArmouryTrade(ARMOURY, dh1, { buyerReceive: [entry(parts)] }, 'u1', speaker)).toBe(false);
    });
});
