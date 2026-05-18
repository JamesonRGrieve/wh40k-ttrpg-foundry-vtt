/**
 * Sanctic Purity / Emperor's Anathema (#131 — beyond.md L877–937).
 *
 * The Emperor's Anathema talent (with the Sanctic Purity rider where
 * the actor also draws from the Sanctic discipline) lets the bearer
 * spend a single Fate point to negate a Psychic Phenomena roll
 * outright — the result is discarded and no Phenomena occurs.
 *
 * This module exposes the two pieces shared by the Fate-spend prompt
 * (`sanctic-purity-prompt.ts`), the chat-card emission, and the
 * Phenomena dispatch path:
 *
 *   - `SANCTIC_PURITY_FATE_COST` — number of Fate points the negation
 *     consumes (always 1; pinned so the prompt and the dispatch don't
 *     drift out of sync).
 *   - `hasEmperorsAnathema(actor)` — predicate that the Phenomena
 *     hook calls before offering the prompt.
 *
 * The talent name is matched permissively to absorb the apostrophe /
 * non-apostrophe spellings the compendium data has historically
 * shipped under (compare `assassins-strike.ts`).
 */

import type { WH40KBaseActor } from '../types/global.d.ts';

/** Fate cost paid when accepting the negation prompt. */
export const SANCTIC_PURITY_FATE_COST = 1 as const;

/**
 * Canonical and alternate spellings of the Emperor's Anathema talent.
 * Sorted longest → shortest so the apostrophe form wins lookups when
 * both are present in a duck-typed `hasTalent` implementation that
 * does substring matching.
 */
const TALENT_NAMES: readonly string[] = [
    "Emperor's Anathema",
    'Emperors Anathema',
    'Emperor Anathema',
];

/**
 * Minimal duck-type for an actor that exposes the `hasTalent` lookup.
 * Both the DH2 acolyte document and the NPC document satisfy this
 * shape — keep the surface narrow so unit tests can stub it without
 * standing up a full Foundry actor.
 */
interface ActorWithTalentLookup {
    hasTalent: (talent: string) => boolean;
}

/**
 * Predicate — does this actor carry the Emperor's Anathema talent?
 * Tolerant of the apostrophe / non-apostrophe spellings the
 * compendium data has historically shipped under. Returns `false`
 * for `null` / `undefined` actors and for actors without a
 * `hasTalent` method, so the caller can use it as a plain guard.
 */
export function hasEmperorsAnathema(actor: WH40KBaseActor | ActorWithTalentLookup | null | undefined): boolean {
    if (actor == null) return false;
    const lookup = actor as unknown as Partial<ActorWithTalentLookup>;
    const hasTalent = lookup.hasTalent;
    if (typeof hasTalent !== 'function') return false;
    return TALENT_NAMES.some((name) => hasTalent.call(lookup, name));
}
