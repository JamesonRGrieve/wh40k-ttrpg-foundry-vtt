import { describe, expect, it } from 'vitest';
import {
    DEATH_TO_OPPOSE_DURATION_ROUNDS,
    MORTIFICATION_OF_THE_FLESH,
    MUTANT_STARTING_CORRUPTION,
    canApplyIncorruptibleDevotion,
    canConvertMalignancyToMutation,
} from './chaos-backgrounds';

/**
 * Contract tests for the Within-supplement background / role mechanics
 * helpers. Pins the constants + predicate semantics so the runtime hooks
 * that consume them (origin-path entries, talent-effect application,
 * Fate-spend bonus duration) cannot drift away from RAW.
 *
 * Covers (partial — each closes the data-layer half of its audit issue):
 *  #91 Mutant background + Twisted Flesh
 *  #92 Adepta Sororitas + Incorruptible Devotion
 *  #93 Fanatic role + Death-to-All-Who-Oppose-Me
 *  #94 Penitent role + Mortification of the Flesh
 *
 * Runtime wiring (origin-path apply, talent test-pipeline hooks, Fate
 * spend dialog) remains per-issue follow-up.
 */

describe('Mutant background (#91, within.md p.32)', () => {
    it('starts a Mutant character with +10 Corruption Points vs the 0 baseline', () => {
        expect(MUTANT_STARTING_CORRUPTION).toBe(10);
    });

    describe('canConvertMalignancyToMutation (Twisted Flesh talent)', () => {
        it('allows the conversion when the talent is present', () => {
            expect(canConvertMalignancyToMutation(true)).toBe(true);
        });
        it('refuses the conversion without the talent', () => {
            expect(canConvertMalignancyToMutation(false)).toBe(false);
        });
    });
});

describe('Adepta Sororitas — Incorruptible Devotion (#92, within.md p.30)', () => {
    it('allows the Corruption → Insanity 1:1 trade when the talent is present', () => {
        expect(canApplyIncorruptibleDevotion(true)).toBe(true);
    });
    it('refuses the trade without the talent', () => {
        expect(canApplyIncorruptibleDevotion(false)).toBe(false);
    });
});

describe('Fanatic role — Death to All Who Oppose Me (#93, within.md p.34)', () => {
    it('grants a 5-round bonus duration on the Fate-spend trigger', () => {
        expect(DEATH_TO_OPPOSE_DURATION_ROUNDS).toBe(5);
    });
});

describe('Penitent role — Mortification of the Flesh (#94, within.md p.36)', () => {
    it('costs 1 Fatigue for +10 WP across all WP tests', () => {
        expect(MORTIFICATION_OF_THE_FLESH.fatigueCost).toBe(1);
        expect(MORTIFICATION_OF_THE_FLESH.wpBonus).toBe(10);
    });
    it('lasts ~1 hour (60 rounds at 1 round/minute narrative pace)', () => {
        expect(MORTIFICATION_OF_THE_FLESH.durationRounds).toBe(60);
    });
});
