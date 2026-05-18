import { describe, expect, it } from 'vitest';
import { composePhenomenaModifier } from './phenomena-modifier';

/**
 * Tests for the shared Phenomena-modifier composer (#137 — subsumes #97).
 *
 * RAW sources:
 *  - beyond.md L4605 — per-scene Warp weakness.
 *  - within.md p. 58 — per-actor Tainted Psyker (+5/CP from push).
 */
describe('composePhenomenaModifier (#137)', () => {
    describe('baseline (no triggers)', () => {
        it('returns all-zero / false when neither trigger is active', () => {
            const r = composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 0 });
            expect(r).toEqual({
                focusModifier: 0,
                phenomenaModifier: 0,
                ladderStepIncrement: 0,
                autoTriggerOnOddOr9: false,
            });
        });
    });

    describe('per-scene Warp weakness (beyond.md L4605)', () => {
        it('grants +10 Focus Power, +1 ladder step, and the odd/9 auto-trigger', () => {
            const r = composePhenomenaModifier({ warpWeakness: true, taintedPsykerPushCP: 0 });
            expect(r.focusModifier).toBe(10);
            expect(r.ladderStepIncrement).toBe(1);
            expect(r.autoTriggerOnOddOr9).toBe(true);
            // Warp weakness does NOT modify the Phenomena roll value directly
            // (that's the Tainted Psyker pathway).
            expect(r.phenomenaModifier).toBe(0);
        });
    });

    describe('per-actor Tainted Psyker (within.md p.58)', () => {
        it('adds +5 to the Phenomena roll per CP gained from voluntary push', () => {
            expect(composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 1 }).phenomenaModifier).toBe(5);
            expect(composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 3 }).phenomenaModifier).toBe(15);
            expect(composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 10 }).phenomenaModifier).toBe(50);
        });

        it('does NOT emit Focus / ladder / auto-trigger riders (those are scene-only)', () => {
            const r = composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: 5 });
            expect(r.focusModifier).toBe(0);
            expect(r.ladderStepIncrement).toBe(0);
            expect(r.autoTriggerOnOddOr9).toBe(false);
        });

        it('treats negative or non-finite CP as zero', () => {
            expect(composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: -3 }).phenomenaModifier).toBe(0);
            expect(composePhenomenaModifier({ warpWeakness: false, taintedPsykerPushCP: Number.NaN }).phenomenaModifier).toBe(0);
        });
    });

    describe('both triggers active simultaneously', () => {
        it('sums numeric riders and ORs the booleans', () => {
            const r = composePhenomenaModifier({ warpWeakness: true, taintedPsykerPushCP: 2 });
            expect(r.focusModifier).toBe(10);
            expect(r.phenomenaModifier).toBe(10);
            expect(r.ladderStepIncrement).toBe(1);
            expect(r.autoTriggerOnOddOr9).toBe(true);
        });
    });
});
