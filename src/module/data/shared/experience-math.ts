/**
 * @file The one XP balance calculation (#509).
 *
 * `experience.used` is fully DERIVED from the `.cost` stamped on purchased
 * advancements (#240). Before this module, four places wrote it — `spendXP`, the
 * sheet's BC infamy path, the origin-path builder (twice) — and a fifth,
 * `prepareDerivedData`, recomputed it afterwards and won. A field written by four
 * places and recomputed by a fifth cannot hold an invariant, which is how a
 * purchase got approved against a balance that had not absorbed an earlier one
 * and left a character at −200.
 *
 * So the balance math lives here, once, and every surface reads it: the derive,
 * the affordability guard, and the post-purchase check. Pure, so the arithmetic
 * is testable without an actor.
 */

/** A character's experience balance, as every surface should see it. */
export interface ExperienceBalance {
    /** XP still spendable. Never negative — an overspend surfaces as `overspent`. */
    available: number;
    /**
     * XP spent BEYOND the total earned, or 0. Non-zero means the ledger is in
     * deficit and the sheet must say so: silently rendering a negative balance
     * is what let the −200 sit there looking like a number rather than a fault.
     */
    overspent: number;
}

/**
 * The balance for a given earned total and derived spend.
 *
 * `available` is floored at 0 and the excess is reported separately rather than
 * allowed to go negative, so a deficit is a distinct, displayable state instead
 * of a negative number the UI renders without comment.
 * @param {number} total  XP earned.
 * @param {number} spent  XP spent, derived from purchased advancements.
 * @returns {ExperienceBalance}  The balance.
 */
export function experienceBalance(total: number, spent: number): ExperienceBalance {
    const earned = Number.isFinite(total) ? total : 0;
    const used = Number.isFinite(spent) ? spent : 0;
    const remaining = earned - used;
    return remaining >= 0 ? { available: remaining, overspent: 0 } : { available: 0, overspent: -remaining };
}

/**
 * Whether a purchase fits the budget.
 *
 * Takes the PROSPECTIVE spend — the derived spend plus the cost being considered
 * — rather than comparing a cost against a persisted `available`, because that
 * persisted value is about to be recomputed and may not have absorbed an earlier
 * purchase yet. This is the check that must gate every debit.
 * @param {number} total  XP earned.
 * @param {number} spent  XP already spent, derived.
 * @param {number} cost  Cost of the purchase being considered.
 * @returns {boolean}  True when the purchase leaves the ledger solvent.
 */
export function fitsBudget(total: number, spent: number, cost: number): boolean {
    return experienceBalance(total, spent + cost).overspent === 0;
}
