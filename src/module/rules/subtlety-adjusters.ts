/**
 * Warband Subtlety adjuster plumbing (DH2 — core.md §"Influence And
 * Subtlety", beyond.md / within.md supplement features).
 *
 * This module is deliberately **content-agnostic** (CLAUDE.md Direction #7):
 * it holds only pure math and the enum of non-content adjustment kinds. The
 * actual deltas, clamps, and source labels live on compendium documents via
 * `SubtletyAdjusterTemplate` and are discovered at runtime by tree-walking the
 * actor's owned items / origin path (see `base-actor.collectSubtletyAdjusters`).
 * No content-specific value or name string is hardcoded here.
 */

/**
 * Non-content adjustment kinds. These are mechanics primitives, not game
 * content, so their labels live OUTSIDE the content i18n namespace
 * (`WH40K.Subtlety.ManualAdjustment` / `WH40K.Subtlety.Inquest`), never under
 * `WH40K.Subtlety.Source.*`.
 *  - `manual`: a GM ad-hoc adjustment with no governing compendium entry.
 *  - `inquest`: pursuing an Inquest openly (within.md p. 62) — a campaign
 *    event with no owned item to walk to.
 */
export type SubtletyPrimitive = 'manual' | 'inquest';

/**
 * Attribution for a Subtlety change: either a compendium document UUID (the
 * label is resolved from the live document name via `uuidNameCache`, so it is
 * never a hardcoded string) or a non-content primitive.
 */
export type SubtletySourceRef = string | SubtletyPrimitive;

/** True when `ref` is a non-content primitive rather than a compendium UUID. */
export function isSubtletyPrimitive(ref: SubtletySourceRef): ref is SubtletyPrimitive {
    return ref === 'manual' || ref === 'inquest';
}

/**
 * A Subtlety adjuster discovered on an actor by tree-walking its owned items /
 * origin path. Mechanic values (`kind` / `delta` / `minAbsoluteDelta`) come
 * straight from the governing compendium document's `subtletyAdjuster` field;
 * `label` is resolved from that document's live name.
 */
export interface CollectedAdjuster {
    /** Source compendium UUID, or `null` for a non-content primitive. */
    sourceUuid: string | null;
    /** Set when this adjuster is a non-content primitive, else `null`. */
    primitive: SubtletyPrimitive | null;
    /** Display label (compendium document name, or primitive i18n string). */
    label: string;
    /** Effect discriminator copied from the compendium entry. */
    kind: 'clamp' | 'passive' | 'event';
    /** Signed integer delta for `passive` / `event`; 0 for `clamp`. */
    delta: number;
    /** Minimum retained loss magnitude for `clamp`; 0 otherwise. */
    minAbsoluteDelta: number;
}

/**
 * Apply a "resist Subtlety loss" clamp to a raw delta. A loss (negative
 * delta) is pulled toward zero so its magnitude is at most `minAbsoluteDelta`
 * (e.g. Quarantine World keeps any decrease to a minimum reduction of 1,
 * Enemies Beyond p. 30). Gains and zero pass through untouched, as does any
 * delta when `minAbsoluteDelta` is not positive.
 *
 * Pure and content-agnostic: the `minAbsoluteDelta` value is supplied by the
 * caller from the governing compendium entry, not hardcoded here.
 */
export function clampSubtletyLoss(rawDelta: number, minAbsoluteDelta: number): number {
    const delta = Math.trunc(rawDelta);
    const cap = Math.trunc(minAbsoluteDelta);
    if (delta >= 0 || cap <= 0) return delta;
    return Math.max(delta, -cap);
}
