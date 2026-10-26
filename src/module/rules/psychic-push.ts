/**
 * Psychic power three-step difficulty selector
 * (core.md §"Step 2: Make Focus Power Test").
 *
 * Each manifestation chooses a Psy Rating mode:
 *
 *  - **Fettered:** roll uses half PR (rounded up) for both the focus test difficulty
 *    bonus and downstream PR-scaling. No Psychic Phenomena chance
 *    (the safe option).
 *  - **Unfettered:** roll uses the full PR. Phenomena trigger via the
 *    normal "doubles" / "9-of-the-same" rules.
 *  - **Push:** roll uses PR + push level. Phenomena trigger **always**
 *    on success, plus an extra +X modifier on the phenomena roll where
 *    X is the push level.
 */

import { nonNegInt } from './_num.ts';

export type PsyMode = 'fettered' | 'unfettered' | 'push';

export interface PsyModeResolved {
    /** Effective PR for power scaling (range, damage, etc.). */
    effectivePR: number;
    /** Modifier added to the Focus Power test target (negative = harder). */
    focusModifier: number;
    /** True if a phenomena draw always fires on success. */
    forcePhenomena: boolean;
    /** Modifier added to the phenomena roll when phenomena fires. */
    phenomenaModifier: number;
}

export interface PsyModeInput {
    mode: PsyMode;
    basePR: number;
    /** Push level (positive integer). Ignored when mode !== 'push'. */
    pushLevel?: number;
}

/**
 * The Psy Rating a Fettered manifestation uses (#178): half the base PR, rounding
 * up. Every line prints it that way: BC and RT core "halve his PR (rounding up)",
 * OW "Half of his Active Psy Rating, rounding up", DW "half his normal rating
 * (rounding up)". A PR 1 psyker therefore still manifests at PR 1.
 */
export function fetteredPsyRating(basePR: number): number {
    return Math.ceil(nonNegInt(basePR) / 2);
}

export function resolvePsyMode(input: PsyModeInput): PsyModeResolved {
    const basePR = nonNegInt(input.basePR);
    if (input.mode === 'fettered') {
        return { effectivePR: fetteredPsyRating(basePR), focusModifier: 10, forcePhenomena: false, phenomenaModifier: 0 };
    }
    if (input.mode === 'push') {
        const push = Math.max(1, Math.trunc(input.pushLevel ?? 1));
        return { effectivePR: basePR + push, focusModifier: -10 * push, forcePhenomena: true, phenomenaModifier: 5 * push };
    }
    // 'unfettered' — base values.
    return { effectivePR: basePR, focusModifier: 0, forcePhenomena: false, phenomenaModifier: 0 };
}
