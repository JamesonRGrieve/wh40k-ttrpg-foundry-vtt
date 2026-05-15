/**
 * Trying Again helper (core.md §"Trying Again", p. 96).
 *
 * Some skills cannot be retried within the same scene without a
 * meaningful change in circumstances; some incur a cumulative −10 per
 * retry. RAW lists these as soft GM-advice rather than hard machine
 * rules, so this module surfaces an advisory flag rather than blocking.
 *
 * Consumed by the unified roll dialog to render a warning when the
 * actor has already attempted this skill in the current scene.
 */

/** Skills that RAW recommend cannot be retried without circumstance change. */
export const NO_RETRY_SKILLS: ReadonlySet<string> = new Set(['inquiry', 'awareness', 'logic', 'forbiddenLore', 'scholasticLore', 'commonLore']);

/** Skills that take a cumulative −10 per retry within the scene. */
export const CUMULATIVE_PENALTY_SKILLS: ReadonlySet<string> = new Set(['charm', 'deceive', 'intimidate', 'command']);

export interface RetryAdvice {
    /** True if the skill is in the no-retry list. */
    blocksByConvention: boolean;
    /** Cumulative penalty (in tens) for this retry; 0 if not applicable. */
    cumulativePenalty: number;
    /** Per-skill plain-English hint shown by the dialog. */
    hint: string;
}

/**
 * @param skillKey camelCase skill slug (e.g. `'inquiry'`).
 * @param previousAttempts how many times this (actor, skill) tuple has
 *   already rolled in the current scene.
 */
export function getTryAgainAdvice(skillKey: string, previousAttempts: number): RetryAdvice {
    const attempts = Math.max(0, Math.trunc(previousAttempts));
    if (attempts === 0) {
        return { blocksByConvention: false, cumulativePenalty: 0, hint: '' };
    }
    if (NO_RETRY_SKILLS.has(skillKey)) {
        return {
            blocksByConvention: true,
            cumulativePenalty: 0,
            hint: 'RAW: this skill cannot be retried within the same scene without a circumstance change.',
        };
    }
    if (CUMULATIVE_PENALTY_SKILLS.has(skillKey)) {
        const penalty = -10 * attempts;
        return {
            blocksByConvention: false,
            cumulativePenalty: penalty,
            hint: `RAW: cumulative ${penalty} per retry within the same scene.`,
        };
    }
    return { blocksByConvention: false, cumulativePenalty: 0, hint: '' };
}
