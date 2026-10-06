/**
 * Tests for the Black Crusade apotheosis resolver (#182 — BC Core p267).
 *
 * Covers the claim at 100 Corruption, the Infamy-threshold split between
 * Daemon Prince and Chaos Spawn, and the {@link isAscended} predicate.
 */
import { describe, expect, it } from 'vitest';
import { APOTHEOSIS_CORRUPTION, isAscended, resolveApotheosis } from './bc-daemon-prince';

describe('bc-daemon-prince :: constants', () => {
    it('claims the champion at 100 Corruption', () => {
        expect(APOTHEOSIS_CORRUPTION).toBe(100);
    });
});

describe('bc-daemon-prince :: resolveApotheosis', () => {
    it('is not yet claimed below 100 Corruption, whatever the Infamy', () => {
        expect(resolveApotheosis({ corruption: 99, infamy: 150, infamyThreshold: 100 }).claimed).toBe(false);
    });

    it('claims the champion at exactly 100 Corruption', () => {
        expect(resolveApotheosis({ corruption: 100, infamy: 0, infamyThreshold: 100 }).claimed).toBe(true);
    });

    it('makes a Daemon Prince when Infamy meets the GM threshold', () => {
        expect(resolveApotheosis({ corruption: 100, infamy: 100, infamyThreshold: 100 }).outcome).toBe('daemonPrince');
        expect(resolveApotheosis({ corruption: 100, infamy: 76, infamyThreshold: 75 }).outcome).toBe('daemonPrince');
    });

    it('makes a Chaos Spawn when Infamy falls short of the GM threshold', () => {
        expect(resolveApotheosis({ corruption: 100, infamy: 99, infamyThreshold: 100 }).outcome).toBe('chaosSpawn');
        expect(resolveApotheosis({ corruption: 100, infamy: 74, infamyThreshold: 75 }).outcome).toBe('chaosSpawn');
    });

    it('projects the outcome before the claim', () => {
        expect(resolveApotheosis({ corruption: 40, infamy: 90, infamyThreshold: 90 })).toEqual({ claimed: false, outcome: 'daemonPrince' });
    });

    it('sanitises non-finite inputs to 0', () => {
        expect(resolveApotheosis({ corruption: Number.NaN, infamy: Number.NaN, infamyThreshold: 100 })).toEqual({ claimed: false, outcome: 'chaosSpawn' });
    });
});

describe('bc-daemon-prince :: isAscended', () => {
    it('returns false for a null record (never claimed)', () => {
        expect(isAscended(null)).toBe(false);
    });

    it('returns true for any non-null apotheosis record', () => {
        expect(isAscended({ ascendedAt: 7, alignmentAtAscension: 'tzeentch', outcome: 'chaosSpawn' })).toBe(true);
    });
});
