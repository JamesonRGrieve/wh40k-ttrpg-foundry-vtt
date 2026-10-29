/**
 * Requisition-style test math: a rating (Influence, Logistics, Infamy) plus the
 * item's availability and craftsmanship modifiers plus any GM modifier.
 *
 * The availability / craftsmanship values are the active line's printed
 * ladder (`BaseSystemConfig.acquisitionLadder`, #192) — they differ between
 * lines, so the caller passes the ladder in and this module holds none.
 *
 * Homebrew gating (DH2 vs RAW economy): `WH40KSettings.getRuleset()`
 * controls whether Throne Gelt surfaces alongside the test, NOT the
 * test math. The math is identical in both modes.
 */

import { type AcquisitionLadder, type AvailabilityKey, availabilityTerm, type CraftsmanshipKey } from './acquisition-ladder.ts';

export interface RequisitionTestInput {
    influence: number;
    /** The line's printed ladder. */
    ladder: AcquisitionLadder;
    availability: AvailabilityKey;
    craftsmanship?: CraftsmanshipKey;
    /**
     * The line's bonus for requisitioning a weapon modification as parts to fit
     * personally (DH2 core rules: "+30 bonus to the modification's
     * Availability"); absent when the request is not for parts or the line
     * prints no such bonus.
     */
    modificationParts?: number | undefined;
    /** GM-supplied free-form modifier (e.g. Peer +10, faction discount, etc.). */
    extra?: number;
}

/**
 * Where one component of a requisition target came from. Content-agnostic: the
 * card localizes the source (and the rating's own economy name) at render time,
 * so this pure module carries no player-facing English.
 */
type RequisitionModifierSource = 'rating' | 'availability' | 'craftsmanship' | 'modificationParts' | 'other';

/** One provenance-bearing component of a requisition target. */
export interface RequisitionModifier {
    source: RequisitionModifierSource;
    value: number;
    /** The availability / craftsmanship rating the row came from, for its label. */
    detail?: string | undefined;
}

/**
 * How the test resolves. `test`: roll against `target`. `automatic`: the ladder
 * prints the rating as "Automatic" — passed with no roll. `discretion`: the
 * ladder prints "GM's discretion" — no target can be derived.
 */
export type RequisitionTestResult =
    | {
          kind: 'test';
          target: number;
          /** Modifier breakdown for chat-card display — one row per component, never a lumped total. */
          breakdown: RequisitionModifier[];
      }
    | { kind: 'automatic' }
    | { kind: 'discretion' };

export function getRequisitionTestTarget(input: RequisitionTestInput): RequisitionTestResult {
    const availability = availabilityTerm(input.ladder, input.availability);
    if (availability.kind !== 'modifier') return { kind: availability.kind };

    const breakdown: RequisitionModifier[] = [];
    breakdown.push({ source: 'rating', value: input.influence });
    breakdown.push({ source: 'availability', value: availability.value, detail: input.availability });
    // A line whose test takes no craftsmanship modifier (ladder.craftsmanship null) prints no row.
    const craftsmanship = input.ladder.craftsmanship;
    if (input.craftsmanship !== undefined && craftsmanship !== null) {
        breakdown.push({ source: 'craftsmanship', value: craftsmanship[input.craftsmanship], detail: input.craftsmanship });
    }
    if (input.modificationParts !== undefined) {
        breakdown.push({ source: 'modificationParts', value: input.modificationParts });
    }
    if (input.extra !== undefined && input.extra !== 0) {
        breakdown.push({ source: 'other', value: input.extra });
    }
    const target = breakdown.reduce((sum, m) => sum + m.value, 0);
    return { kind: 'test', target: Math.max(0, target), breakdown };
}
