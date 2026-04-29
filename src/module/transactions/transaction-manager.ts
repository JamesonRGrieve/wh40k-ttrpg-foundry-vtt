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
    buyer: Actor;
    source: Actor;
    item: Item;
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

function normalizeInt(value: unknown, fallback = 0): number {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
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
        game.socket.on(SOCKET_CHANNEL, (payload) => {
            void TransactionManager.#onSocketMessage(payload);
        });
    }

    static getProfile(actor: Actor | null | undefined): TransactionProfile {
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

    static async setMode(actor: Actor, mode: TransactionMode): Promise<void> {
        const profile = TransactionManager.getProfile(actor);
        profile.mode = mode;
        await actor.setFlag(SYSTEM_ID, PROFILE_FLAG, profile);
    }

    static isSourceActor(actor: Actor | null | undefined): boolean {
        const profile = TransactionManager.getProfile(actor);
        return profile.mode === 'barter' || profile.mode === 'requisition';
    }

    static getSourceLabel(actor: Actor): string {
        const profile = TransactionManager.getProfile(actor);
        switch (profile.mode) {
            case 'barter':
                return 'Barter';
            case 'requisition':
                return 'Requisition';
            default:
                return 'Disabled';
        }
    }

    static listSourcesForBuyer(buyer: Actor | import('../documents/base-actor.ts').WH40KBaseActor): Actor[] {
        const requiredPermission = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

        return game.actors.contents
            .filter((actor) => actor.id !== buyer.id)
            .filter((actor) => TransactionManager.isSourceActor(actor))
            .filter((actor) => actor.testUserPermission(game.user, requiredPermission))
            .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
    }

    static listItemsForSource(source: Actor | null | undefined): Item[] {
        if (!source) return [];

        return source.items.contents
            .filter((item) => !item.system?.inShipStorage)
            .filter((item) => {
                const quantity = TransactionManager.#getAvailableQuantity(item);
                return quantity > 0;
            })
            .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));
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

        const baseItemCost = normalizeInt(item.system?.cost?.value ?? 0, 0);
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
            const availableInfluence = normalizeInt(buyer.system?.influence ?? 0, 0);
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
        const availableResource = normalizeInt(buyer.system?.[resourceType] ?? 0, 0);

        return {
            mode: profile.mode as Exclude<TransactionMode, 'none'>,
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
            remainingInfluence: Math.max(0, normalizeInt(buyer.system?.influence ?? 0, 0) - influenceBurn),
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
            requesterUserId: game.user.id,
            targetUserId: targetGM.id,
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

    static async notifyRequester(message: string, type: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
        const toast = (foundry.applications?.api as any)?.Toast;
        if (toast && typeof toast[type] === 'function') {
            toast[type](message);
            return;
        }

        const method = type === 'warning' ? 'warn' : type;
        if (ui.notifications && typeof ui.notifications[method] === 'function') {
            ui.notifications[method](message);
        }
    }

    static #getTargetGM(): User | undefined {
        return (game.users as any).activeGM ?? game.users.contents.find((user) => user.isGM && user.active);
    }

    static async #onSocketMessage(payload: Record<string, unknown>): Promise<void> {
        if (!payload || payload.scope !== 'transactions') return;

        if (payload.action === REQUEST_APPROVAL && payload.targetUserId === game.user.id && game.user.isGM) {
            await TransactionManager.#handleApprovalRequest(payload.request);
            return;
        }

        if (payload.action === REQUEST_RESULT && payload.targetUserId === game.user.id) {
            await TransactionManager.notifyRequester(payload.message, payload.resultType ?? 'info');
        }
    }

    static async #handleApprovalRequest(request: TransactionRequestPayload): Promise<void> {
        let quote: TransactionQuote;
        try {
            quote = TransactionManager.prepareQuote(request);
        } catch (error) {
            await TransactionManager.#emitResult(request.requesterUserId, error instanceof Error ? error.message : 'Transaction request failed.', 'error');
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
            await TransactionManager.#emitResult(request.requesterUserId, 'Transaction request rejected by the GM.', 'warning');
            return;
        }

        try {
            const result = await TransactionManager.commitTransaction(request);
            const message = `${result.buyer.name} received ${result.quantity}x ${result.item.name} for ${result.finalCost} ${result.resourceLabel}.`;
            await TransactionManager.#emitResult(request.requesterUserId, message, 'info');
            await TransactionManager.notifyRequester(message, 'info');
        } catch (error) {
            await TransactionManager.#emitResult(request.requesterUserId, error instanceof Error ? error.message : 'Transaction failed.', 'error');
        }
    }

    static async #emitResult(targetUserId: string, message: string, resultType: 'info' | 'warning' | 'error'): Promise<void> {
        if (targetUserId === game.user.id) {
            await TransactionManager.notifyRequester(message, resultType);
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

    static #getAvailableQuantity(item: Item): number {
        const quantity = normalizeInt(item.system?.quantity ?? 1, 1);
        return quantity > 0 ? quantity : 0;
    }

    static async #transferItem(quote: TransactionQuote): Promise<void> {
        const sourceQuantity = TransactionManager.#getAvailableQuantity(quote.item);
        const hasQuantityField = Number.isFinite(Number(quote.item.system?.quantity ?? 1));

        const itemData = quote.item.toObject();
        delete itemData._id;
        if (hasQuantityField) {
            itemData.system.quantity = quote.quantity;
        }

        const stackTarget = TransactionManager.#findStackTarget(quote.buyer, quote.item);
        if (stackTarget && hasQuantityField) {
            await stackTarget.update({
                'system.quantity': normalizeInt(stackTarget.system?.quantity ?? 0, 0) + quote.quantity,
            });
        } else {
            await quote.buyer.createEmbeddedDocuments('Item', [itemData]);
        }

        if (TransactionManager.getProfile(quote.source).inventoryAccess === 'virtual') return;

        if (!hasQuantityField || sourceQuantity <= quote.quantity) {
            await quote.source.deleteEmbeddedDocuments('Item', [quote.item.id]);
            return;
        }

        await quote.item.update({
            'system.quantity': sourceQuantity - quote.quantity,
        });
    }

    static #findStackTarget(actor: Actor, sourceItem: Item): Item | undefined {
        return actor.items.find((candidate) => {
            const candidateQuantity = candidate.system?.quantity;
            const sourceQuantity = sourceItem.system?.quantity;
            if (typeof candidateQuantity !== 'number' || typeof sourceQuantity !== 'number') return false;
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

        const append = async (actor: Actor) => {
            const history = ((actor.getFlag(SYSTEM_ID, HISTORY_FLAG) as Record<string, unknown>[]) ?? []).slice(-19);
            history.push(entry);
            await actor.setFlag(SYSTEM_ID, HISTORY_FLAG, history);
        };

        await append(quote.buyer);
        await append(quote.source);
    }
}
