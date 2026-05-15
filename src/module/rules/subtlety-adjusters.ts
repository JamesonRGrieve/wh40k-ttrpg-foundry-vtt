/**
 * Warband Subtlety conditional modifiers (beyond.md + within.md).
 *
 * Several supplement features push the warband's Subtlety in specific
 * ways. This module exposes a typed registry of named adjusters so the
 * Subtlety pool consumer (`base-actor.applySubtlety()`) can attribute
 * each shift to a source.
 */

export type SubtletyAdjusterSource =
    | 'quarantineWorld' // Beyond p. 30: -2 with min -1 on any decrease
    | 'daemonWeaponWielded' // Beyond p. 50: passive while wielded
    | 'darkPactDiscovered' // Beyond p. 72
    | 'inquestPursued' // Within p. 62
    | 'manual'; // GM ad-hoc

export interface SubtletyAdjuster {
    source: SubtletyAdjusterSource;
    label: string;
    /** Default delta; the caller may scale at the call site. */
    delta: number;
    /** Hard cap on the delta in absolute value (e.g. Quarantine min -1). */
    minAbsoluteDelta?: number;
}

export const SUBTLETY_ADJUSTERS: Record<SubtletyAdjusterSource, SubtletyAdjuster> = {
    quarantineWorld: {
        source: 'quarantineWorld',
        label: 'Quarantine World homeworld (resists subtlety loss)',
        delta: 0,
        minAbsoluteDelta: 1,
    },
    daemonWeaponWielded: {
        source: 'daemonWeaponWielded',
        label: 'Daemon Weapon wielded',
        delta: -1,
    },
    darkPactDiscovered: {
        source: 'darkPactDiscovered',
        label: 'Dark Pact discovered',
        delta: -3,
    },
    inquestPursued: {
        source: 'inquestPursued',
        label: 'Inquest pursued openly',
        delta: -1,
    },
    manual: { source: 'manual', label: 'GM adjustment', delta: 0 },
};

/**
 * Apply Quarantine World's "minimum -1 on any subtlety decrease" rule
 * to a raw delta. Returns the effective delta.
 */
export function clampSubtletyLossForQuarantineWorld(rawDelta: number): number {
    const delta = Math.trunc(rawDelta);
    if (delta >= 0) return delta;
    return Math.max(delta, -1);
}
