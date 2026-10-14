/**
 * Within-supplement background mechanics (DH2 Enemies Within p.32).
 *
 * The Within backgrounds and roles otherwise carry their rules as content on
 * their compendium documents (Penitent's Cleansing Pain is a `dynamicModifiers`
 * `onDamaged` hook; the Fanatic's Fate spend lives in `fanatic.ts`).
 */

import { findBandBy } from './_dice.ts';

/* -------------------------------------------- */
/*  Mutant background (within.md p. 32)         */
/* -------------------------------------------- */

/**
 * Within p. 32, Starting Corruption and Mutation: "A Mutant character begins
 * play with 10 Corruption points. Instead of rolling as normal for malignancy
 * or mutation, roll 5d10 on Table 8-16: Mutations ... to determine a starting
 * mutation for the character."
 *
 * Both values are content on the Mutant origin document: the Corruption in
 * `modifiers.resources.corruption` (applied by the origin-grant ledger like any
 * origin resource), the roll in `grants.startingMutationFormula`. An origin
 * carrying a starting-mutation formula has its starting Corruption exempt from
 * the Malignancy Test (core p. 290, "for every 10 total Corruption points a
 * character gains"), because the book replaces that test with the roll.
 */

/**
 * The starting-mutation roll formula an item's `system` carries in
 * `grants.startingMutationFormula`, or `null` when it has none. Takes any item
 * system: only an origin path declares the field, and every other item type
 * (whose `grants` may be a list, or absent) reads as none.
 */
export function startingMutationFormula(system: object): string | null {
    if (!('grants' in system) || typeof system.grants !== 'object' || system.grants === null) return null;
    const grants = system.grants;
    if (!('startingMutationFormula' in grants) || typeof grants.startingMutationFormula !== 'string') return null;
    const formula = grants.startingMutationFormula.trim();
    return formula === '' ? null : formula;
}

/** The Corruption an item's `system` grants in `modifiers.resources.corruption` (0 when absent). */
export function originStartingCorruption(system: object): number {
    if (!('modifiers' in system) || typeof system.modifiers !== 'object' || system.modifiers === null) return 0;
    const modifiers = system.modifiers;
    if (!('resources' in modifiers) || typeof modifiers.resources !== 'object' || modifiers.resources === null) return 0;
    const resources = modifiers.resources;
    return 'corruption' in resources && typeof resources.corruption === 'number' ? resources.corruption : 0;
}

/** The update entry that keeps the owed Malignancy Tests where they are. */
export type MalignancyHold = { 'system.malignancyTestsPending'?: number };

/**
 * When an origin with a starting mutation writes Corruption, pin the owed
 * Malignancy Test count to its current value in the same update. The
 * character's `_preUpdate` leaves an explicitly set queue alone, so the starting
 * Corruption queues no test. Anything else returns `{}`, and the normal
 * per-10-points rule applies.
 * @param originSystem  The `system` of the origin being applied.
 * @param updates  The `actor.update()` entries the origin is about to write.
 * @param actorSystem  The actor's current system data.
 */
export function startingCorruptionHoldsMalignancy(
    originSystem: object,
    // eslint-disable-next-line no-restricted-syntax -- boundary: the bag is an actor.update() payload (open-ended system.* paths + values)
    updates: Record<string, unknown>,
    actorSystem: object,
): MalignancyHold {
    if (startingMutationFormula(originSystem) === null || !('system.corruption' in updates)) return {};
    if (!('malignancyTestsPending' in actorSystem) || typeof actorSystem.malignancyTestsPending !== 'number') return {};
    return { 'system.malignancyTestsPending': actorSystem.malignancyTestsPending };
}

/** A Mutations-table row the starting mutation can land on. */
export interface MutationBand {
    readonly range: readonly [number, number];
}

/**
 * The Mutations-table row a starting-mutation total lands on (Table 8-16 is a
 * d100 table; the 5d10 total is read against the same bands). `null` when the
 * total falls in a gap.
 */
export function startingMutationRow<T extends MutationBand>(entries: readonly T[], total: number): T | null {
    return findBandBy(entries, total, (entry) => entry.range, { clamp: false }) ?? null;
}

/**
 * The actor flag (scope `wh40k-rpg`) the Mutant background dialog sets to record
 * the Twisted Flesh background bonus.
 */
export const TWISTED_FLESH_FLAG = 'twistedFlesh';

/** What a Malignancy the character would gain resolves to. */
export type MalignancyOutcome = 'malignancy' | 'mutation';

/**
 * The outcomes a gained Malignancy may take. Twisted Flesh (within.md p. 32):
 * "Whenever he would gain a malignancy, he may roll on Table 8-16: Mutations to
 * gain a mutation instead" — a choice, so both remain open; without it, only
 * the Malignancy.
 */
export function malignancyOutcomes(twistedFlesh: boolean): readonly MalignancyOutcome[] {
    return twistedFlesh ? ['malignancy', 'mutation'] : ['malignancy'];
}
