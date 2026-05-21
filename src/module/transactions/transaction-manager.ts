import TransactionApprovalDialog from '../applications/dialogs/transaction-approval-dialog.ts';
import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { EventTracker } from '../managers/event-tracker.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import type { TransactionMode, TransactionQuoteView } from './transaction-types.ts';

const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
const REQUEST_APPROVAL = 'transaction-approval-request';
const REQUEST_RESULT = 'transaction-request-result';
const PROFILE_FLAG = 'transactionProfile';
const HISTORY_FLAG = 'transactionHistory';

type ResourceType = 'throneGelt' | 'requisition' | 'influence';

/**
 * Disposition (from the campaign relationship tracker) → price modifier
 * percent. Positive raises the price for an unfriendly source; negative is the
 * friendly-source discount. Attitude strings match EventTracker's palette.
 */
const DISPOSITION_PRICE_PERCENT: Record<string, number> = {
    'ally': -15,
    'friendly': -15,
    'helpful': -15,
    'cautious-neutral': 5,
    'neutral': 0,
    'wary': 15,
    'rival': 20,
    'enemy': 35,
    'hostile': 35,
    'enraged': 60,
    'missing': 0,
};

interface BuyerResourceView {
    gameSystem?: string;
    influence?: number;
    requisition?: number;
    throneGelt?: number;
}

interface ResolvedPayment {
    resourceType: ResourceType;
    resourceLabel: string;
    allowInfluenceBurn: boolean;
}

interface TransactionProfile {
    mode: TransactionMode;
    inventoryAccess: 'stocked' | 'virtual';
    priceModifierPercent: number;
    barter: {
        maxInfluenceBurn: number;
        influenceDiscountPercent: number;
    };
    requisition: {
        costMultiplier: number;
    };
}

interface AdjustmentEntry {
    key: string;
    label: string;
    value: number;
}

interface TransactionQuote {
    mode: Exclude<TransactionMode, 'none'>;
    buyer: Actor.Implementation;
    source: Actor.Implementation;
    item: Item.Implementation;
    quantity: number;
    resourceType: ResourceType;
    resourceLabel: string;
    baseCost: number;
    adjustments: AdjustmentEntry[];
    finalCost: number;
    availableResource: number;
    canAfford: boolean;
    stockAvailable: boolean;
    influenceBurn: number;
    allowInfluenceBurn: boolean;
    remainingResource: number;
    remainingInfluence: number;
    gmModifierPercent: number;
    dispositionAttitude: string | null;
}

interface TransactionRequestPayload {
    requestId: string;
    requesterUserId: string;
    targetUserId: string;
    buyerActorId: string;
    sourceActorId: string;
    itemId: string;
    quantity: number;
    influenceBurn: number;
    gmModifierPercent: number;
}

interface SocketPayload {
    scope: string;
    action: string;
    targetUserId: string;
    request?: TransactionRequestPayload;
    message?: string;
    resultType?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: socket payloads from Foundry are untyped
    [key: string]: unknown;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: normalizeInt accepts untyped Foundry data values
function normalizeInt(value: unknown, fallback = 0): number {
    const strValue = value !== null && value !== undefined && typeof value !== 'object' ? (value as string | number | boolean | bigint | symbol) : null;
    const str = strValue !== null ? String(strValue) : String(fallback);
    const parsed = Number.parseInt(str, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Read the buyer's currency fields. TransactionManager operates on the base
 * Actor.Implementation; the concrete per-system character schema carries these
 * fields, so this is the single typed boundary rather than scattered casts.
 */
function readBuyerResources(buyer: Actor.Implementation): BuyerResourceView {
    // eslint-disable-next-line no-restricted-syntax -- boundary: base Actor.Implementation system is a per-system union; currency fields live on the character schema
    return buyer.system as unknown as BuyerResourceView;
}

// biome-ignore lint/complexity/noStaticOnlyClass: stable API surface with private static state and socket integration
export class TransactionManager {
    static #initialized = false;
    static DEFAULT_PROFILE: TransactionProfile = {
        mode: 'none',
        inventoryAccess: 'stocked',
        priceModifierPercent: 0,
        barter: {
            maxInfluenceBurn: 3,
            influenceDiscountPercent: 10,
        },
        requisition: {
            costMultiplier: 1,
        },
    };

    static initialize(): void {
        if (TransactionManager.#initialized) return;
        TransactionManager.#initialized = true;
        game.socket.on(SOCKET_CHANNEL, (payload: SocketPayload) => {
            void TransactionManager.#onSocketMessage(payload);
        });
    }

    static getProfile(actor: Actor.Implementation | null | undefined): TransactionProfile {
        if (!actor) return foundry.utils.deepClone(TransactionManager.DEFAULT_PROFILE);

        const stored = (actor.getFlag(SYSTEM_ID, PROFILE_FLAG) as Partial<TransactionProfile> | undefined) ?? {};
        return {
            ...foundry.utils.deepClone(TransactionManager.DEFAULT_PROFILE),
            ...stored,
            barter: {
                ...TransactionManager.DEFAULT_PROFILE.barter,
                ...(stored.barter ?? {}),
            },
            requisition: {
                ...TransactionManager.DEFAULT_PROFILE.requisition,
                ...(stored.requisition ?? {}),
            },
        };
    }

    static async setMode(actor: Actor.Implementation, mode: TransactionMode): Promise<void> {
        const profile = TransactionManager.getProfile(actor);
        profile.mode = mode;
        await actor.setFlag(SYSTEM_ID, PROFILE_FLAG, profile);
    }

    static isSourceActor(actor: Actor.Implementation | null | undefined): boolean {
        const profile = TransactionManager.getProfile(actor);
        return profile.mode === 'barter' || profile.mode === 'requisition';
    }

    static getSourceLabel(actor: Actor.Implementation): string {
        const profile = TransactionManager.getProfile(actor);
        if (profile.mode === 'barter') return 'Barter';
        if (profile.mode === 'requisition') return 'Requisition';
        return 'Disabled';
    }

    static listSourcesForBuyer(buyer: Actor.Implementation): Actor.Implementation[] {
        const requiredPermission = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

        return game.actors.contents
            .filter((actor) => actor.id !== buyer.id)
            .filter((actor) => TransactionManager.isSourceActor(actor))
            .filter((actor) => actor.testUserPermission(game.user, requiredPermission))
            .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
    }

    static listItemsForSource(source: Actor.Implementation | null | undefined): Item.Implementation[] {
        if (!source) return [];

        return (
            source.items.contents
                // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
                .filter((item) => (item.system as Record<string, unknown>)['inShipStorage'] !== true)
                .filter((item) => {
                    const quantity = TransactionManager.#getAvailableQuantity(item);
                    return quantity > 0;
                })
                .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang))
        );
    }

    /**
     * Resolve which currency the buyer pays in and whether influence may be
     * burned for a preferential rate. Driven by the DH2e economy ruleset
     * (`dh2-ruleset`): in homebrew DH2e (and DH1 / other gelt economies) barter
     * spends Throne Gelt and Influence can be burned for a discount; in RAW
     * DH2e there is no Throne Gelt, so barter spends Influence itself and there
     * is nothing to burn. Requisition always spends Requisition.
     */
    static #resolvePayment(buyer: Actor.Implementation, mode: Exclude<TransactionMode, 'none'>): ResolvedPayment {
        if (mode === 'requisition') {
            return { resourceType: 'requisition', resourceLabel: t('WH40K.Trade.Resource.requisition'), allowInfluenceBurn: false };
        }

        const resources = readBuyerResources(buyer);
        const isDh2 = resources.gameSystem === 'dh2e';
        const homebrew = WH40KSettings.isHomebrew();
        const hasInfluencePool = typeof resources.influence === 'number';

        if (isDh2 && !homebrew) {
            return { resourceType: 'influence', resourceLabel: t('WH40K.Trade.Resource.influence'), allowInfluenceBurn: false };
        }

        return {
            resourceType: 'throneGelt',
            resourceLabel: t('WH40K.Trade.Resource.throneGelt'),
            allowInfluenceBurn: hasInfluencePool,
        };
    }

    /**
     * The source NPC's current attitude toward this buyer, from the campaign
     * relationship tracker. Prefers a per-character disposition, falling back
     * to the party-wide entry. Returns null when no tracker data exists.
     */
    static #getDispositionAttitude(buyer: Actor.Implementation, source: Actor.Implementation): string | null {
        let states: ReturnType<typeof EventTracker.computeCharacterStates>;
        try {
            states = EventTracker.computeCharacterStates();
        } catch {
            return null;
        }

        const charState = states[source.name];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: index access may be undefined at runtime
        if (charState === undefined) return null;
        const dispositions = charState.dispositions;

        const direct = Object.hasOwn(dispositions, buyer.name) ? dispositions[buyer.name] : undefined;
        const party = Object.hasOwn(dispositions, 'party') ? dispositions['party'] : undefined;
        const disposition = direct ?? party;
        if (disposition === undefined) return null;

        return disposition.attitude !== '' ? disposition.attitude : null;
    }

    /** Disposition-driven price adjustment + the resolved attitude (null when no tracker data). */
    static #dispositionAdjustment(
        buyer: Actor.Implementation,
        source: Actor.Implementation,
        subtotal: number,
    ): { entry: AdjustmentEntry | null; attitude: string | null } {
        const attitude = TransactionManager.#getDispositionAttitude(buyer, source);
        if (attitude === null) return { entry: null, attitude: null };

        const percent = DISPOSITION_PRICE_PERCENT[attitude] ?? 0;
        if (percent === 0) return { entry: null, attitude };

        return {
            entry: { key: 'disposition', label: t('WH40K.Trade.Adjust.Disposition', { attitude }), value: Math.round((subtotal * percent) / 100) },
            attitude,
        };
    }

    /** Influence-burn discount: clamps the request to the profile max and the buyer's pool. */
    static #influenceBurnAdjustment(
        buyer: Actor.Implementation,
        profile: TransactionProfile,
        allowInfluenceBurn: boolean,
        requested: number,
        subtotal: number,
    ): { influenceBurn: number; entry: AdjustmentEntry | null } {
        if (profile.mode !== 'barter' || !allowInfluenceBurn || requested <= 0) return { influenceBurn: 0, entry: null };

        const available = normalizeInt(readBuyerResources(buyer).influence ?? 0, 0);
        const influenceBurn = Math.min(requested, profile.barter.maxInfluenceBurn, available);
        if (influenceBurn <= 0) return { influenceBurn: 0, entry: null };

        const discount = Math.round((subtotal * (profile.barter.influenceDiscountPercent * influenceBurn)) / 100) * -1;
        return {
            influenceBurn,
            entry: { key: 'influence-burn', label: t('WH40K.Trade.Adjust.InfluenceBurn', { count: influenceBurn }), value: discount },
        };
    }

    /** Project a live quote into a plain, serializable view for the approval dialog. */
    static toQuoteView(quote: TransactionQuote): TransactionQuoteView {
        return {
            buyerName: quote.buyer.name,
            sourceName: quote.source.name,
            itemName: quote.item.name,
            mode: quote.mode,
            quantity: quote.quantity,
            baseCost: quote.baseCost,
            finalCost: quote.finalCost,
            resourceLabel: quote.resourceLabel,
            adjustments: quote.adjustments.map((adjustment) => ({ label: adjustment.label, value: adjustment.value })),
            influenceBurn: quote.influenceBurn,
            dispositionAttitude: quote.dispositionAttitude,
        };
    }

    /**
     * Resolve a source item's base cost. PhysicalItemTemplate.cost is a
     * per-system SchemaField; the slot varies by gameSystem (dh1.throneGelt,
     * dh2.influence, rt.profitFactor, dw/ow.requisition, bc.infamy). The legacy
     * `cost: number` and `cost.value` shapes are kept as fallbacks for old data.
     */
    static #resolveBaseItemCost(item: Item.Implementation): number {
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data; cost is a per-system SchemaField
        const itemSystem = item.system as {
            cost?:
                | number
                | string
                | {
                      value?: number | string;
                      dh1?: { throneGelt?: number | null };
                      dh2?: { influence?: number | null; homebrew?: { throneGelt?: number | null; requisition?: number | null } };
                      rt?: { profitFactor?: number | null };
                      dw?: { requisition?: number | null };
                      ow?: { requisition?: number | null };
                      bc?: { infamy?: number | null };
                  };
            gameSystem?: string;
        };
        const cost = itemSystem.cost;
        if (typeof cost === 'number' || typeof cost === 'string') return normalizeInt(cost, 0);
        if (!cost) return 0;

        const perSystem: Record<string, number | null | undefined> = {
            dh1: cost.dh1?.throneGelt,
            dh2: cost.dh2?.influence,
            rt: cost.rt?.profitFactor,
            dw: cost.dw?.requisition,
            ow: cost.ow?.requisition,
            bc: cost.bc?.infamy,
        };
        const sys = itemSystem.gameSystem ?? '';
        return normalizeInt(perSystem[sys] ?? cost.value ?? 0, 0);
    }

    static prepareQuote(params: {
        buyerActorId: string;
        sourceActorId: string;
        itemId: string;
        quantity?: number;
        influenceBurn?: number;
        gmModifierPercent?: number;
    }): TransactionQuote {
        const buyer = game.actors.get(params.buyerActorId);
        const source = game.actors.get(params.sourceActorId);

        if (!buyer) throw new Error('Buyer actor not found.');
        if (!source) throw new Error('Source actor not found.');

        const profile = TransactionManager.getProfile(source);
        if (profile.mode === 'none') {
            throw new Error('This actor is not configured as a barter or requisition source.');
        }

        const item = source.items.get(params.itemId);
        if (!item) throw new Error('Source item not found.');

        const quantity = Math.max(1, normalizeInt(params.quantity, 1));
        const influenceBurnRequested = Math.max(0, normalizeInt(params.influenceBurn, 0));
        const gmModifierPercent = normalizeInt(params.gmModifierPercent, 0);
        const stockAvailable = profile.inventoryAccess === 'virtual' ? true : TransactionManager.#getAvailableQuantity(item) >= quantity;

        const baseItemCost = TransactionManager.#resolveBaseItemCost(item);
        const baseCost = Math.max(0, baseItemCost * quantity);
        const adjustments: AdjustmentEntry[] = [];
        const subtotal = (): number => baseCost + adjustments.reduce((sum, adjustment) => sum + adjustment.value, 0);

        const payment = TransactionManager.#resolvePayment(buyer, profile.mode);

        if (profile.priceModifierPercent !== 0 && profile.mode === 'barter') {
            const modifier = Math.round((baseCost * profile.priceModifierPercent) / 100);
            adjustments.push({
                key: 'price-modifier',
                label:
                    profile.priceModifierPercent > 0
                        ? t('WH40K.Trade.Adjust.MerchantMarkup', { percent: profile.priceModifierPercent })
                        : t('WH40K.Trade.Adjust.MerchantDiscount', { percent: profile.priceModifierPercent }),
                value: modifier,
            });
        }

        const disposition = TransactionManager.#dispositionAdjustment(buyer, source, subtotal());
        if (disposition.entry !== null) adjustments.push(disposition.entry);

        if (gmModifierPercent !== 0) {
            adjustments.push({
                key: 'gm-modifier',
                label: t('WH40K.Trade.Adjust.GMModifier', { percent: gmModifierPercent }),
                value: Math.round((subtotal() * gmModifierPercent) / 100),
            });
        }

        const burn = TransactionManager.#influenceBurnAdjustment(buyer, profile, payment.allowInfluenceBurn, influenceBurnRequested, subtotal());
        if (burn.entry !== null) adjustments.push(burn.entry);
        const influenceBurn = burn.influenceBurn;

        if (profile.mode === 'requisition' && profile.requisition.costMultiplier !== 1) {
            const modifier = Math.round(baseCost * (profile.requisition.costMultiplier - 1));
            adjustments.push({
                key: 'requisition-multiplier',
                label: t('WH40K.Trade.Adjust.RequisitionMultiplier', { multiplier: profile.requisition.costMultiplier }),
                value: modifier,
            });
        }

        const finalCost = Math.max(0, subtotal());
        const resourceType = payment.resourceType;
        const resources = readBuyerResources(buyer);
        const availableResource = normalizeInt(resources[resourceType] ?? 0, 0);

        return {
            mode: profile.mode,
            buyer,
            source,
            item,
            quantity,
            resourceType,
            resourceLabel: payment.resourceLabel,
            baseCost,
            adjustments,
            finalCost,
            availableResource,
            canAfford: availableResource >= finalCost,
            stockAvailable,
            influenceBurn,
            allowInfluenceBurn: payment.allowInfluenceBurn,
            remainingResource: Math.max(0, availableResource - finalCost),
            remainingInfluence: Math.max(0, normalizeInt(resources.influence ?? 0, 0) - influenceBurn),
            gmModifierPercent,
            dispositionAttitude: disposition.attitude,
        };
    }

    static async submitRequest(params: {
        buyerActorId: string;
        sourceActorId: string;
        itemId: string;
        quantity?: number;
        influenceBurn?: number;
    }): Promise<void> {
        const quote = TransactionManager.prepareQuote(params);
        if (!quote.stockAvailable) {
            throw new Error('The requested item is no longer available in that quantity.');
        }
        if (!quote.canAfford) {
            throw new Error(`Not enough ${quote.resourceLabel} for this transaction.`);
        }

        const targetGM = TransactionManager.#getTargetGM();
        if (!targetGM) throw new Error(t('WH40K.Trade.NoGM'));

        const request: TransactionRequestPayload = {
            requestId: foundry.utils.randomID(),
            requesterUserId: String(game.user.id),
            targetUserId: String(targetGM.id),
            buyerActorId: params.buyerActorId,
            sourceActorId: params.sourceActorId,
            itemId: params.itemId,
            quantity: quote.quantity,
            influenceBurn: quote.influenceBurn,
            // The buyer never sets a GM modifier; the GM applies it at approval.
            gmModifierPercent: 0,
        };

        if (targetGM.id === game.user.id && game.user.isGM) {
            await TransactionManager.#handleApprovalRequest(request);
            return;
        }

        game.socket.emit(SOCKET_CHANNEL, {
            scope: 'transactions',
            action: REQUEST_APPROVAL,
            targetUserId: targetGM.id,
            request,
        });
    }

    static async commitTransaction(request: TransactionRequestPayload): Promise<TransactionQuote> {
        const quote = TransactionManager.prepareQuote(request);
        if (!quote.stockAvailable) throw new Error('The requested stock is no longer available.');
        if (!quote.canAfford) throw new Error(`The buyer no longer has enough ${quote.resourceLabel}.`);

        const buyerUpdates: Record<string, number> = {};
        buyerUpdates[`system.${quote.resourceType}`] = quote.remainingResource;
        if (quote.influenceBurn > 0) {
            buyerUpdates['system.influence'] = quote.remainingInfluence;
        }
        await quote.buyer.update(buyerUpdates);

        await TransactionManager.#transferItem(quote);
        await TransactionManager.#appendHistory(quote);

        return quote;
    }

    static notifyRequester(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 Toast API has no type definitions
        const toastApi = foundry.applications.api as unknown as Record<string, Record<string, (msg: string) => void> | undefined>;
        const toast = toastApi['Toast'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess guard for strict tsconfig
        const toastFn = toast?.[type] as ((msg: string) => void) | undefined;
        if (toastFn !== undefined) {
            toastFn(message);
            return;
        }

        const method = type === 'warning' ? 'warn' : type;
        // eslint-disable-next-line no-restricted-syntax -- boundary: ui.notifications typed interface; cast to generic for dynamic method access
        const notifFn = (ui.notifications as unknown as Record<string, ((msg: string) => void) | undefined> | null | undefined)?.[method];
        if (notifFn !== undefined) {
            notifFn(message);
        }
    }

    static #getTargetGM(): User | undefined {
        return (game.users as { activeGM?: User }).activeGM ?? game.users.contents.find((user) => user.isGM && user.active);
    }

    static async #onSocketMessage(payload: SocketPayload): Promise<void> {
        if (payload.scope !== 'transactions') return;

        if (payload.action === REQUEST_APPROVAL && payload.targetUserId === game.user.id && game.user.isGM) {
            await TransactionManager.#handleApprovalRequest(payload.request as TransactionRequestPayload);
            return;
        }

        if (payload.action === REQUEST_RESULT && payload.targetUserId === game.user.id) {
            TransactionManager.notifyRequester(String(payload.message), (payload.resultType as 'info' | 'warning' | 'error' | undefined) ?? 'info');
        }
    }

    static async #handleApprovalRequest(request: TransactionRequestPayload): Promise<void> {
        let quote: TransactionQuote;
        try {
            quote = TransactionManager.prepareQuote(request);
        } catch (error) {
            TransactionManager.#emitResult(request.requesterUserId, error instanceof Error ? error.message : 'Transaction request failed.', 'error');
            return;
        }

        const decision = await TransactionApprovalDialog.show(TransactionManager.toQuoteView(quote));

        if (!decision.approved) {
            TransactionManager.#emitResult(request.requesterUserId, t('WH40K.Trade.Result.Rejected'), 'warning');
            return;
        }

        try {
            const result = await TransactionManager.commitTransaction({ ...request, gmModifierPercent: decision.gmModifierPercent });
            const message = t('WH40K.Trade.Result.Received', {
                buyer: result.buyer.name,
                quantity: result.quantity,
                item: result.item.name,
                cost: result.finalCost,
                resource: result.resourceLabel,
            });
            TransactionManager.#emitResult(request.requesterUserId, message, 'info');
            TransactionManager.notifyRequester(message, 'info');
        } catch (error) {
            TransactionManager.#emitResult(request.requesterUserId, error instanceof Error ? error.message : 'Transaction failed.', 'error');
        }
    }

    static #emitResult(targetUserId: string, message: string, resultType: 'info' | 'warning' | 'error'): void {
        if (targetUserId === game.user.id) {
            TransactionManager.notifyRequester(message, resultType);
            return;
        }

        game.socket.emit(SOCKET_CHANNEL, {
            scope: 'transactions',
            action: REQUEST_RESULT,
            targetUserId,
            message,
            resultType,
        });
    }

    static #getAvailableQuantity(item: Item.Implementation): number {
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
        const quantity = normalizeInt((item.system as Record<string, unknown>)['quantity'] ?? 1, 1);
        return quantity > 0 ? quantity : 0;
    }

    static async #transferItem(quote: TransactionQuote): Promise<void> {
        const sourceQuantity = TransactionManager.#getAvailableQuantity(quote.item);
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
        const hasQuantityField = Number.isFinite(Number((quote.item.system as Record<string, unknown>)['quantity'] ?? 1));

        // eslint-disable-next-line no-restricted-syntax -- boundary: toObject() returns untyped Foundry item source data
        const { _id: _ignoredId, ...itemData } = quote.item.toObject() as Record<string, unknown> & { system?: Record<string, unknown> };
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- ??= blocked by no-restricted-syntax; explicit if-assignment is correct
        if (itemData.system === undefined) itemData.system = {};
        const itemSystem = itemData.system;
        if (hasQuantityField) {
            itemSystem['quantity'] = quote.quantity;
        }

        const stackTarget = TransactionManager.#findStackTarget(quote.buyer, quote.item);
        if (stackTarget && hasQuantityField) {
            /* eslint-disable no-restricted-syntax -- boundary: stackTarget.system is untyped Foundry data */
            const stackQty = normalizeInt((stackTarget.system as Record<string, unknown>)['quantity'] ?? 0, 0);
            /* eslint-enable no-restricted-syntax */
            await stackTarget.update({ 'system.quantity': stackQty + quote.quantity });
        } else {
            // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments param type requires cast
            await quote.buyer.createEmbeddedDocuments('Item', [itemData] as unknown as Parameters<typeof quote.buyer.createEmbeddedDocuments<'Item'>>[1]);
        }

        if (TransactionManager.getProfile(quote.source).inventoryAccess === 'virtual') return;

        if (!hasQuantityField || sourceQuantity <= quote.quantity) {
            if (quote.item.id === null || quote.item.id === '') return;
            await quote.source.deleteEmbeddedDocuments('Item', [quote.item.id]);
            return;
        }

        await quote.item.update({
            'system.quantity': sourceQuantity - quote.quantity,
        });
    }

    static #findStackTarget(actor: Actor.Implementation, sourceItem: Item.Implementation): Item.Implementation | undefined {
        /* eslint-disable no-restricted-syntax -- boundary: item.system is untyped Foundry data */
        const sourceQty = (sourceItem.system as Record<string, unknown>)['quantity'];
        /* eslint-enable no-restricted-syntax */
        return actor.items.find((candidate) => {
            /* eslint-disable no-restricted-syntax -- boundary: candidate.system is untyped Foundry data */
            const candidateQuantity = (candidate.system as Record<string, unknown>)['quantity'];
            /* eslint-enable no-restricted-syntax */
            if (typeof candidateQuantity !== 'number' || typeof sourceQty !== 'number') return false;
            if (candidate.type !== sourceItem.type) return false;
            if (candidate.name !== sourceItem.name) return false;
            return true;
        });
    }

    static async #appendHistory(quote: TransactionQuote): Promise<void> {
        const entry = {
            timestamp: Date.now(),
            buyer: quote.buyer.name,
            source: quote.source.name,
            item: quote.item.name,
            mode: quote.mode,
            quantity: quote.quantity,
            finalCost: quote.finalCost,
            resourceType: quote.resourceType,
            influenceBurn: quote.influenceBurn,
        };

        const append = async (actor: Actor.Implementation): Promise<void> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: getFlag returns untyped Foundry flag data
            const history = ((actor.getFlag(SYSTEM_ID, HISTORY_FLAG) as Record<string, unknown>[] | null | undefined) ?? []).slice(-19);
            history.push(entry);
            await actor.setFlag(SYSTEM_ID, HISTORY_FLAG, history);
        };

        await append(quote.buyer);
        await append(quote.source);
    }
}
