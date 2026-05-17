/**
 * Pure, Foundry-free types + normalizer for the structured
 * `system.subtletyAdjuster` field. Kept separate from
 * `subtlety-adjuster-template.ts` (which extends a Foundry-bound DataModel and
 * cannot load outside the Foundry runtime) so this content-agnostic logic is
 * directly unit-testable and importable by the actor tree-walk without
 * dragging in the DataModel class (CLAUDE.md Direction #7).
 */

/**
 * Discriminator for how a content entry shifts the warband's Subtlety pool.
 * - `clamp`: the entry resists Subtlety loss — any decrease is reduced toward
 *   zero, never below `minAbsoluteDelta` in magnitude (e.g. Quarantine World,
 *   Enemies Beyond p. 30).
 * - `passive`: a standing modifier surfaced while the entry is owned (and, for
 *   weapons, wielded). Display/aggregation only — never decremented per turn.
 * - `event`: a one-shot delta applied when the triggering event resolves
 *   (e.g. a Dark Pact being discovered).
 * - `none`: the entry carries no Subtlety effect (the schema default).
 */
export type SubtletyAdjusterKind = 'none' | 'clamp' | 'passive' | 'event';

/** Raw `system.subtletyAdjuster` shape as stored by the schema. */
export interface RawSubtletyAdjuster {
    kind: SubtletyAdjusterKind;
    delta: number;
    minAbsoluteDelta: number;
    requiresEquipped: boolean;
}

/**
 * Normalized, non-`none` Subtlety effect read off a compendium-backed item.
 * Consumers branch on this shape rather than the raw schema so the storage
 * format stays an implementation detail of this module.
 */
export interface SubtletyAdjusterEffect {
    kind: 'clamp' | 'passive' | 'event';
    /** Signed integer delta for `passive` / `event`; always 0 for `clamp`. */
    delta: number;
    /** Minimum retained loss magnitude for `clamp`; 0 otherwise. */
    minAbsoluteDelta: number;
    /** When true, a `passive` effect only counts while the item is equipped. */
    requiresEquipped: boolean;
}

/**
 * Normalize a raw `system.subtletyAdjuster` value to a `SubtletyAdjusterEffect`
 * or `null` (field absent / `kind: 'none'`). This is the single place that
 * knows the storage shape — the template getter and the actor tree-walk both
 * route through it.
 */
export function subtletyAdjusterEffectOf(raw: RawSubtletyAdjuster | null | undefined): SubtletyAdjusterEffect | null {
    if (raw == null || raw.kind === 'none') return null;
    return {
        kind: raw.kind,
        delta: raw.delta,
        minAbsoluteDelta: raw.minAbsoluteDelta,
        requiresEquipped: raw.requiresEquipped,
    };
}
