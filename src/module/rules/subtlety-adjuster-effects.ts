/**
 * Pure derivation that surfaces standing Warband Subtlety adjusters as
 * inspectable Foundry ActiveEffects (DH2 — issue #391).
 *
 * The Subtlety pool math is single-sourced by `collectSubtletyAdjusters()` +
 * `clampSubtletyLoss()` on the actor (see `base-actor.ts`); those walk the
 * actor's owned items / origin path and read each governing compendium entry's
 * `system.subtletyAdjuster`. The ActiveEffects derived here are **display-only**
 * — they carry NO `changes`, so they never touch the pool and cannot
 * double-apply. They exist purely so a standing adjuster (e.g. the Quarantine
 * World "Secretive by Nature" loss clamp, Enemies Beyond p. 30) appears in the
 * character sheet's Active Effects section alongside every other effect.
 *
 * This module is content-agnostic (CLAUDE.md Direction #7): it never names a
 * home-world or hardcodes a delta. Labels come from the collected adjuster
 * (the live compendium document name) and values come straight from the
 * adjuster's mechanic fields. The actor Document layer turns these descriptors
 * into Foundry create data and reconciles them against existing effects.
 */

import type { CollectedAdjuster } from './subtlety-adjusters.ts';

/** Flag scope (the system id) under which a derived effect is tagged. */
export const SUBTLETY_EFFECT_FLAG_SCOPE = 'wh40k-rpg';

/** Flag key carrying the `{ sourceKey }` identity on a derived effect. */
export const SUBTLETY_EFFECT_FLAG_KEY = 'subtletyAdjuster';

/**
 * Content-agnostic icon for a derived Subtlety effect. A generic Foundry core
 * asset, not a content-specific path — the displayed identity is the effect
 * name (the live adjuster label), not the icon.
 */
export const SUBTLETY_EFFECT_ICON = 'icons/svg/eye.svg';

/**
 * The standing adjuster kinds worth surfacing as a persistent ActiveEffect.
 * `event` adjusters are one-shot deltas applied when their trigger resolves
 * (not a standing state), so they are intentionally excluded — surfacing them
 * as a permanent effect would misrepresent them.
 */
type StandingAdjusterKind = 'clamp' | 'passive';

/** A standing Subtlety adjuster derived into a display-only effect descriptor. */
export interface DesiredSubtletyAdjusterEffect {
    /** Stable identity used to dedup against existing effects on the actor. */
    sourceKey: string;
    /** Effect name — the live adjuster label (compendium document name). */
    name: string;
    /** Standing kind that produced this descriptor. */
    kind: StandingAdjusterKind;
    /** Signed standing modifier for `passive`; 0 for `clamp`. */
    delta: number;
    /** Minimum retained loss magnitude for `clamp`; 0 for `passive`. */
    minAbsoluteDelta: number;
}

/** An existing derived effect already present on the actor, keyed by its flag. */
export interface ExistingSubtletyAdjusterEffect {
    /** ActiveEffect id (for deletion when stale). */
    id: string;
    /** `flags[scope][key].sourceKey` read off the existing effect. */
    sourceKey: string;
}

/** Reconcile plan: which descriptors to create, which effect ids to delete. */
export interface SubtletyAdjusterEffectPlan {
    toCreate: DesiredSubtletyAdjusterEffect[];
    toDeleteIds: string[];
}

/**
 * Stable identity for a collected adjuster. Prefers the compendium source UUID
 * (one effect per governing document); falls back to the non-content primitive
 * tag, then the label. Adjusters collected by tree-walking owned items always
 * carry a UUID or a name, so this is well-defined in practice.
 */
export function subtletyAdjusterSourceKey(adjuster: CollectedAdjuster): string {
    if (adjuster.sourceUuid !== null && adjuster.sourceUuid.length > 0) return adjuster.sourceUuid;
    if (adjuster.primitive !== null) return adjuster.primitive;
    return adjuster.label;
}

/** True when an adjuster is a standing kind worth a persistent effect. */
function isStandingAdjuster(adjuster: CollectedAdjuster): adjuster is CollectedAdjuster & { kind: StandingAdjusterKind } {
    return adjuster.kind === 'clamp' || adjuster.kind === 'passive';
}

/**
 * Map the actor's collected adjusters to the display-only effect descriptors
 * that should exist on it. Only standing (`clamp` / `passive`) adjusters
 * surface; one-shot `event` adjusters are skipped. Duplicate source keys are
 * collapsed so a single effect represents a single governing source.
 */
export function desiredSubtletyAdjusterEffects(collected: readonly CollectedAdjuster[]): DesiredSubtletyAdjusterEffect[] {
    const seen = new Set<string>();
    const out: DesiredSubtletyAdjusterEffect[] = [];
    for (const adjuster of collected) {
        if (!isStandingAdjuster(adjuster)) continue;
        const sourceKey = subtletyAdjusterSourceKey(adjuster);
        if (seen.has(sourceKey)) continue;
        seen.add(sourceKey);
        out.push({
            sourceKey,
            name: adjuster.label,
            kind: adjuster.kind,
            delta: adjuster.delta,
            minAbsoluteDelta: adjuster.minAbsoluteDelta,
        });
    }
    return out;
}

/**
 * Diff the desired descriptors against the effects already on the actor.
 * Returns the descriptors with no matching existing effect (`toCreate`) and the
 * ids of flagged effects whose source is gone or duplicated (`toDeleteIds`).
 * Effects whose source key still matches a desired descriptor are left intact,
 * so a re-sync after no change is a no-op (idempotent).
 */
export function planSubtletyAdjusterEffects(
    desired: readonly DesiredSubtletyAdjusterEffect[],
    existing: readonly ExistingSubtletyAdjusterEffect[],
): SubtletyAdjusterEffectPlan {
    const desiredKeys = new Set(desired.map((d) => d.sourceKey));
    const keptKeys = new Set<string>();
    const toDeleteIds: string[] = [];
    for (const effect of existing) {
        // Delete when the source is gone, or when it duplicates one we already kept.
        if (!desiredKeys.has(effect.sourceKey) || keptKeys.has(effect.sourceKey)) {
            toDeleteIds.push(effect.id);
            continue;
        }
        keptKeys.add(effect.sourceKey);
    }
    const toCreate = desired.filter((d) => !keptKeys.has(d.sourceKey));
    return { toCreate, toDeleteIds };
}
