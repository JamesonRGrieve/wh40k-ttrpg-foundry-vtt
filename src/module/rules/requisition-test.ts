/**
 * Requisition Test math (core.md §"The Requisition Test", p. 142).
 *
 * Target = Influence + availability modifier + scarcity modifier +
 * craftsmanship modifier. The acquisition dialog computes each piece;
 * this module exposes the pure tables and the composition function.
 *
 * Homebrew gating (DH2 vs RAW economy): `WH40KSettings.getRuleset()`
 * controls whether Throne Gelt surfaces alongside the test, NOT the
 * test math. The math is identical in both modes.
 */

export type AvailabilityKey =
    | 'ubiquitous'
    | 'abundant'
    | 'plentiful'
    | 'common'
    | 'average'
    | 'scarce'
    | 'rare'
    | 'veryRare'
    | 'extremelyRare'
    | 'nearUnique'
    | 'unique';

export const AVAILABILITY_MODIFIERS: Record<AvailabilityKey, number> = {
    ubiquitous: 30,
    abundant: 20,
    plentiful: 10,
    common: 0,
    average: 0,
    scarce: -10,
    rare: -20,
    veryRare: -30,
    extremelyRare: -50,
    nearUnique: -70,
    unique: -90,
};

export type CraftsmanshipKey = 'poor' | 'common' | 'good' | 'best';

export const CRAFTSMANSHIP_MODIFIERS: Record<CraftsmanshipKey, number> = {
    poor: 10,
    common: 0,
    good: -10,
    best: -30,
};

export interface RequisitionTestInput {
    influence: number;
    availability: AvailabilityKey;
    craftsmanship?: CraftsmanshipKey;
    /** GM-supplied free-form modifier (e.g. Peer +10, faction discount, etc.). */
    extra?: number;
}

export interface RequisitionTestResult {
    target: number;
    /** Modifier breakdown for chat-card display. */
    breakdown: { label: string; value: number }[];
}

export function getRequisitionTestTarget(input: RequisitionTestInput): RequisitionTestResult {
    const breakdown: { label: string; value: number }[] = [];
    breakdown.push({ label: 'Influence', value: input.influence });
    breakdown.push({ label: `Availability (${input.availability})`, value: AVAILABILITY_MODIFIERS[input.availability] });
    if (input.craftsmanship !== undefined) {
        breakdown.push({ label: `Craftsmanship (${input.craftsmanship})`, value: CRAFTSMANSHIP_MODIFIERS[input.craftsmanship] });
    }
    if (input.extra !== undefined && input.extra !== 0) {
        breakdown.push({ label: 'Other', value: input.extra });
    }
    const target = breakdown.reduce((sum, m) => sum + m.value, 0);
    return { target: Math.max(0, target), breakdown };
}

/**
 * Influence drop on a big failure (core.md p. 142): on a failure of 3+
 * DoF, the warband's Influence drops by 1. Returns the next Influence
 * value (≥ 0) or the input if no drop.
 */
export function applyInfluenceLossOnBigFailure(currentInfluence: number, dof: number): number {
    if (dof >= 3) return Math.max(0, Math.trunc(currentInfluence) - 1);
    return Math.max(0, Math.trunc(currentInfluence));
}
