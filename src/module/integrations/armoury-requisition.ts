/**
 * @file Armoury requisition gate — the consumer of `requisition-transfer.ts` (#496).
 *
 * The Inquisition Armoury (`rules/armoury.ts`) is an Item Piles MERCHANT, so
 * "the acolyte takes a hellgun from it" is an Item Piles trade. Before this gate
 * that trade was unconditional: the requisition rail decided who may draw what,
 * at what target, and at what cost — and nothing asked it.
 *
 * Item Piles 3.3.x fires `item-piles-preCalculateTradeItems` on the GM (the trade
 * runs through `executeAsGM`) synchronously via `Hooks.call`, before any
 * transaction is prepared; returning `false` cancels the trade. That is the
 * attach point: every item the buyer would receive is planned through
 * {@link planRequisition}, rolled where the line's economy is a test, and
 * resolved through {@link applyRequisition}. The trade proceeds only when every
 * line transfers. The requester's standing (Influence lost on a big failure, a
 * spent Requisition / Profit Factor pool) is written back, and one chat card
 * prints each attempt's full target derivation and result.
 *
 * The hook is synchronous, and V14's `Roll#evaluateSync` refuses dice terms
 * outright ("This Roll contains terms that cannot be synchronously evaluated"),
 * so the d100 face is drawn by the core `Die` term's own generator and recorded
 * as an evaluated Roll for the card ({@link rollD100Sync}). Stock is left to Item Piles: it already
 * decrements a finite merchant line itself, so writing `stockAfter` here would
 * consume the unit twice.
 *
 * Only trades whose SELLER is the armoury are gated; every other Item Piles
 * trade (a pile, a hand-built shop) keeps paying in coin, untouched.
 */

import { logisticsRows } from '../applications/prompts/logistics-test-rows.ts';
import { acquisitionLadderFor, weaponModificationRulesFor } from '../config/game-systems/index.ts';
import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { getDegreeForMode, printedDegreesFromCount, resolveDegreesMethod } from '../rolls/roll-helpers.ts';
import { isD100Success } from '../rules/_dice.ts';
import {
    type AcquisitionLadder,
    type AvailabilityKey,
    type CraftsmanshipKey,
    normaliseAvailability,
    normaliseCraftsmanship,
} from '../rules/acquisition-ladder.ts';
import { type FlaggedActorLike, findArmoury } from '../rules/armoury.ts';
import { isRenownRank, RENOWN_THRESHOLDS } from '../rules/dw-renown.ts';
import { type LogisticsBreakdown, type LogisticsContext, logisticsStandingFrom, type StoredLogisticsStanding } from '../rules/ow-logistics.ts';
import { isTestBasedEconomy, type RequestedItem, type RequesterState, type RequisitionEconomy, requisitionEconomyFor } from '../rules/requisition-rail.ts';
import type { RequisitionModifier } from '../rules/requisition-test.ts';
import { applyRequisition, planRequisition, type RequisitionRequest } from '../rules/requisition-transfer.ts';
import type { I18nKey } from '../types/i18n-keys';

/** One line of what the buyer would receive, as Item Piles' `getPaymentData` builds it. */
export interface ItemPilesTradeEntry {
    type: string;
    quantity: number;
    item?: RequisitionableItem | undefined;
}

/** The slice of Item Piles' trade price data the gate reads. */
export interface ItemPilesTradePrices {
    buyerReceive: ItemPilesTradeEntry[];
}

/** The physical-item fields the requisition reads off a merchant line. */
export interface RequisitionableItem {
    name: string;
    /** The Item type; a `weaponModification` is requisitioned as parts (#136). */
    type?: string | undefined;
    system: {
        availability?: string | undefined;
        craftsmanship?: string | undefined;
        bound?: boolean | undefined;
        quantity: number;
        renown?: string | null | undefined;
        cost?: {
            dw?: { requisition?: number | null | undefined } | undefined;
            rt?: { profitFactor?: number | null | undefined } | undefined;
        };
    };
}

/** The requester-side fields each economy reads. Absent on lines that lack them. */
export interface RequisitionerSystem extends StoredLogisticsStanding {
    gameSystem?: string | undefined;
    influence?: number | undefined;
    infamy?: number | undefined;
    characteristics?: { fellowship?: { bonus?: number | undefined } | undefined } | undefined;
    requisition?: number | undefined;
    renown?: number | undefined;
    rogueTrader?: { profitFactor?: { current?: number | undefined } | undefined } | undefined;
}

/** Schema path each test economy's rating is written back to. */
const RATING_PATHS: Partial<Record<RequisitionEconomy, string>> = {
    influence: 'system.influence',
    infamy: 'system.infamy',
    logistics: 'system.logisticsRating',
};

/** Schema path each pool economy's pool is written back to. */
const POOL_PATHS: Partial<Record<RequisitionEconomy, string>> = {
    'requisition-points': 'system.requisition',
    'profit-factor': 'system.rogueTrader.profitFactor.current',
};

function readRequisitionPool(system: RequisitionerSystem): RequesterState {
    return { rating: 0, pool: system.requisition ?? 0, renown: system.renown ?? 0 };
}

/** OW: the squad's whole Logistics standing, so the armoury prices exactly as the Logistics Test dialog (#496). */
function readLogisticsStanding(system: RequisitionerSystem): RequesterState {
    const logistics = logisticsStandingFrom(system);
    return { rating: logistics.rating, logistics };
}

function readProfitFactorPool(system: RequisitionerSystem): RequesterState {
    return { rating: 0, pool: system.rogueTrader?.profitFactor?.current ?? 0 };
}

/** How each economy reads the requester's standing off the actor's system data. */
const REQUESTER_READERS: Record<RequisitionEconomy, (system: RequisitionerSystem) => RequesterState> = {
    'influence': (system) => ({ rating: system.influence ?? 0, fellowshipBonus: system.characteristics?.fellowship?.bonus ?? 0 }),
    'infamy': (system) => ({ rating: system.infamy ?? 0 }),
    'logistics': readLogisticsStanding,
    'requisition-points': readRequisitionPool,
    'profit-factor': readProfitFactorPool,
    'none': () => ({ rating: 0 }),
};

/** The requester's standing in the given economy. */
export function readRequesterState(system: RequisitionerSystem, economy: RequisitionEconomy): RequesterState {
    return REQUESTER_READERS[economy](system);
}

/**
 * The item as the rail sees it, or `null` when its availability is not a rating
 * the requisition test knows (an `uncommon` / restricted line cannot be priced).
 */
export function requestedItemFrom(item: RequisitionableItem, economy: RequisitionEconomy, partsRequisitionBonus: number | null): RequestedItem | null {
    const availability: AvailabilityKey | null = normaliseAvailability(item.system.availability);
    if (availability === null) return null;
    const craftsmanship = normaliseCraftsmanship(item.system.craftsmanship);
    const renownRank = item.system.renown;
    let cost: number | undefined;
    if (economy === 'requisition-points') cost = item.system.cost?.dw?.requisition ?? undefined;
    if (economy === 'profit-factor') cost = item.system.cost?.rt?.profitFactor ?? undefined;
    return {
        availability,
        craftsmanship: craftsmanship ?? undefined,
        bound: item.system.bound === true,
        cost,
        renownRequired: isRenownRank(renownRank) ? RENOWN_THRESHOLDS[renownRank].min : undefined,
        // A weapon modification drawn from the armoury lands in the inventory as parts for the
        // personal-fitting flow (#136), so it takes the line's parts bonus where one is printed.
        modificationParts: item.type === 'weaponModification' && partsRequisitionBonus !== null ? partsRequisitionBonus : undefined,
    };
}

/** A line's degrees-of-success counting method, as the roll engine resolves it. */
type DegreesMethod = ReturnType<typeof resolveDegreesMethod>;

/** The outcome of one requested line. */
interface ArmouryAttempt {
    name: string;
    /** `granted` transfers, `denied` failed its test, `refused` never reached one. */
    outcome: 'granted' | 'denied' | 'refused';
    refusal?: { key: I18nKey; data?: Record<string, number | string> | undefined } | undefined;
    target?: number | undefined;
    breakdown?: RequisitionModifier[] | undefined;
    /** OW: the Logistics Test the target came from (its front-conditions / craftsmanship table rows). */
    logistics?: { context: LogisticsContext; breakdown: LogisticsBreakdown } | undefined;
    roll?: number | undefined;
    /** Degrees as the line prints them (Gen 1 has no base degree, #335): the card's count. */
    dos?: number | undefined;
    dof?: number | undefined;
    cost?: number | undefined;
}

/** The whole trade's verdict and the standing to write back. */
export interface ArmouryRequisitionOutcome {
    economy: RequisitionEconomy;
    /** True only when every requested line transfers. */
    allowed: boolean;
    attempts: ArmouryAttempt[];
    before: RequesterState;
    after: RequesterState;
}

/**
 * Resolve every line of an armoury trade. Pure: the die is injected. Lines are
 * resolved in order against the running standing (a second hellgun is paid for
 * from what the first left), and resolution stops at the first line that does
 * not transfer — the hook cannot cancel half a trade.
 */
export function resolveArmouryRequisition(input: {
    economy: RequisitionEconomy;
    /** The buyer's line's printed availability / craftsmanship ladder (#192). */
    ladder: AcquisitionLadder | null;
    requester: RequesterState;
    entries: readonly ItemPilesTradeEntry[];
    infiniteStock: boolean;
    rollD100: () => number;
    /** The buyer's line's degrees method (`resolveDegreesMethod`): Gen 1 counts full tens of margin, Gen 2 the tens digits. */
    degreesMethod: DegreesMethod;
    /** The buyer's line's bonus for a weapon modification taken as parts (#136), or null where the book prints none. */
    partsRequisitionBonus: number | null;
}): ArmouryRequisitionOutcome {
    const { economy } = input;
    let standing: RequesterState = { ...input.requester };
    const attempts: ArmouryAttempt[] = [];
    let allowed = true;

    for (const entry of input.entries) {
        const item = entry.item;
        if (entry.type !== 'item' || item === undefined) continue;
        const requested = requestedItemFrom(item, economy, input.partsRequisitionBonus);
        if (requested === null) {
            attempts.push({ name: item.name, outcome: 'refused', refusal: { key: 'WH40K.Requisition.Refusal.Unrated', data: { item: item.name } } });
            allowed = false;
            break;
        }
        const request: RequisitionRequest = {
            economy,
            ladder: input.ladder,
            requester: standing,
            item: requested,
            stock: { quantity: item.system.quantity, infinite: input.infiniteStock },
            taken: entry.quantity,
        };
        const plan = planRequisition(request);
        if (!plan.allowed) {
            attempts.push({ name: item.name, outcome: 'refused', refusal: plan.reason, cost: plan.gate.cost });
            allowed = false;
            break;
        }
        let rolled: { total: number; success: boolean; dos: number; dof: number } | undefined;
        // A rating the ladder prints "Automatic" passes with no roll.
        if (isTestBasedEconomy(economy) && plan.gate.automatic !== true) {
            const total = input.rollD100();
            const target = plan.gate.target ?? 0;
            const success = isD100Success(total, target);
            // The line's own count, as the roll engine counts it: one, plus the method's further degrees.
            const degrees = 1 + (success ? getDegreeForMode(input.degreesMethod, target, total) : getDegreeForMode(input.degreesMethod, total, target));
            rolled = { total, success, dos: success ? degrees : 0, dof: success ? 0 : degrees };
        }
        const result = applyRequisition(plan, request, rolled === undefined ? undefined : { success: rolled.success, degreesOfFailure: rolled.dof });
        standing = { ...standing, rating: result.ratingAfter, pool: result.poolAfter };
        attempts.push({
            name: item.name,
            outcome: result.transfer ? 'granted' : 'denied',
            target: plan.gate.target,
            breakdown: plan.gate.breakdown,
            logistics: plan.gate.logistics,
            roll: rolled?.total,
            // The card prints the line's own count (#335). The rule above reads the
            // engine's count, whose base degree `ratingAfterFailure` drops itself for
            // a full-tens line (DH1).
            dos: rolled === undefined ? undefined : printedDegreesFromCount(input.degreesMethod, rolled.dos),
            dof: rolled === undefined ? undefined : printedDegreesFromCount(input.degreesMethod, rolled.dof),
            cost: plan.gate.cost,
        });
        if (!result.transfer) {
            allowed = false;
            break;
        }
    }

    return { economy, allowed, attempts, before: input.requester, after: standing };
}

/** The `actor.update` payload for the standing change, or null when nothing moved. */
export function standingUpdate(outcome: ArmouryRequisitionOutcome): Record<string, number> | null {
    const update: Record<string, number> = {};
    const ratingPath = RATING_PATHS[outcome.economy];
    if (ratingPath !== undefined && outcome.after.rating !== outcome.before.rating) update[ratingPath] = outcome.after.rating;
    const poolPath = POOL_PATHS[outcome.economy];
    if (poolPath !== undefined && outcome.after.pool !== undefined && outcome.after.pool !== outcome.before.pool) update[poolPath] = outcome.after.pool;
    return Object.keys(update).length > 0 ? update : null;
}

/* -------------------------------------------- */
/*  Card context                                */
/* -------------------------------------------- */

/** Langpack key of each economy's own name (the card's base row, the pool line). */
const ECONOMY_LABEL_KEYS: Record<Exclude<RequisitionEconomy, 'none'>, I18nKey> = {
    'influence': 'WH40K.Requisition.Economy.influence',
    'logistics': 'WH40K.Requisition.Economy.logistics',
    'infamy': 'WH40K.Requisition.Economy.infamy',
    'requisition-points': 'WH40K.Requisition.Economy.requisition-points',
    'profit-factor': 'WH40K.Requisition.Economy.profit-factor',
};

const AVAILABILITY_LABEL_KEYS: Record<AvailabilityKey, I18nKey> = {
    ubiquitous: 'WH40K.Availability.Ubiquitous',
    abundant: 'WH40K.Availability.Abundant',
    plentiful: 'WH40K.Availability.Plentiful',
    common: 'WH40K.Availability.Common',
    average: 'WH40K.Availability.Average',
    scarce: 'WH40K.Availability.Scarce',
    rare: 'WH40K.Availability.Rare',
    veryRare: 'WH40K.Availability.VeryRare',
    extremelyRare: 'WH40K.Availability.ExtremelyRare',
    nearUnique: 'WH40K.Availability.NearUnique',
    unique: 'WH40K.Availability.Unique',
};

const CRAFTSMANSHIP_LABEL_KEYS: Record<CraftsmanshipKey, I18nKey> = {
    poor: 'WH40K.Craftsmanship.Poor',
    common: 'WH40K.Craftsmanship.Common',
    good: 'WH40K.Craftsmanship.Good',
    best: 'WH40K.Craftsmanship.Best',
};

/** One hoverable provenance row on the card. */
export interface ProvenanceRow {
    label: string;
    value: number;
    tooltipData: string;
}

/** The langpack key naming an availability rating. */
export function availabilityLabelKey(availability: AvailabilityKey): I18nKey {
    return AVAILABILITY_LABEL_KEYS[availability];
}

/** A requisition target's modifier rows (every component but the rating itself), each hoverable to its source. */
export function requisitionProvenanceRows(breakdown: readonly RequisitionModifier[], translate: Translate = t): ProvenanceRow[] {
    return breakdown
        .filter((m) => m.source !== 'rating')
        .map((m) => {
            const label = modifierLabel(m, translate);
            return { label, value: m.value, tooltipData: JSON.stringify({ title: label, sources: [{ name: label, value: m.value }] }) };
        });
}

/** Langpack resolver — `t` at runtime; injectable so stories render without a `game` global. */
type Translate = typeof t;

function economyLabel(economy: RequisitionEconomy, translate: Translate): string {
    return economy === 'none' ? '' : translate(ECONOMY_LABEL_KEYS[economy]);
}

function modifierLabel(modifier: RequisitionModifier, translate: Translate): string {
    const detail = modifier.detail;
    const availability = modifier.source === 'availability' ? normaliseAvailability(detail) : null;
    if (availability !== null) {
        return translate('WH40K.Requisition.Source.Availability', { rating: translate(AVAILABILITY_LABEL_KEYS[availability]) });
    }
    const craftsmanship = modifier.source === 'craftsmanship' ? normaliseCraftsmanship(detail) : null;
    if (craftsmanship !== null) {
        return translate('WH40K.Requisition.Source.Craftsmanship', { rating: translate(CRAFTSMANSHIP_LABEL_KEYS[craftsmanship]) });
    }
    if (modifier.source === 'modificationParts') return translate('WH40K.Requisition.Source.ModificationParts');
    return translate('WH40K.Requisition.Source.Other');
}

/** One attempt block on the card. */
type ArmouryCardAttempt = {
    name: string;
    granted: boolean;
    refused: boolean;
    variant: 'success' | 'danger';
    calloutValue: number | '';
    outcomeKey: I18nKey;
    refusalText: string;
    tested: boolean;
    baseLabel: string;
    baseTarget: number;
    modifierSources: ProvenanceRow[];
    target: number;
    roll: number;
    dos: number;
    dof: number;
};

/** Render context for `chat/armoury-requisition-chat.hbs` (a type alias so it satisfies `renderTemplate`'s data bag). */
type ArmouryCardContext = {
    gameSystem: string | undefined;
    attempts: ArmouryCardAttempt[];
    ratingLossText: string;
    poolSpentText: string;
};

/** Render context for `chat/armoury-requisition-chat.hbs`. */
export function buildArmouryCardContext(outcome: ArmouryRequisitionOutcome, gameSystem: string | undefined, translate: Translate = t): ArmouryCardContext {
    const ratingLabel = economyLabel(outcome.economy, translate);
    const attempts = outcome.attempts.map((attempt): ArmouryCardAttempt => {
        const breakdown = attempt.breakdown ?? [];
        const base = breakdown.find((m) => m.source === 'rating');
        const rows: ProvenanceRow[] =
            attempt.logistics === undefined
                ? requisitionProvenanceRows(breakdown, translate)
                : // OW: the same front-conditions / craftsmanship provenance rows the Logistics Test card prints.
                  logisticsRows(attempt.logistics.context, attempt.logistics.breakdown, translate).filter((row) => row.key !== 'rating');
        const refusal = attempt.refusal;
        return {
            name: attempt.name,
            granted: attempt.outcome === 'granted',
            refused: attempt.outcome === 'refused',
            variant: attempt.outcome === 'granted' ? 'success' : 'danger',
            calloutValue: attempt.roll ?? '',
            outcomeKey:
                attempt.outcome === 'granted'
                    ? 'WH40K.Requisition.Granted'
                    : attempt.outcome === 'denied'
                    ? 'WH40K.Requisition.Denied'
                    : 'WH40K.Requisition.Refused',
            refusalText: refusal === undefined ? '' : translate(refusal.key, refusal.data),
            tested: attempt.roll !== undefined,
            baseLabel: ratingLabel,
            baseTarget: base?.value ?? 0,
            modifierSources: rows,
            target: attempt.target ?? 0,
            roll: attempt.roll ?? 0,
            dos: attempt.dos ?? 0,
            dof: attempt.dof ?? 0,
        };
    });
    const ratingLost = outcome.after.rating < outcome.before.rating;
    const poolSpent = outcome.after.pool !== undefined && outcome.before.pool !== undefined && outcome.after.pool < outcome.before.pool;
    return {
        gameSystem,
        attempts,
        ratingLossText: ratingLost
            ? translate('WH40K.Requisition.RatingLoss', { rating: ratingLabel, before: outcome.before.rating, after: outcome.after.rating })
            : '',
        poolSpentText:
            poolSpent && outcome.after.pool !== undefined && outcome.before.pool !== undefined
                ? translate('WH40K.Requisition.PoolSpent', { pool: ratingLabel, cost: outcome.before.pool - outcome.after.pool, after: outcome.after.pool })
                : '',
    };
}

/* -------------------------------------------- */
/*  Foundry adapter                             */
/* -------------------------------------------- */

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/armoury-requisition-chat.hbs';

/**
 * Whether the armoury merchant has infinite stock — Item Piles' own
 * `infiniteQuantity` pile flag, which the GM may turn off for scarcity.
 */
export function hasInfiniteStock(armoury: FlaggedActorLike): boolean {
    const pile = armoury.flags?.['item-piles']?.['data'];
    return typeof pile === 'object' && pile !== null && 'infiniteQuantity' in pile && pile.infiniteQuantity === true;
}

/** The surface of a buyer the adapter reads and writes. */
export interface RequisitionBuyer {
    system: RequisitionerSystem;
    update: (data: Record<string, number>) => Promise<object | undefined>;
}

/** Chat speaker for the card, resolved only when a card is actually posted. */
type SpeakerResolver = () => ReturnType<typeof ChatMessage.getSpeaker>;

const D100_FACES = 100;

/**
 * A 1d100 rolled synchronously, for the synchronous Item Piles hook. V14's
 * `Roll#evaluateSync` throws on any dice term, so the face comes from the core
 * `Die` term's own `randomFace()` (Foundry's `CONFIG.Dice.randomUniform`
 * generator) and is rebuilt into an evaluated Roll, which the chat card carries
 * like any other roll.
 */
function rollD100Sync(): EvaluatedRoll {
    const face = new foundry.dice.terms.Die({ number: 1, faces: D100_FACES }).randomFace();
    return Roll.fromData({
        formula: `1d${D100_FACES}`,
        results: [face],
        terms: [{ class: 'Die', number: 1, faces: D100_FACES, modifiers: [], results: [{ result: face, active: true }] }],
        total: face,
    });
}

/** The Roll the card carries. */
type EvaluatedRoll = ReturnType<typeof Roll.fromData>;

/**
 * The `item-piles-preCalculateTradeItems` handler. Returns `false` to cancel the
 * trade, `undefined` to let it through.
 */
export function gateArmouryTrade(
    seller: FlaggedActorLike,
    buyer: RequisitionBuyer,
    prices: ItemPilesTradePrices,
    userId: string,
    speaker: SpeakerResolver,
): false | undefined {
    // Identity by flag via the armoury's own finder, so a renamed armoury is still gated.
    if (findArmoury([seller]) === undefined) return undefined;
    const economy = requisitionEconomyFor(buyer.system.gameSystem);
    const rolls: EvaluatedRoll[] = [];
    const outcome = resolveArmouryRequisition({
        economy,
        ladder: acquisitionLadderFor(buyer.system.gameSystem),
        requester: readRequesterState(buyer.system, economy),
        entries: prices.buyerReceive,
        infiniteStock: hasInfiniteStock(seller),
        rollD100: () => {
            const roll = rollD100Sync();
            rolls.push(roll);
            return roll.total ?? 0;
        },
        degreesMethod: resolveDegreesMethod(buyer.system.gameSystem),
        partsRequisitionBonus: weaponModificationRulesFor(buyer.system.gameSystem)?.partsRequisitionBonus ?? null,
    });
    if (outcome.attempts.length === 0) return undefined;
    void reportArmouryRequisition(buyer, outcome, rolls, userId, speaker);
    return outcome.allowed ? undefined : false;
}

/** Write the standing change and post the card. Errors are reported, never thrown into Item Piles. */
async function reportArmouryRequisition(
    buyer: RequisitionBuyer,
    outcome: ArmouryRequisitionOutcome,
    rolls: EvaluatedRoll[],
    userId: string,
    speaker: SpeakerResolver,
): Promise<void> {
    try {
        const update = standingUpdate(outcome);
        if (update !== null) await buyer.update(update);
        const content = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, buildArmouryCardContext(outcome, buyer.system.gameSystem));
        await ChatMessage.create({ author: userId, speaker: speaker(), content, rolls });
    } catch (err) {
        console.error(`${SYSTEM_ID} | armoury requisition report failed`, err);
    }
}

/** Attach the gate to Item Piles' merchant trade. No-op when Item Piles is absent. */
export function registerArmouryRequisitionGate(): void {
    if (game.modules.get('item-piles')?.active !== true) return;
    Hooks.on('item-piles-preCalculateTradeItems', (seller, buyer, prices, userId) =>
        gateArmouryTrade(seller, buyer, prices, userId, () => ChatMessage.getSpeaker({ actor: buyer })),
    );
}
