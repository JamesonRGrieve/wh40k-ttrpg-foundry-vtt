/**
 * Pinning tests for the Sanctic Purity / Emperor's Anathema
 * Fate-spend Phenomena negation surface (#131 — beyond.md L877–937).
 *
 *   - `SANCTIC_PURITY_FATE_COST` is locked at 1. The prompt copy
 *     ("Spend 1 Fate to negate this Phenomena roll?") reads this
 *     constant indirectly; drifting it silently would break the
 *     player-facing message and the dispatch decrement together.
 *   - `hasEmperorsAnathema` accepts the apostrophe and
 *     apostrophe-less spellings the compendium data has historically
 *     shipped under.
 */

import { describe, expect, it, vi } from 'vitest';
import { SANCTIC_PURITY_FATE_COST, hasEmperorsAnathema } from './sanctic-purity.ts';

describe('SANCTIC_PURITY_FATE_COST (#131)', () => {
    it('pins the Fate cost at 1', () => {
        expect(SANCTIC_PURITY_FATE_COST).toBe(1);
    });
});

describe('hasEmperorsAnathema predicate (#131)', () => {
    it('returns false for null / undefined actors', () => {
        expect(hasEmperorsAnathema(null)).toBe(false);
        expect(hasEmperorsAnathema(undefined)).toBe(false);
    });

    it('returns false when the actor lacks a hasTalent method', () => {
        expect(hasEmperorsAnathema({} as never)).toBe(false);
    });

    it("recognises the canonical apostrophe spelling Emperor's Anathema", () => {
        const actor = { hasTalent: vi.fn((name: string) => name === "Emperor's Anathema") };
        expect(hasEmperorsAnathema(actor)).toBe(true);
    });

    it('recognises the apostrophe-less Emperors Anathema spelling', () => {
        const actor = { hasTalent: vi.fn((name: string) => name === 'Emperors Anathema') };
        expect(hasEmperorsAnathema(actor)).toBe(true);
    });

    it('returns false when the actor has unrelated talents', () => {
        const actor = { hasTalent: vi.fn(() => false) };
        expect(hasEmperorsAnathema(actor)).toBe(false);
    });
});
