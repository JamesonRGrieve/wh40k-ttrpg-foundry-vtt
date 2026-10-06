/**
 * Pinning tests for the Assassin's Strike test lookup and the
 * `hasAssassinsStrike` predicate (#149 — DH2 errata L75).
 *
 *  - The test (skill + modifier) is read from the owned talent document's
 *    `system.rollConfig`, never from a constant in `src/`.
 *  - The talent is matched by its stable `system.identifier`
 *    ('assassinStrike'), not its display name.
 */

import { describe, expect, it } from 'vitest';
import { assassinsStrikeTest, hasAssassinsStrike } from './assassins-strike.ts';

interface StubItem {
    type?: string;
    system?: { identifier?: string; rollConfig?: { skill?: string; modifier?: number } };
}

/** A minimal actor exposing an `items` iterable of owned-item stubs. */
function actorWithItems(items: StubItem[]): { items: Iterable<StubItem> } {
    return { items };
}

const assassinTalent = (rollConfig: { skill?: string; modifier?: number }): StubItem => ({
    type: 'talent',
    system: { identifier: 'assassinStrike', rollConfig },
});

describe('assassinsStrikeTest (#149)', () => {
    it("reads the skill and modifier from the talent document's rollConfig", () => {
        const actor = actorWithItems([assassinTalent({ skill: 'acrobatics', modifier: 0 })]);
        expect(assassinsStrikeTest(actor)).toEqual({ skill: 'acrobatics', modifier: 0 });
    });

    it('carries whatever modifier the document authors', () => {
        const actor = actorWithItems([assassinTalent({ skill: 'acrobatics', modifier: -10 })]);
        expect(assassinsStrikeTest(actor)).toEqual({ skill: 'acrobatics', modifier: -10 });
    });

    it('returns null when the talent document carries no test skill', () => {
        const actor = actorWithItems([assassinTalent({ skill: '' })]);
        expect(assassinsStrikeTest(actor)).toBeNull();
    });

    it('returns null for an actor without the talent', () => {
        expect(assassinsStrikeTest(actorWithItems([]))).toBeNull();
        expect(assassinsStrikeTest(null)).toBeNull();
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
        expect(hasAssassinsStrike(actorWithItems([assassinTalent({ skill: 'acrobatics', modifier: 0 })]))).toBe(true);
    });

    it('ignores a non-talent item that happens to share the identifier', () => {
        const actor = actorWithItems([{ type: 'trait', system: { identifier: 'assassinStrike', rollConfig: { skill: 'acrobatics' } } }]);
        expect(hasAssassinsStrike(actor)).toBe(false);
    });

    it('returns false when the actor has only unrelated talents', () => {
        const actor = actorWithItems([{ type: 'talent', system: { identifier: 'crushingBlow' } }]);
        expect(hasAssassinsStrike(actor)).toBe(false);
    });
});
