/**
 * @file Wound transition record for applied damage (#504).
 *
 * A damage card used to state a bare total: "8 damage", with no indication of
 * whether that took the target from 12 to 4 or from 2 to −6. The second case is
 * the one that matters, because the overflow routes into critical damage — and
 * that split was invisible.
 *
 * The before/after pair is computed HERE, at apply time, and stored on the card
 * so it survives a re-render. Recomputing it from the actor's current state
 * would let a second hit silently rewrite the first card's numbers, which is the
 * acceptance's load-bearing requirement.
 *
 * Pure — no Foundry access — so the arithmetic is unit-testable without a world.
 */

/** One tracked value's before/after, as stored on the card. */
export interface ValueTransition {
    before: number;
    after: number;
    /** Maximum, for context in the hover (`12 → 4 / 12`). Omitted when unbounded. */
    max?: number | undefined;
}

/** Everything an applied-damage hover needs, recorded at apply time. */
export interface WoundTransition {
    wounds: ValueTransition;
    /** Present only when the hit overflowed into critical damage. */
    critical?: ValueTransition | undefined;
    /** Present only when the hit added fatigue. */
    fatigue?: ValueTransition | undefined;
    /** Wound damage actually absorbed by the wound track. */
    damageTaken: number;
    /** Damage that overflowed past 0 wounds into the critical track. */
    criticalTaken: number;
}

/** The actor state this record is built from — the slice, not the document. */
export interface WoundState {
    wounds: { value: number; max?: number | undefined; critical: number };
    fatigue?: { value: number; max?: number | undefined } | undefined;
}

/**
 * Build the transition record for one damage application.
 *
 * `damageTaken` / `criticalTaken` are already split by the caller
 * (`assign-damage-data.ts` decides how much the wound track absorbs and how much
 * overflows), so this records the consequence rather than re-deriving the split.
 * @param {WoundState} before  The actor's tracked values before the update.
 * @param {object} applied  The already-split damage.
 * @param {number} applied.damageTaken  Wound-track damage.
 * @param {number} applied.criticalTaken  Critical-track damage.
 * @param {number} [applied.fatigueTaken]  Fatigue added.
 * @returns {WoundTransition}  The record to store on the card.
 */
export function buildWoundTransition(before: WoundState, applied: { damageTaken: number; criticalTaken: number; fatigueTaken?: number }): WoundTransition {
    const damageTaken = safeNumber(applied.damageTaken);
    const criticalTaken = safeNumber(applied.criticalTaken);
    const fatigueTaken = safeNumber(applied.fatigueTaken ?? 0);

    const woundsBefore = safeNumber(before.wounds.value);
    const criticalBefore = safeNumber(before.wounds.critical);

    const transition: WoundTransition = {
        wounds: { before: woundsBefore, after: woundsBefore - damageTaken, max: before.wounds.max },
        damageTaken,
        criticalTaken,
    };

    // Only surface the critical row when the hit actually overflowed — an
    // unconditional `critical +0` is noise on the majority of cards.
    if (criticalTaken > 0) {
        transition.critical = { before: criticalBefore, after: criticalBefore + criticalTaken };
    }
    if (fatigueTaken > 0 && before.fatigue !== undefined) {
        const fatigueBefore = safeNumber(before.fatigue.value);
        transition.fatigue = { before: fatigueBefore, after: fatigueBefore + fatigueTaken, max: before.fatigue.max };
    }
    return transition;
}

/** Coerce a possibly-absent/NaN tracked value to a usable number. */
function safeNumber(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** One hover row: a label plus its `before → after` rendering. */
export interface TransitionTooltipRow {
    name: string;
    value: string;
}

/**
 * Render a transition record as `wh40k-tooltip` "modifier"-shaped rows.
 *
 * Reuses the existing rich-tooltip payload shape (`{name, value}[]`) rather than
 * inventing a second hover mechanism — CLAUDE.md's roll-transparency rule is
 * explicit that `data-wh40k-tooltip` is the sanctioned route and a bare `title=`
 * is not.
 * @param {WoundTransition} transition  The stored record.
 * @returns {TransitionTooltipRow[]}  Rows for the tooltip payload.
 */
export function woundTransitionRows(transition: WoundTransition): TransitionTooltipRow[] {
    const rows: TransitionTooltipRow[] = [{ name: 'Wounds', value: formatTransition(transition.wounds) }];
    if (transition.critical !== undefined) {
        rows.push({ name: 'Critical', value: `${formatTransition(transition.critical)} (+${transition.criticalTaken})` });
    }
    if (transition.fatigue !== undefined) {
        rows.push({ name: 'Fatigue', value: formatTransition(transition.fatigue) });
    }
    return rows;
}

/** `12 → 4 / 12`, or `12 → 4` when there is no max. */
function formatTransition(value: ValueTransition): string {
    const base = `${value.before} → ${value.after}`;
    return typeof value.max === 'number' && Number.isFinite(value.max) ? `${base} / ${value.max}` : base;
}

/**
 * Serialise a transition for `data-wh40k-tooltip-data`.
 *
 * Emits the same `{title, sources: [{name, value}]}` shape the tooltip component
 * already renders, so this reuses the mechanism rather than inventing a second
 * one. It does NOT route through `prepareModifierTooltipData`, which coerces
 * `value` to a number (`s.value ?? s.modifier ?? 0`) — that would turn every
 * `12 → 4 / 12` into `0`.
 * @param {WoundTransition | null} transition  The stored record, or null.
 * @param {string} [title]  Tooltip heading.
 * @returns {string}  JSON payload, or '' when there is nothing to show.
 */
export function prepareWoundTransitionTooltip(transition: WoundTransition | null, title = 'Damage Applied'): string {
    if (transition === null) return '';
    const sources = woundTransitionRows(transition);
    if (sources.length === 0) return '';
    return JSON.stringify({ title, sources });
}
