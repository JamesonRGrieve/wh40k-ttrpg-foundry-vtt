import ConfirmationDialog from '../applications/dialogs/confirmation-dialog.ts';
import { SYSTEM_ID } from '../constants.ts';

const SOCKET_CHANNEL = `system.${SYSTEM_ID}`;
const REQUEST_APPROVAL = 'transaction-approval-request';
const REQUEST_RESULT = 'transaction-request-result';
const PROFILE_FLAG = 'transactionProfile';
const HISTORY_FLAG = 'transactionHistory';

type TransactionMode = 'none' | 'barter' | 'requisition';
type ResourceType = 'throneGelt' | 'requisition';

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
    remainingResource: number;
    remainingInfluence: number;
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
        switch (profile.mode) {
            case 'barter':
                return 'Barter';
            case 'requisition':
                return 'Requisition';
            case 'none':
            default:
                return 'Disabled';
        }
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

    static prepareQuote(params: { buyerActorId: string; sourceActorId: string; itemId: string; quantity?: number; influenceBurn?: number }): TransactionQuote {
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
        const stockAvailable = profile.inventoryAccess === 'virtual' ? true : TransactionManager.#getAvailableQuantity(item) >= quantity;

        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
        const itemSystem = item.system as Record<string, unknown> & {
            cost?: { value?: number | string } | number | string;
            influence?: number | string;
        };
        const baseItemCost = normalizeInt(
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive null guard; schema does not include null but runtime data may
            typeof itemSystem.cost === 'object' && itemSystem.cost !== null ? itemSystem.cost.value ?? 0 : itemSystem.cost ?? 0,
            0,
        );
        const baseCost = Math.max(0, baseItemCost * quantity);
        const adjustments: AdjustmentEntry[] = [];

        if (profile.priceModifierPercent !== 0 && profile.mode === 'barter') {
            const modifier = Math.round((baseCost * profile.priceModifierPercent) / 100);
            adjustments.push({
                key: 'price-modifier',
                label: `${profile.priceModifierPercent > 0 ? 'Merchant markup' : 'Merchant discount'} (${profile.priceModifierPercent}%)`,
                value: modifier,
            });
        }

        let influenceBurn = 0;
        if (profile.mode === 'barter' && influenceBurnRequested > 0) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: buyer.system is untyped Foundry data
            const availableInfluence = normalizeInt((buyer.system as Record<string, unknown>)['influence'] ?? 0, 0);
            influenceBurn = Math.min(influenceBurnRequested, profile.barter.maxInfluenceBurn, availableInfluence);
            if (influenceBurn > 0) {
                const subtotal = baseCost + adjustments.reduce((sum, adjustment) => sum + adjustment.value, 0);
                const discount = Math.round((subtotal * (profile.barter.influenceDiscountPercent * influenceBurn)) / 100) * -1;
                adjustments.push({
                    key: 'influence-burn',
                    label: `Influence burn (${influenceBurn} spent)`,
                    value: discount,
                });
            }
        }

        if (profile.mode === 'requisition' && profile.requisition.costMultiplier !== 1) {
            const modifier = Math.round(baseCost * (profile.requisition.costMultiplier - 1));
            adjustments.push({
                key: 'requisition-multiplier',
                label: `Requisition multiplier (${profile.requisition.costMultiplier}x)`,
                value: modifier,
            });
        }

        const finalCost = Math.max(0, baseCost + adjustments.reduce((sum, adjustment) => sum + adjustment.value, 0));
        const resourceType: ResourceType = profile.mode === 'barter' ? 'throneGelt' : 'requisition';
        // eslint-disable-next-line no-restricted-syntax -- boundary: buyer.system is untyped Foundry data
        const availableResource = normalizeInt((buyer.system as Record<string, unknown>)[resourceType] ?? 0, 0);

        return {
            mode: profile.mode,
            buyer,
            source,
            item,
            quantity,
            resourceType,
            resourceLabel: resourceType === 'throneGelt' ? 'Throne Gelt' : 'Requisition',
            baseCost,
            adjustments,
            finalCost,
            availableResource,
            canAfford: availableResource >= finalCost,
            stockAvailable,
            influenceBurn,
            remainingResource: Math.max(0, availableResource - finalCost),
            // eslint-disable-next-line no-restricted-syntax -- boundary: buyer.system is untyped Foundry actor system data
            remainingInfluence: Math.max(0, normalizeInt((buyer.system as Record<string, unknown> | undefined)?.['influence'] ?? 0, 0) - influenceBurn),
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
        if (!targetGM) throw new Error('No active GM is available to approve the transaction.');

        const request: TransactionRequestPayload = {
            requestId: foundry.utils.randomID(),
            requesterUserId: String(game.user.id),
            targetUserId: String(targetGM.id),
            buyerActorId: params.buyerActorId,
            sourceActorId: params.sourceActorId,
            itemId: params.itemId,
            quantity: quote.quantity,
            influenceBurn: quote.influenceBurn,
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

        const content = TransactionManager.#buildApprovalContent(quote);
        const approved = await ConfirmationDialog.confirm({
            title: `${quote.mode === 'barter' ? 'Barter' : 'Requisition'} Approval`,
            content,
            confirmLabel: 'Approve',
            cancelLabel: 'Reject',
        });

        if (!approved) {
            TransactionManager.#emitResult(request.requesterUserId, 'Transaction request rejected by the GM.', 'warning');
            return;
        }

        try {
            const result = await TransactionManager.commitTransaction(request);
            const message = `${result.buyer.name} received ${result.quantity}x ${result.item.name} for ${result.finalCost} ${result.resourceLabel}.`;
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

    static #buildApprovalContent(quote: TransactionQuote): string {
        const adjustments = quote.adjustments.length
            ? `<ul>${quote.adjustments
                  .map((adjustment) => `<li>${adjustment.label}: ${adjustment.value >= 0 ? '+' : ''}${adjustment.value}</li>`)
                  .join('')}</ul>`
            : '<p>No adjustments.</p>';

        return `
            <div class="standard-form">
                <p><strong>${quote.buyer.name}</strong> is requesting <strong>${quote.quantity}x ${quote.item.name}</strong> from <strong>${
            quote.source.name
        }</strong>.</p>
                <p><strong>Mode:</strong> ${quote.mode === 'barter' ? 'Barter' : 'Requisition'}</p>
                <p><strong>Cost:</strong> ${quote.finalCost} ${quote.resourceLabel}</p>
                ${quote.influenceBurn > 0 ? `<p><strong>Influence burn on completion:</strong> ${quote.influenceBurn}</p>` : ''}
                ${adjustments}
            </div>
        `;
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
            itemSystem.quantity = quote.quantity;
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
