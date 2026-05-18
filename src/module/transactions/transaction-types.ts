/**
 * Shared transaction value types. Kept separate from transaction-manager.ts so
 * the GM approval dialog can consume them without importing the manager (which
 * imports the dialog) — i.e. this module breaks that import cycle.
 */

export type TransactionMode = 'none' | 'barter' | 'requisition';

/** Plain, serializable projection of a quote for the GM approval dialog. */
export interface TransactionQuoteView {
    buyerName: string;
    sourceName: string;
    itemName: string;
    mode: Exclude<TransactionMode, 'none'>;
    quantity: number;
    baseCost: number;
    finalCost: number;
    resourceLabel: string;
    adjustments: Array<{ label: string; value: number }>;
    influenceBurn: number;
    dispositionAttitude: string | null;
}

export interface TransactionApprovalDecision {
    approved: boolean;
    gmModifierPercent: number;
}
