import { describe, expect, it } from 'vitest';
import { adjustPactDisposition, getDiscoverySubtletyHit, type PactDefinition, type PactDisposition } from './dark-pact';

/**
 * Dark Pacts (#84 — beyond.md p.72). Disposition runs −3..+3 with
 * direction shifts based on whether the pact-maker honours payment.
 * Subtlety hits fire when the pact is discovered (canonical entry
 * point is `WH40KBaseActor.applySubtletyFromSource(pactUuid)`).
 */
describe('adjustPactDisposition (#84)', () => {
    it('clamps within the ±3 range', () => {
        expect(adjustPactDisposition(0, +5)).toBe(3);
        expect(adjustPactDisposition(0, -5)).toBe(-3);
        expect(adjustPactDisposition(3 satisfies PactDisposition, +2)).toBe(3);
        expect(adjustPactDisposition(-3 satisfies PactDisposition, -2)).toBe(-3);
    });

    it('applies the delta inside the range', () => {
        expect(adjustPactDisposition(0, +1)).toBe(1);
        expect(adjustPactDisposition(0, -1)).toBe(-1);
        expect(adjustPactDisposition(2, -1)).toBe(1);
    });

    it('truncates fractional deltas', () => {
        expect(adjustPactDisposition(0, 1.7)).toBe(1);
    });
});

describe('getDiscoverySubtletyHit (#84)', () => {
    const pact = (penalty: number): PactDefinition => ({
        id: 'test-pact',
        boon: 'B',
        bane: 'B',
        initialDisposition: 0,
        discoverySubtletyPenalty: penalty,
    });

    it('returns the non-negative magnitude of the subtlety penalty', () => {
        expect(getDiscoverySubtletyHit(pact(3))).toBe(3);
        expect(getDiscoverySubtletyHit(pact(8))).toBe(8);
    });

    it('floors at 0 (never returns a negative)', () => {
        expect(getDiscoverySubtletyHit(pact(0))).toBe(0);
        expect(getDiscoverySubtletyHit(pact(-5))).toBe(0);
    });

    it('truncates fractional penalties', () => {
        expect(getDiscoverySubtletyHit(pact(2.7))).toBe(2);
    });
});
