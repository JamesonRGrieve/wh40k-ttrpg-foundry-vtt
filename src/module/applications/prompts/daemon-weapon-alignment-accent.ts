/**
 * @file The Daemon Weapon Attribute roller's accent colour per Chaos alignment, for
 * its dialog header and chat card (#142).
 *
 * Kept apart from the dialog module, which reads `foundry.applications.api` when it
 * loads: the dialog's stories import this table, and a story importing the dialog
 * module failed to load in Storybook, where there is no `foundry` global (#683).
 */

import type { ChaosAlignment } from '../../config/game-systems/types.ts';

/** Tailwind accent class per alignment used by the dialog header and chat card. */
export const ALIGNMENT_ACCENT_CLASS: Record<ChaosAlignment, string> = {
    unaligned: 'tw-text-gold',
    khorne: 'tw-text-crimson',
    nurgle: 'tw-text-green-500',
    slaanesh: 'tw-text-pink-400',
    tzeentch: 'tw-text-blue-400',
};
