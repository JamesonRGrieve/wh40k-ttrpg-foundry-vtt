import { describe, expect, it } from 'vitest';
import { gameSystemPackPrefix } from './game-system-pack-prefix.ts';

/**
 * Pure mapping helper — no Foundry globals, runs for real in happy-dom.
 * Guards the single source of truth that several call sites
 * (compendium-resync, origin-path backfill, character-sheet origin options,
 * inventory generator) now share.
 */
describe('gameSystemPackPrefix', () => {
    it('strips the trailing edition "e" for the two Dark Heresy editions', () => {
        expect(gameSystemPackPrefix('dh1e')).toBe('dh1');
        expect(gameSystemPackPrefix('dh2e')).toBe('dh2');
    });

    it('passes every other system id through unchanged', () => {
        expect(gameSystemPackPrefix('bc')).toBe('bc');
        expect(gameSystemPackPrefix('dw')).toBe('dw');
        expect(gameSystemPackPrefix('ow')).toBe('ow');
        expect(gameSystemPackPrefix('rt')).toBe('rt');
        expect(gameSystemPackPrefix('im')).toBe('im');
    });

    it('returns an empty string for an absent system id', () => {
        expect(gameSystemPackPrefix(undefined)).toBe('');
    });
});
