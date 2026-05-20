/**
 * @file Pure helpers for BC Alignment derivation from advance tallies.
 *
 * The Alignment system (`bc/core/core.md` :2549 ff.) works by counting
 * how many advances a character has purchased under each Dark God's
 * affiliation and comparing tallies at each 10-Corruption-Point
 * threshold (`core.md` :2569). When a single god leads the next-highest
 * by `BC_ALIGNMENT_SWITCH_THRESHOLD` advances, the character switches
 * Alignment.
 *
 * Caveats encoded here:
 * - Unaligned advances are never tallied (`core.md` :2561).
 * - Archetype-granted advances are excluded (`core.md` :2561, "any
 *   advances granted as part of the Archetype do not count toward
 *   Alignment"). Callers pass `fromArchetype: true` to skip them.
 * - The 10-CP re-check is gated on actually CROSSING a threshold since
 *   the last check; `shouldRecheckAlignment` exposes that gate.
 *
 * Pure module: no Foundry imports, no actor coupling. Consumers are
 * `BCSystemConfig` (current-alignment derivation) and any UI panel that
 * needs to show the tally.
 */

import { BC_ALIGNMENT_CHECK_CP_INTERVAL, BC_ALIGNMENT_SWITCH_THRESHOLD, alignmentBlocksPsyker } from '../config/game-systems/bc-advancement-config.ts';
import type { ChaosAlignment } from '../config/game-systems/types.ts';

/**
 * A single advance entry in a character's chaosAdvancements log. Stored
 * verbatim on `system.chaosAdvancements`; the BC config / derivation
 * helpers read it.
 */
export interface ChaosAdvanceEntry {
    /** What kind of advance this is. Categorical, not a content-bound enum. */
    category: 'characteristic' | 'skill' | 'talent' | 'psychic-power' | 'infamy';
    /** Stable advance identifier (charKey, skillKey, talent UUID, etc.). */
    key: string;
    /** XP cost paid (audit trail; not used for tally). */
    xpCost: number;
    /** Affiliation of this advance for Alignment-tally purposes. */
    alignment: ChaosAlignment;
    /** Whether this advance came from the character's Archetype. */
    fromArchetype: boolean;
}

/** Tally of advances per Dark God (excludes 'unaligned'). */
export type AlignmentTally = Record<Exclude<ChaosAlignment, 'unaligned'>, number>;

const DARK_GODS: ReadonlyArray<Exclude<ChaosAlignment, 'unaligned'>> = ['khorne', 'nurgle', 'slaanesh', 'tzeentch'];

/**
 * Tally chaos-affiliated advances per god. Excludes:
 *   - 'unaligned' advances (no affiliation),
 *   - advances marked `fromArchetype: true` (RAW exclusion).
 */
export function tallyAdvancesByAlignment(advances: ReadonlyArray<ChaosAdvanceEntry>): AlignmentTally {
    const tally: AlignmentTally = { khorne: 0, nurgle: 0, slaanesh: 0, tzeentch: 0 };
    for (const advance of advances) {
        if (advance.fromArchetype) continue;
        if (advance.alignment === 'unaligned') continue;
        tally[advance.alignment] += 1;
    }
    return tally;
}

/**
 * Derive a character's current Alignment from their advance tally.
 *
 * RAW rule (`core.md` :2559): If one god's tally exceeds the next-highest
 * by `BC_ALIGNMENT_SWITCH_THRESHOLD` (5) or more, the character is
 * Aligned to that god. Otherwise, Unaligned.
 *
 * Ties at the top are explicitly Unaligned (no god has a 5-advance lead).
 */
export function deriveAlignmentFromTally(tally: AlignmentTally): ChaosAlignment {
    const entries = DARK_GODS.map((god) => ({ god, count: tally[god] }));
    entries.sort((a, b) => b.count - a.count);
    const leader = entries[0];
    const runnerUp = entries[1];
    if (leader === undefined || runnerUp === undefined) return 'unaligned';
    if (leader.count - runnerUp.count >= BC_ALIGNMENT_SWITCH_THRESHOLD) return leader.god;
    return 'unaligned';
}

/**
 * Determine whether an alignment re-check should fire now, given the
 * character's current Corruption Points and the last CP value at which
 * a check was performed (or 0 if never).
 *
 * RAW rule (`core.md` :2569): re-check when the character crosses the
 * next 10-CP threshold. This is a pure predicate; the caller is
 * responsible for invoking `deriveAlignmentFromTally` and persisting
 * the new `alignmentCheckpoint` afterward.
 */
export function shouldRecheckAlignment(corruption: number, lastCheckpoint: number): boolean {
    const currentThreshold = Math.floor(corruption / BC_ALIGNMENT_CHECK_CP_INTERVAL) * BC_ALIGNMENT_CHECK_CP_INTERVAL;
    return currentThreshold > lastCheckpoint;
}

/**
 * Compute the next checkpoint value to persist after a re-check fires.
 * Always rounds DOWN to the threshold the character has crossed, so a
 * character with 27 CP crossing 20 records checkpoint=20 (not 27); the
 * next re-check then fires when they reach 30+.
 */
export function nextAlignmentCheckpoint(corruption: number): number {
    return Math.floor(corruption / BC_ALIGNMENT_CHECK_CP_INTERVAL) * BC_ALIGNMENT_CHECK_CP_INTERVAL;
}

/**
 * Whether the character is currently locked out of psychic powers by
 * their Alignment. Convenience wrapper around `alignmentBlocksPsyker`
 * for callers that already hold the actor's alignment.
 */
export function psykerLockedByAlignment(alignment: ChaosAlignment): boolean {
    return alignmentBlocksPsyker(alignment);
}
