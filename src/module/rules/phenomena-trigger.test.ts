import { describe, expect, it } from 'vitest';
import { resolvePhenomenaTrigger, type PhenomenaTriggerInput } from './phenomena-modifier';

/**
 * Tests for the single Phenomena composition point (#137, #514).
 *
 * These cover the two inputs that were previously DROPPED on the floor:
 *
 *  - Push mode's `forcePhenomena` / `phenomenaModifier`. The roll dialog computed
 *    both via `resolvePsyMode` and wrote them onto the roll data as
 *    `psyForcePhenomena` / `psyPhenomenaModifier`, and nothing read them — so
 *    pushing a power carried no phenomena consequence beyond the ordinary doubles
 *    rule.
 *  - The per-scene Warp-weakness riders, whose composer had no consumer at all.
 */

const base: PhenomenaTriggerInput = {
    rollTotal: 34,
    isDoubles: false,
    overchannelling: false,
    psyForcePhenomena: false,
    psyPhenomenaModifier: 0,
    powerPhenomenaModifier: 0,
    warpWeakness: false,
    taintedPsykerPushCP: 0,
};

const input = (over: Partial<PhenomenaTriggerInput> = {}): PhenomenaTriggerInput => ({ ...base, ...over });

describe('resolvePhenomenaTrigger — RAW base rules', () => {
    it('does not fire on an ordinary non-double', () => {
        expect(resolvePhenomenaTrigger(input()).triggered).toBe(false);
    });

    it('fires on doubles for an ordinary cast', () => {
        expect(resolvePhenomenaTrigger(input({ rollTotal: 33, isDoubles: true })).triggered).toBe(true);
    });

    it('inverts for an overchannelling cast — any NON-double fires', () => {
        expect(resolvePhenomenaTrigger(input({ overchannelling: true })).triggered).toBe(true);
        expect(resolvePhenomenaTrigger(input({ rollTotal: 33, isDoubles: true, overchannelling: true })).triggered).toBe(false);
    });
});

describe('resolvePhenomenaTrigger — Push (the dropped input)', () => {
    it('forces a draw even on a non-double ordinary cast', () => {
        // Before this composition point existed, a push on a non-double simply did
        // not draw: the dialog set psyForcePhenomena and nothing consulted it.
        const out = resolvePhenomenaTrigger(input({ psyForcePhenomena: true }));
        expect(out.triggered).toBe(true);
    });

    it('adds the push escalation to the phenomena roll', () => {
        const out = resolvePhenomenaTrigger(input({ psyForcePhenomena: true, psyPhenomenaModifier: 15 }));
        expect(out.modifier).toBe(15);
    });

    it('stacks the power modifier, the push escalation and the tainted-psyker rider', () => {
        const out = resolvePhenomenaTrigger(
            input({
                isDoubles: true,
                rollTotal: 44,
                powerPhenomenaModifier: 10,
                psyPhenomenaModifier: 5,
                taintedPsykerPushCP: 2,
            }),
        );
        // 10 (power) + 5 (push) + 2 CP x 5 = 25
        expect(out.modifier).toBe(25);
    });
});

describe('resolvePhenomenaTrigger — per-scene Warp weakness', () => {
    it('fires on an odd total that would not otherwise trigger', () => {
        const out = resolvePhenomenaTrigger(input({ rollTotal: 37, warpWeakness: true }));
        expect(out.triggered).toBe(true);
    });

    it('fires on a 9', () => {
        expect(resolvePhenomenaTrigger(input({ rollTotal: 9, warpWeakness: true })).triggered).toBe(true);
    });

    it('leaves an even non-double alone', () => {
        expect(resolvePhenomenaTrigger(input({ rollTotal: 34, warpWeakness: true })).triggered).toBe(false);
    });

    it('escalates the ladder by one step', () => {
        expect(resolvePhenomenaTrigger(input({ rollTotal: 37, warpWeakness: true })).ladderStep).toBe(1);
        expect(resolvePhenomenaTrigger(input({ rollTotal: 37 })).ladderStep).toBe(0);
    });

    it('does not escalate the ladder when the scene is not Warp-weak', () => {
        const out = resolvePhenomenaTrigger(input({ rollTotal: 33, isDoubles: true, psyForcePhenomena: true }));
        expect(out.ladderStep).toBe(0);
    });
});

describe('resolvePhenomenaTrigger — robustness', () => {
    it('treats a non-finite roll total as 0 rather than propagating NaN', () => {
        const out = resolvePhenomenaTrigger(input({ rollTotal: Number.NaN, warpWeakness: true }));
        expect(out.triggered).toBe(false);
        expect(Number.isNaN(out.modifier)).toBe(false);
    });

    it('ignores non-finite modifiers instead of poisoning the total', () => {
        // A NaN modifier would make the phenomena Roll formula unevaluable, which
        // surfaces as a bare number on the card instead of a resolved effect.
        const out = resolvePhenomenaTrigger(
            input({
                isDoubles: true,
                rollTotal: 44,
                powerPhenomenaModifier: Number.NaN,
                psyPhenomenaModifier: 10,
            }),
        );
        expect(out.modifier).toBe(10);
    });
});
