/**
 * Climbing surface modifiers (DH2e errata p. 113 — "Climbing Sheer Surfaces").
 *
 * The errata clarifies that climbing a sheer surface (sheer cliffs, icy
 * crevasses, smooth building walls, hive buttresses) imposes a Hard (-20)
 * difficulty on the Athletics test. Standard climbable terrain (rough
 * walls, ladders with hand-holds) uses the default difficulty, and
 * particularly easy assists (knotted rope, climbing harness on a fixed
 * line) instead grant a small bonus.
 *
 * The dialog surface exposes this as a per-roll GM dropdown that mutates
 * the final-target math; the rules layer here owns the canonical numbers
 * so the UI never inlines a magic constant.
 */

export type ClimbingSurface = 'standard' | 'sheer' | 'easy';

/** Hard (-20) penalty per errata L113. Exported so call-sites can pin against the constant. */
export const SHEER_SURFACE_CLIMB_MODIFIER = -20;

/** Standard climbable terrain — the default state on the dialog. */
export const STANDARD_SURFACE_CLIMB_MODIFIER = 0;

/** Easy / assisted climb (knotted rope, fixed line). Routine bonus per RAW Climbing flavour. */
export const EASY_SURFACE_CLIMB_MODIFIER = 10;

export interface ClimbingModifierInput {
    surfaceType: ClimbingSurface;
}

/** Returns the to-test modifier for the chosen climbing surface. */
export function getClimbingModifier({ surfaceType }: ClimbingModifierInput): number {
    switch (surfaceType) {
        case 'sheer':
            return SHEER_SURFACE_CLIMB_MODIFIER;
        case 'easy':
            return EASY_SURFACE_CLIMB_MODIFIER;
        case 'standard':
            return STANDARD_SURFACE_CLIMB_MODIFIER;
    }
}
