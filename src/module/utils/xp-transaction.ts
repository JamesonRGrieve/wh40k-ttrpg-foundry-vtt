/**
 * XP Transaction Utility
 *
 * Handles XP spending for character advancements.
 * Provides validation and atomic updates to actor experience.
 */

import { experienceBalance, fitsBudget } from '../data/shared/experience-math.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';

type TransactionResult = {
    success: boolean;
    error?: string;
    newAvailable?: number;
};

type XPPurchase = {
    cost: number;
    reason: string;
};

type XPSummary = {
    total: number;
    used: number;
    available: number;
    spentOnCharacteristics: number;
    spentOnSkills: number;
    spentOnTalents: number;
    spentOnPsychicPowers: number;
};

type ExperienceLike = {
    total: number;
    used: number;
    /** The derive's own figure; preferred over `used`, which may be stale. */
    calculatedTotal?: number | undefined;
    spentCharacteristics: number;
    spentSkills: number;
    spentTalents: number;
    spentPsychicPowers: number;
};

/**
 * Minimal actor surface the read-only XP helpers consult — a structural view of
 * the actor Document, so the XP math is testable without a full Document.
 */
export interface XpActorView {
    system: {
        experience?: {
            total: number;
            used: number;
            /** The derive's own figure; preferred over `used`, which may be stale. */
            calculatedTotal?: number | undefined;
            spentCharacteristics?: number;
            spentSkills?: number;
            spentTalents?: number;
            spentPsychicPowers?: number;
        };
    };
}

/**
 * @typedef {Object} TransactionResult
 * @property {boolean} success - Whether the transaction succeeded
 * @property {string} [error] - Error message if failed
 * @property {number} [newAvailable] - New available XP after transaction
 */

/**
 * Get the available XP for an actor
 * @param {Actor} actor - The actor to check
 * @returns {number} Available XP
 */
export function getAvailableXP(actor: XpActorView): number {
    const experience = actor.system.experience;
    if (experience === undefined) return 0;
    return experienceBalance(experience.total, derivedSpend(experience)).available;
}

/**
 * The spend the DERIVE will produce, not the persisted `used`.
 *
 * `used` is recomputed from `calculatedTotal` on every prepare (#240), so a
 * persisted value can be stale — imported from another world, or written by one
 * of the paths that used to set it directly. Preferring `calculatedTotal` means
 * the guard and the derive cannot disagree, which is the defect in #509.
 * @param {object} experience  The actor's experience block.
 * @returns {number}  XP spent, as the derive sees it.
 */
function derivedSpend(experience: { used: number; calculatedTotal?: number | undefined }): number {
    return experience.calculatedTotal ?? experience.used;
}

/**
 * Check if an actor can afford an XP cost
 * @param {Actor} actor - The actor to check
 * @param {number} cost - The XP cost
 * @returns {boolean}
 */
export function canAfford(actor: XpActorView, cost: number): boolean {
    return getAvailableXP(actor) >= cost;
}

/**
 * Authorize an XP spend. Does NOT write — the debit is the `.cost` the caller
 * stamps on the purchased advancement, which the derive then sums (#509).
 *
 * This function used to `update({'system.experience.used': …})`. That write was
 * a silent no-op: `prepareDerivedData` recomputes `used` from the stamped costs
 * on the very next prepare and discards it. So the guard reserved nothing, and
 * two purchases resolved against the same balance could both pass — which is how
 * a character reached −200.
 *
 * Callers MUST re-verify after the debit lands (see {@link assertWithinBudget});
 * an authorization is not a reservation.
 * @param {WH40KBaseActorDocument} actor  The actor spending XP.
 * @param {number} cost  The XP cost.
 * @param {string} [reason]  Optional reason, for the log.
 * @returns {Promise<TransactionResult>}  Whether the spend may proceed.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- the async signature is the call-site contract; every caller awaits it alongside the document writes that follow
export async function authorizeXPSpend(actor: WH40KBaseActorDocument, cost: number, reason = ''): Promise<TransactionResult> {
    if (cost <= 0) {
        return { success: false, error: 'Invalid cost: must be positive' };
    }

    const experience = actor.system.experience as ExperienceLike | undefined;
    if (experience === undefined) {
        return { success: false, error: game.i18n.localize('WH40K.Advancement.Error.TransactionFailed') };
    }

    const spent = derivedSpend(experience);
    const available = experienceBalance(experience.total, spent).available;
    if (!fitsBudget(experience.total, spent, cost)) {
        return {
            success: false,
            error: game.i18n.format('WH40K.Advancement.Error.InsufficientXP', {
                cost: String(cost),
                available: String(available),
            }),
        };
    }

    if (reason) {
        game.wh40k.log(`XP Transaction: ${actor.name} spent ${cost} XP on ${reason}. Available: ${available - cost}`);
    }
    return { success: true, newAvailable: available - cost };
}

/**
 * Verify the ledger is still solvent AFTER a purchase has landed, and report it
 * when it is not.
 *
 * The authorization above is a check, not a reservation, so two clients — or a
 * double-click that outruns a re-prepare — can both pass it. This is the
 * backstop that catches that, at the point where the truth is known.
 * @param {WH40KBaseActorDocument} actor  The actor, after the debit.
 * @returns {number}  XP overspent, or 0 when solvent.
 */
export function assertWithinBudget(actor: WH40KBaseActorDocument): number {
    const experience = actor.system.experience as ExperienceLike | undefined;
    if (experience === undefined) return 0;
    return experienceBalance(experience.total, derivedSpend(experience)).overspent;
}

/**
 * Authorize several XP spends together — all or nothing.
 *
 * Like {@link authorizeXPSpend}, this only checks; the debit is the costs the
 * caller stamps. Checking the combined cost is what stops a batch that each
 * individually fits but together does not.
 * @param {WH40KBaseActorDocument} actor  The actor spending XP.
 * @param {XPPurchase[]} purchases  The purchases.
 * @returns {Promise<TransactionResult>}  Whether the batch may proceed.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- the async signature is the call-site contract, matching authorizeXPSpend
export async function authorizeXPSpendBatch(actor: WH40KBaseActorDocument, purchases: XPPurchase[]): Promise<TransactionResult> {
    if (purchases.length === 0) {
        return { success: false, error: 'Invalid arguments' };
    }

    const totalCost = purchases.reduce((sum, p) => sum + p.cost, 0);
    const experience = actor.system.experience as ExperienceLike | undefined;
    if (experience === undefined) {
        return { success: false, error: game.i18n.localize('WH40K.Advancement.Error.TransactionFailed') };
    }

    const spent = derivedSpend(experience);
    const available = experienceBalance(experience.total, spent).available;
    if (!fitsBudget(experience.total, spent, totalCost)) {
        return {
            success: false,
            error: game.i18n.format('WH40K.Advancement.Error.InsufficientXP', {
                cost: String(totalCost),
                available: String(available),
            }),
        };
    }

    const reasons = purchases
        .map((p: XPPurchase) => p.reason)
        .filter(Boolean)
        .join(', ');
    game.wh40k.log(`XP Batch Transaction: ${actor.name} spent ${totalCost} XP on [${reasons}]. Available: ${available - totalCost}`);
    return { success: true, newAvailable: available - totalCost };
}

/**
 * Get XP spending summary for an actor
 * @param {Actor} actor - The actor to check
 * @returns {Object} Summary of XP allocation
 */
export function getXPSummary(actor: XpActorView): XPSummary {
    const experience = actor.system.experience;
    const exp = experience ?? ({} as Partial<ExperienceLike>);

    return {
        total: exp.total ?? 0,
        used: exp.used ?? 0,
        available: getAvailableXP(actor),
        spentOnCharacteristics: exp.spentCharacteristics ?? 0,
        spentOnSkills: exp.spentSkills ?? 0,
        spentOnTalents: exp.spentTalents ?? 0,
        spentOnPsychicPowers: exp.spentPsychicPowers ?? 0,
    };
}

/**
 * Calculate the total XP cost of a list of advancements
 * @param {Array<{cost: number}>} advancements - List of advancements
 * @returns {number} Total cost
 */
export function calculateTotalCost(advancements: Array<{ cost: number }>): number {
    if (advancements.length === 0) return 0;
    return advancements.reduce((sum: number, adv: { cost: number }) => sum + adv.cost, 0);
}
