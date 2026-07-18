/**
 * Assassin's Strike — DH2 errata L75 (#149).
 *
 * The original core text described the Assassin's Strike talent as
 * granting "movement" after a successful melee attack without nailing
 * down a metric or test. The errata resolves the ambiguity:
 *
 *   On a successful melee attack, the character may attempt a
 *   Challenging (+0) Acrobatics Test. On a success, they may move
 *   up to a Half Move distance as a Free Action.
 *
 * Half Move in DH2 is Agility-bonus metres (see core movement rules);
 * this module pins the test parameters in isolation so the chat-card
 * dispatch and the unified roll dialog read from a single source of
 * truth. The actual movement distance is resolved by the consumer
 * from the actor's movement table at dispatch time.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';

/**
 * The post-attack Acrobatics test parameters per the errata. Locked
 * in a `const` so callers can pass the literal `difficulty` /
 * `modifier` straight through to the roll dialog without re-deriving
 * the wording on each consumer.
 */
export const ASSASSINS_STRIKE_TEST = {
    /** DH2 difficulty band — "Challenging" maps to +0 in the unified roll dialog. */
    difficulty: 'challenging',
    /** Skill key used by `actor.rollSkill(...)`; matches the canonical lowercase identifier. */
    skill: 'acrobatics',
    /** Numeric modifier paired with the "Challenging" band. Explicit so the dispatch path can apply it without a lookup. */
    modifier: 0,
} as const;

/**
 * The talent's stable `system.identifier`. Matching on this instead of the
 * display name (which shipped under several spellings) removes the fragile
 * name-list and routes through the same identifier key the rest of the system
 * uses (item.ts §"Items are matched by system.identifier"). Direction #7.
 */
const ASSASSINS_STRIKE_IDENTIFIER = 'assassinStrike';

/** Minimal owned-item surface: a typed item carrying a `system.identifier`. */
interface ItemWithIdentifier {
    type?: string;
    system?: { identifier?: string };
}

/** Minimal duck-type for an actor that exposes its owned `items`. Both the acolyte and NPC documents satisfy it. */
interface ActorWithItems {
    items: Iterable<ItemWithIdentifier>;
}

function hasItemsLookup(value: object): value is ActorWithItems {
    return 'items' in value && typeof (value as Partial<ActorWithItems>).items === 'object';
}

/**
 * Predicate — does this actor carry the Assassin's Strike talent? Matches by the
 * talent's stable `system.identifier`, not its display name.
 */
export function hasAssassinsStrike(actor: WH40KBaseActor | ActorWithItems | null | undefined): boolean {
    if (actor == null) return false;
    if (!hasItemsLookup(actor)) return false;
    for (const item of actor.items) {
        if (item.type === 'talent' && item.system?.identifier === ASSASSINS_STRIKE_IDENTIFIER) return true;
    }
    return false;
}
