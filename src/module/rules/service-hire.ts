/**
 * Hiring a service: the content-agnostic plumbing behind the Services
 * requisition dialog.
 *
 * A service is a `gear` document in one of its line's services packs. Its
 * availability rating sets the Influence Requisition target through the line's
 * acquisition ladder (#68, #192); its `system.hire` block says what hiring it
 * costs beyond that — the threat it draws and the Subtlety it changes by. Every
 * value is authored on the document (Direction #7); this module only projects
 * and resolves.
 */

import { type AcquisitionLadder, type AvailabilityKey, normaliseAvailability } from './acquisition-ladder.ts';
import { getRequisitionTestTarget, type RequisitionTestResult } from './requisition-test.ts';

/** The part of a service document this module reads. */
export interface ServiceDocLike {
    readonly uuid: string;
    readonly name: string;
    readonly system: {
        readonly availability?: string | null | undefined;
        readonly hire?: { readonly threatLevel?: number | undefined; readonly subtlety?: number | undefined } | undefined;
    };
}

/** A service as the dialog offers it. */
export interface ServiceOffer {
    readonly uuid: string;
    readonly name: string;
    /** The document's availability rating, or null when it names none the ladder knows. */
    readonly availability: AvailabilityKey | null;
    readonly threatLevel: number;
    /** The Subtlety change on hire (negative = lost). */
    readonly subtlety: number;
}

/** Project a service document, in name order when listed. */
export function serviceOffer(doc: ServiceDocLike): ServiceOffer {
    return {
        uuid: doc.uuid,
        name: doc.name,
        availability: normaliseAvailability(doc.system.availability),
        threatLevel: Math.max(0, Math.trunc(doc.system.hire?.threatLevel ?? 0)),
        subtlety: Math.trunc(doc.system.hire?.subtlety ?? 0),
    };
}

/** Every offer, sorted by name. */
export function serviceOffers(docs: Iterable<ServiceDocLike>): ServiceOffer[] {
    return [...docs].map(serviceOffer).sort((a, b) => a.name.localeCompare(b.name));
}

/** The Influence Requisition test for hiring `offer`, or null when its availability is unknown. */
export function serviceRequisition(influence: number, ladder: AcquisitionLadder, offer: ServiceOffer): RequisitionTestResult | null {
    if (offer.availability === null) return null;
    return getRequisitionTestTarget({ influence, ladder, availability: offer.availability });
}

/** A d100 roll's outcome against `target`: success, and degrees of success / failure (at least 1). */
export function hireOutcome(roll: number, target: number): { success: boolean; dos: number; dof: number } {
    const success = roll <= target;
    const margin = Math.floor(Math.abs(roll - target) / 10);
    return { success, dos: success ? Math.max(1, margin) : 0, dof: success ? 0 : Math.max(1, margin) };
}
