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
    /** i18n key for the GM-facing source label. */
    labelKey: string;
    /** Default delta; the caller may scale at the call site. */
    delta: number;
    /** Hard cap on the delta in absolute value (e.g. Quarantine min -1). */
    minAbsoluteDelta?: number;
}

export const SUBTLETY_ADJUSTERS: Record<SubtletyAdjusterSource, SubtletyAdjuster> = {
    quarantineWorld: {
        source: 'quarantineWorld',
        labelKey: 'WH40K.Subtlety.Source.QuarantineWorld',
        delta: 0,
        minAbsoluteDelta: 1,
    },
    daemonWeaponWielded: {
        source: 'daemonWeaponWielded',
        labelKey: 'WH40K.Subtlety.Source.DaemonWeaponWielded',
        delta: -1,
    },
    darkPactDiscovered: {
        source: 'darkPactDiscovered',
        labelKey: 'WH40K.Subtlety.Source.DarkPactDiscovered',
        delta: -3,
    },
    inquestPursued: {
        source: 'inquestPursued',
        labelKey: 'WH40K.Subtlety.Source.InquestPursued',
        delta: -1,
    },
    manual: { source: 'manual', labelKey: 'WH40K.Subtlety.Source.Manual', delta: 0 },
};

/** Look up a registered adjuster by source key. */
export function getSubtletyAdjuster(source: SubtletyAdjusterSource): SubtletyAdjuster {
    return SUBTLETY_ADJUSTERS[source];
}

/**
 * Apply Quarantine World's "minimum -1 on any subtlety decrease" rule
 * to a raw delta. Returns the effective delta.
 */
export function clampSubtletyLossForQuarantineWorld(rawDelta: number): number {
    const delta = Math.trunc(rawDelta);
    if (delta >= 0) return delta;
    return Math.max(delta, -1);
}

/**
 * Resolve the effective delta to apply for a given adjuster, scaled by an
 * optional caller-supplied multiplier. When the actor is from a Quarantine
 * World, any net loss is clamped to -1 per Beyond p. 30.
 *
 * The function is pure — it does not touch the actor. `base-actor.applySubtletyAdjuster`
 * detects Quarantine World residency and forwards the resolved delta here.
 */
export function resolveSubtletyAdjusterDelta(source: SubtletyAdjusterSource, scale: number, hasQuarantineWorld: boolean): number {
    const adjuster = SUBTLETY_ADJUSTERS[source];
    const rawDelta = Math.trunc(adjuster.delta * scale);
    return hasQuarantineWorld ? clampSubtletyLossForQuarantineWorld(rawDelta) : rawDelta;
}
