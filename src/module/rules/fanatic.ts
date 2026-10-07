/**
 * Fanatic role — "Death to All Who Oppose Me!" (DH2 Enemies Within p34).
 *
 * Besides the standard Fate uses, a Fanatic can burn a Fate point to gain
 * Hatred toward the enemy they are fighting, lasting until the encounter ends.
 * (Leaving combat against that foe during the encounter costs
 * 1 Insanity point; that half is GM-adjudicated and not automated.)
 *
 * Nothing about Hatred is restated here. The Fanatic is granted an
 * encounter-scoped copy of the line's own Hatred talent document, with each of
 * its `vsSpecialization` hooks re-aimed at the one targeted foe (`vsActor` +
 * the foe's UUID), so the +X and everything else Hatred does comes from the
 * Hatred document's data (Direction #7). The role and the talent are both found
 * by `system.identifier`, never by name.
 */

import type { DynamicModifierEntry } from '../data/shared/modifiers-template.ts';
import { hasItemWithIdentifier, type IdentifiableItem } from '../utils/item-identifier.ts';

/** The Fanatic role document's `system.identifier`. */
export const FANATIC_IDENTIFIER = 'fanatic';

/** The Hatred talent document's `system.identifier`, shared by every line. */
export const HATRED_IDENTIFIER = 'hatred';

/** Item flag marking an item granted only for the current encounter. */
export const ENCOUNTER_GRANT_FLAG = 'encounterGrant';

/** Whether the actor owns the Fanatic role (an `originPath` item with identifier `fanatic`). */
export function hasFanaticRole(items: Iterable<IdentifiableItem>): boolean {
    return hasItemWithIdentifier(items, 'originPath', FANATIC_IDENTIFIER);
}

/**
 * Re-aim the Hatred document's hooks at one foe: every `vsSpecialization` hook
 * (Hatred's "against the creature it hates") becomes `vsActor` against
 * `foeUuid`. Other hooks pass through unchanged. Pure; returns fresh entries.
 */
export function hatredAgainstFoe(hooks: readonly DynamicModifierEntry[], foeUuid: string): DynamicModifierEntry[] {
    return hooks.map((hook) => (hook.condition === 'vsSpecialization' ? { ...hook, condition: 'vsActor', conditionValue: foeUuid } : { ...hook }));
}
