/**
 * Sanctic Purity (#131 — DH2 Enemies Beyond).
 *
 * When the bearer triggers Psychic Phenomena manifesting a Sanctic
 * Daemonology power, they may spend a Fate point to negate the result
 * entirely.
 *
 * This module exposes the two pieces shared by the Fate-spend prompt,
 * the chat-card emission, and the Phenomena dispatch path:
 *
 *   - `SANCTIC_PURITY_FATE_COST` — number of Fate points the negation
 *     consumes (always 1; pinned so the prompt and the dispatch don't
 *     drift out of sync).
 *   - `hasSancticPurity(actor)` — whether the actor owns the talent,
 *     matched by its stable `system.identifier` (`sancticPurity`), the
 *     value a caller passes as `resolveSancticManifestation`'s
 *     `mitigation.emperorsAnathema`.
 */

import { hasItemWithIdentifier, type IdentifiableItem } from '../utils/item-identifier.ts';

/** Fate cost paid when accepting the negation prompt. */
export const SANCTIC_PURITY_FATE_COST = 1 as const;

/** The Sanctic Purity talent document's `system.identifier`. */
const SANCTIC_PURITY_IDENTIFIER = 'sancticPurity';

/** Minimal duck-type for an actor that exposes its owned `items`. */
interface ActorWithItems {
    items?: Iterable<IdentifiableItem> | undefined;
}

/**
 * Predicate — does this actor own the Sanctic Purity talent? Matches by the
 * talent's `system.identifier`, never its name. Returns `false` for `null` /
 * `undefined` actors and actors without items, so the caller can use it as a
 * plain guard.
 */
export function hasSancticPurity(actor: ActorWithItems | null | undefined): boolean {
    const items = actor?.items;
    return items !== undefined && hasItemWithIdentifier(items, 'talent', SANCTIC_PURITY_IDENTIFIER);
}
