/**
 * Within-supplement background mechanics (DH2 Enemies Within p.32).
 *
 * The Within backgrounds and roles otherwise carry their rules as content on
 * their compendium documents (Penitent's Cleansing Pain is a `dynamicModifiers`
 * `onDamaged` hook; the Fanatic's Fate spend lives in `fanatic.ts`).
 */

/* -------------------------------------------- */
/*  Mutant background (within.md p. 32)         */
/* -------------------------------------------- */

/**
 * Starting Corruption Points for a Mutant background (vs 0 baseline). The
 * Mutant origin document records the same 10 in `modifiers.resources.corruption`,
 * but no origin-apply path writes that resource; the Mutant background dialog
 * is the sole applier, so the value is not counted twice.
 */
export const MUTANT_STARTING_CORRUPTION = 10;
