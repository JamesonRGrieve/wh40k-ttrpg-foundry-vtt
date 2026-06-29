/**
 * @file Pure modifier-aggregation helpers for d100 test targets.
 *
 * The displayed roll-test target and the committed roll must use the SAME
 * value: base characteristic (WS / BS / …) plus every active modifier, with
 * the ±60 accumulation cap applied to the modifier sum (DH2 core.md L1050).
 * These functions are content-agnostic pure math — modifier VALUES are sourced
 * upstream (range / attack-mode / RoF / cover rule modules) and merged into the
 * record passed in here; nothing in this module hardcodes a modifier table.
 */

/** Maximum total bonus / penalty allowed on a single test target.
 *  Per DH2 core.md L1050: "no accumulated bonus exceeds +60 and no
 *  accumulated penalty exceeds -60". */
export const ROLL_MODIFIER_CAP = 60;

/** Apply the ±ROLL_MODIFIER_CAP clamp to a raw modifier sum.
 *  Returns the clamped value, the original raw value, and whether
 *  the cap actually fired (useful for chat-card surfacing). */
export function clampModifierToCap(rawTotal: number): { clamped: number; raw: number; capFired: boolean } {
    const raw = Number.isFinite(rawTotal) ? rawTotal : 0;
    if (raw > ROLL_MODIFIER_CAP) return { clamped: ROLL_MODIFIER_CAP, raw, capFired: true };
    if (raw < -ROLL_MODIFIER_CAP) return { clamped: -ROLL_MODIFIER_CAP, raw, capFired: true };
    return { clamped: raw, raw, capFired: false };
}

/** Sum every finite value in a modifier record. Non-finite / non-number
 *  entries contribute zero so a malformed modifier can never poison the
 *  total. Keys are irrelevant — callers merge all active modifier sources
 *  (difficulty, aim, weapon, range, cover, …) into one record first. */
export function sumModifierValues(modifiers: Readonly<Record<string, number>>): number {
    let total = 0;
    for (const value of Object.values(modifiers)) {
        if (Number.isFinite(value)) total += value;
    }
    return total;
}

/** Clamped modifier total for a merged modifier record: `sum` is the raw
 *  accumulation, `total` is the ±60-capped value the roll uses, `capFired`
 *  reports whether the clamp engaged. */
export function aggregateModifierTotal(modifiers: Readonly<Record<string, number>>): { total: number; raw: number; capFired: boolean } {
    const { clamped, raw, capFired } = clampModifierToCap(sumModifierValues(modifiers));
    return { total: clamped, raw, capFired };
}

/** Aggregate test target = base characteristic + the ±60-capped modifier
 *  total. This is the single source of truth shared by the dialog's displayed
 *  target and the committed roll's `modifiedTarget`, so they can never drift. */
export function aggregateRollTarget(baseTarget: number, modifiers: Readonly<Record<string, number>>): number {
    return baseTarget + aggregateModifierTotal(modifiers).total;
}
