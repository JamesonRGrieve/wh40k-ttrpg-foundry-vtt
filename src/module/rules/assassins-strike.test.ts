/**
 * Pinning tests for the Assassin's Strike errata constants and the
 * `hasAssassinsStrike` predicate (#149 — DH2 errata L75).
 *
 *  - The test parameters (Challenging difficulty, Acrobatics skill,
 *    +0 modifier) must not drift; the chat-card dispatch reads them
 *    verbatim and the errata wording locks them in place.
 *  - The predicate accepts the apostrophe and non-apostrophe
 *    spellings the compendium data has used over time.
 */

import { describe, expect, it, vi } from 'vitest';
import { ASSASSINS_STRIKE_TEST, hasAssassinsStrike } from './assassins-strike.ts';

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

    it('returns false when the actor lacks a hasTalent method', () => {
        expect(hasAssassinsStrike({} as never)).toBe(false);
    });

    it("recognises the canonical apostrophe spelling Assassin's Strike", () => {
        const actor = { hasTalent: vi.fn((name: string) => name === "Assassin's Strike") };
        expect(hasAssassinsStrike(actor)).toBe(true);
    });

    it('recognises the apostrophe-less Assassin Strike spelling', () => {
        const actor = { hasTalent: vi.fn((name: string) => name === 'Assassin Strike') };
        expect(hasAssassinsStrike(actor)).toBe(true);
    });

    it('returns false when the actor has unrelated talents', () => {
        const actor = { hasTalent: vi.fn(() => false) };
        expect(hasAssassinsStrike(actor)).toBe(false);
    });
});
