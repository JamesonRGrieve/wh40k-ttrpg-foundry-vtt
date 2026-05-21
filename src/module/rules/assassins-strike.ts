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

/** Localized & alternate spellings the errata + supplements have used. */
const TALENT_NAMES: readonly string[] = ["Assassin's Strike", 'Assassin Strike', 'Assassins Strike'];

/**
 * Minimal duck-type for an actor that exposes the `hasTalent` lookup.
 * Both the DH2 acolyte document and the NPC document satisfy this
 * shape (`hasTalent(name: string): boolean`).
 */
interface ActorWithTalentLookup {
    hasTalent: (talent: string) => boolean;
}

/**
 * Predicate — does this actor carry the Assassin's Strike talent?
 * Tolerates the apostrophe / non-apostrophe spellings the compendium
 * data has historically shipped under.
 */
function hasTalentLookup(value: object): value is ActorWithTalentLookup {
    return 'hasTalent' in value && typeof (value as Partial<ActorWithTalentLookup>).hasTalent === 'function';
}

export function hasAssassinsStrike(actor: WH40KBaseActor | ActorWithTalentLookup | null | undefined): boolean {
    if (actor == null) return false;
    if (!hasTalentLookup(actor)) return false;
    return TALENT_NAMES.some((name) => actor.hasTalent(name));
}
