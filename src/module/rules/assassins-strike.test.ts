/**
 * Pinning tests for the Assassin's Strike errata constants and the
 * `hasAssassinsStrike` predicate (#149 — DH2 errata L75).
 *
 *  - The test parameters (Challenging difficulty, Acrobatics skill,
 *    +0 modifier) must not drift; the chat-card dispatch reads them
 *    verbatim and the errata wording locks them in place.
 *  - The predicate matches the talent by its stable `system.identifier`
 *    ('assassinStrike'), not its display name.
 */

import { describe, expect, it } from 'vitest';
import { ASSASSINS_STRIKE_TEST, hasAssassinsStrike } from './assassins-strike.ts';

/** A minimal actor exposing an `items` iterable of `{ type, system.identifier }`. */
function actorWithItems(items: { type?: string; system?: { identifier?: string } }[]): {
    items: Iterable<{ type?: string; system?: { identifier?: string } }>;
} {
    return { items };
}

describe('ASSASSINS_STRIKE_TEST constants (#149 — errata L75)', () => {
    it('pins the test difficulty to Challenging (+0)', () => {
        expect(ASSASSINS_STRIKE_TEST.difficulty).toBe('challenging');
        expect(ASSASSINS_STRIKE_TEST.modifier).toBe(0);
    });

    it('pins the skill to Acrobatics', () => {
        expect(ASSASSINS_STRIKE_TEST.skill).toBe('acrobatics');
    });
});

describe('hasAssassinsStrike predicate (#149)', () => {
    it('returns false for null / undefined actors', () => {
        expect(hasAssassinsStrike(null)).toBe(false);
        expect(hasAssassinsStrike(undefined)).toBe(false);
    });

    it('returns false when the actor exposes no items iterable', () => {
        expect(hasAssassinsStrike({} as never)).toBe(false);
    });

    it('recognises the talent by its stable system.identifier', () => {
        const actor = actorWithItems([{ type: 'talent', system: { identifier: 'assassinStrike' } }]);
        expect(hasAssassinsStrike(actor)).toBe(true);
    });

    it('ignores a non-talent item that happens to share the identifier', () => {
        const actor = actorWithItems([{ type: 'trait', system: { identifier: 'assassinStrike' } }]);
        expect(hasAssassinsStrike(actor)).toBe(false);
    });

    it('returns false when the actor has only unrelated talents', () => {
        const actor = actorWithItems([{ type: 'talent', system: { identifier: 'crushingBlow' } }]);
        expect(hasAssassinsStrike(actor)).toBe(false);
    });
});
