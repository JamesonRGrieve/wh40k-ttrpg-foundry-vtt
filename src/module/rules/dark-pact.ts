/**
 * Dark Pacts (beyond.md p. 72).
 *
 * A pact is a deal struck with a daemon: the warband / acolyte gains
 * Boons in exchange for Banes. Each pact is tracked per (actor, pact)
 * with a Disposition value that shifts based on whether the actor
 * honours their payment, and a Subtlety penalty if the pact is
 * discovered.
 */

export type PactDisposition = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export interface PactDefinition {
    id: string;
    boon: string;
    bane: string;
    /** Starting disposition the daemon holds toward the pact-maker. */
    initialDisposition: PactDisposition;
    /** Subtlety penalty applied to the warband if this pact is discovered. */
    discoverySubtletyPenalty: number;
}

export interface PactRecord {
    definition: PactDefinition;
    /** Whether this pact is publicly known (i.e. discovered). */
    discovered: boolean;
    /** Current disposition value. */
    disposition: PactDisposition;
    /** Whether the most recent payment was made. */
    paymentCurrent: boolean;
}

/** Adjust pact disposition by ±n, clamped at the ±3 range. */
export function adjustPactDisposition(current: PactDisposition, delta: number): PactDisposition {
    const next = Math.max(-3, Math.min(3, current + Math.trunc(delta)));
    return next as PactDisposition;
}

/** Subtlety hit on discovery. Caller pipes through `applySubtlety(-n)`. */
export function getDiscoverySubtletyHit(pact: PactDefinition): number {
    return Math.max(0, Math.trunc(pact.discoverySubtletyPenalty));
}
