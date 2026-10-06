/**
 * Assassin's Strike — DH2 errata L75 (#149).
 *
 * On a successful melee attack the character may attempt an Acrobatics
 * test (DH2: Challenging (+0); DH1: an Acrobatics Test). On a success
 * they may move up to a Half Move as a Free Action.
 *
 * The test itself is content: the talent document authors it in its
 * `system.rollConfig` (`{ skill, modifier }`), so this module reads the
 * skill and modifier off the actor's owned talent rather than holding a
 * copy in `src/` (Direction #7). The talent is found by its stable
 * `system.identifier`, never its display name.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';

/**
 * The talent's stable `system.identifier`. Matching on this instead of the
 * display name (which shipped under several spellings) removes the fragile
 * name-list and routes through the same identifier key the rest of the system
 * uses (item.ts §"Items are matched by system.identifier"). Direction #7.
 */
const ASSASSINS_STRIKE_IDENTIFIER = 'assassinStrike';

/** The post-attack test the talent's document authors in `system.rollConfig`. */
interface AssassinsStrikeTest {
    /** Skill key the test rolls (e.g. `acrobatics`). */
    skill: string;
    /** Numeric modifier the document prints for the test (Challenging = 0). */
    modifier: number;
}

/** Minimal owned-item surface: a typed item carrying a `system.identifier` and its roll config. */
interface ItemWithIdentifier {
    type?: string;
    system?: { identifier?: string; rollConfig?: { skill?: string; modifier?: number } };
}

/** Minimal duck-type for an actor that exposes its owned `items`. Both the acolyte and NPC documents satisfy it. */
interface ActorWithItems {
    items: Iterable<ItemWithIdentifier>;
}

function hasItemsLookup(value: object): value is ActorWithItems {
    return 'items' in value && typeof (value as Partial<ActorWithItems>).items === 'object';
}

/**
 * The Assassin's Strike test this actor's talent authors, or `null` when the
 * actor has no Assassin's Strike talent or the talent's document carries no
 * test skill. Read from the owned talent's `system.rollConfig`.
 */
export function assassinsStrikeTest(actor: WH40KBaseActor | ActorWithItems | null | undefined): AssassinsStrikeTest | null {
    if (actor == null) return null;
    if (!hasItemsLookup(actor)) return null;
    for (const item of actor.items) {
        if (item.type !== 'talent' || item.system?.identifier !== ASSASSINS_STRIKE_IDENTIFIER) continue;
        const config = item.system.rollConfig;
        const skill = config?.skill ?? '';
        if (skill === '') return null;
        return { skill, modifier: config?.modifier ?? 0 };
    }
    return null;
}

/**
 * Predicate — does this actor carry the Assassin's Strike talent with a usable
 * test? Matches by the talent's stable `system.identifier`, not its display name.
 */
export function hasAssassinsStrike(actor: WH40KBaseActor | ActorWithItems | null | undefined): boolean {
    return assassinsStrikeTest(actor) !== null;
}
