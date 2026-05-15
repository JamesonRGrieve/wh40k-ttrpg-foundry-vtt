/**
 * Psychic power three-step difficulty selector
 * (core.md §"Step 2: Make Focus Power Test").
 *
 * Each manifestation chooses a Psy Rating mode:
 *
 *  - **Fettered:** roll uses half PR for both the focus test difficulty
 *    bonus and downstream PR-scaling. No Psychic Phenomena chance
 *    (the safe option).
 *  - **Unfettered:** roll uses the full PR. Phenomena trigger via the
 *    normal "doubles" / "9-of-the-same" rules.
 *  - **Push:** roll uses PR + push level. Phenomena trigger **always**
 *    on success, plus an extra +X modifier on the phenomena roll where
 *    X is the push level.
 */

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

export function resolvePsyMode(input: PsyModeInput): PsyModeResolved {
    const basePR = Math.max(0, Math.trunc(input.basePR));
    switch (input.mode) {
        case 'fettered': {
            const half = Math.floor(basePR / 2);
            return { effectivePR: half, focusModifier: 10, forcePhenomena: false, phenomenaModifier: 0 };
        }
        case 'unfettered':
            return { effectivePR: basePR, focusModifier: 0, forcePhenomena: false, phenomenaModifier: 0 };
        case 'push': {
            const push = Math.max(1, Math.trunc(input.pushLevel ?? 1));
            return { effectivePR: basePR + push, focusModifier: -10 * push, forcePhenomena: true, phenomenaModifier: 5 * push };
        }
    }
}
