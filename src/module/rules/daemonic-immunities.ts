/**
 * Daemonic trait detection (#143 — DH2 Core p.136, errata).
 *
 * The Daemonic (X) trait makes its bearer immune to disease and poison and
 * grants the Undying trait. Undying (DH2 Core p139) is immunity to disease,
 * poison and toxins plus no need to breathe — it has no revival rider. The
 * immunities themselves are content carried by the trait documents; this
 * module only answers "does this actor carry Daemonic?" for the sheet badge.
 *
 * The trait is matched by its stable `system.identifier` (`daemonic`), never
 * its display name: the documents ship as "Daemonic", "Daemonic (X)" and
 * "Daemonic (x)", which an exact-name match silently missed.
 */

import { hasItemWithIdentifier, type IdentifiableItem } from '../utils/item-identifier.ts';

/** The Daemonic trait's stable `system.identifier`, shared by every line's document. */
const DAEMONIC_IDENTIFIER = 'daemonic';

/** Minimal duck-typed actor surface: the owned items. */
export interface DaemonicActorLike {
    items?: Iterable<IdentifiableItem>;
}

/** Whether the actor owns a trait whose `system.identifier` is `daemonic`. */
export function hasDaemonic(actor: DaemonicActorLike): boolean {
    return actor.items !== undefined && hasItemWithIdentifier(actor.items, 'trait', DAEMONIC_IDENTIFIER);
}
