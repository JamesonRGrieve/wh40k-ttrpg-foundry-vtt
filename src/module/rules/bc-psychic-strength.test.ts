/**
 * Tests for Black Crusade Psychic Strength resolver (#178).
 *
 * Covers push-ceiling table lookups, fettered/unfettered/push PR
 * arithmetic, phenomena-roll counts per mode, sustain penalty scaling,
 * and the composed `resolvePsychicTest` helper.
 */
import { describe, expect, it } from 'vitest';
import {
    BC_PSY_SUSTAIN_PENALTY_PER_POWER,
    BC_PSYKER_PUSH_CEILING,
    effectivePsyRating,
    maxPushLevel,
    phenomenaRollCount,
    resolvePsychicTest,
    sustainPenalty,
    type PsykerClass,
} from './bc-psychic-strength';

describe('bc-psychic-strength :: push ceilings', () => {
    it('exposes the RAW Table 6-1 ceilings', () => {
        expect(BC_PSYKER_PUSH_CEILING.bound).toBe(3);
        expect(BC_PSYKER_PUSH_CEILING.unbound).toBe(5);
        expect(BC_PSYKER_PUSH_CEILING.daemonic).toBe(4);
    });

    it('maxPushLevel returns the per-class ceiling', () => {
        expect(maxPushLevel('bound')).toBe(3);
        expect(maxPushLevel('unbound')).toBe(5);
        expect(maxPushLevel('daemonic')).toBe(4);
    });
});

describe('bc-psychic-strength :: effectivePsyRating', () => {
    it('fettered halves base PR (round down) for even base', () => {
        expect(effectivePsyRating({ mode: 'fettered', basePR: 4, pushLevel: 0, psykerClass: 'bound' })).toBe(2);
    });

    it('fettered halves base PR (round down) for odd base', () => {
        expect(effectivePsyRating({ mode: 'fettered', basePR: 5, pushLevel: 0, psykerClass: 'unbound' })).toBe(2);
        expect(effectivePsyRating({ mode: 'fettered', basePR: 7, pushLevel: 0, psykerClass: 'daemonic' })).toBe(3);
    });

    it('fettered ignores push level entirely', () => {
        expect(effectivePsyRating({ mode: 'fettered', basePR: 6, pushLevel: 4, psykerClass: 'unbound' })).toBe(3);
    });

    it('unfettered returns base PR unchanged', () => {
        expect(effectivePsyRating({ mode: 'unfettered', basePR: 4, pushLevel: 0, psykerClass: 'bound' })).toBe(4);
        expect(effectivePsyRating({ mode: 'unfettered', basePR: 5, pushLevel: 3, psykerClass: 'unbound' })).toBe(5);
    });

    it('push adds the chosen level to base PR', () => {
        expect(effectivePsyRating({ mode: 'push', basePR: 3, pushLevel: 1, psykerClass: 'bound' })).toBe(4);
        expect(effectivePsyRating({ mode: 'push', basePR: 4, pushLevel: 2, psykerClass: 'daemonic' })).toBe(6);
    });

    it('push clamps to the class ceiling', () => {
        // bound caps at +3 — request +5
        expect(effectivePsyRating({ mode: 'push', basePR: 3, pushLevel: 5, psykerClass: 'bound' })).toBe(6);
        // unbound caps at +5 — request +9
        expect(effectivePsyRating({ mode: 'push', basePR: 4, pushLevel: 9, psykerClass: 'unbound' })).toBe(9);
        // daemonic caps at +4 — request +7
        expect(effectivePsyRating({ mode: 'push', basePR: 3, pushLevel: 7, psykerClass: 'daemonic' })).toBe(7);
    });

    it('sanitises negative or non-finite inputs', () => {
        expect(effectivePsyRating({ mode: 'unfettered', basePR: -3, pushLevel: 0, psykerClass: 'bound' })).toBe(0);
        expect(effectivePsyRating({ mode: 'fettered', basePR: Number.NaN, pushLevel: 0, psykerClass: 'bound' })).toBe(0);
        expect(effectivePsyRating({ mode: 'push', basePR: 4, pushLevel: -2, psykerClass: 'unbound' })).toBe(4);
    });
});

describe('bc-psychic-strength :: phenomenaRollCount', () => {
    it('fettered triggers zero phenomena rolls', () => {
        expect(phenomenaRollCount({ mode: 'fettered', pushLevel: 0 })).toBe(0);
        expect(phenomenaRollCount({ mode: 'fettered', pushLevel: 3 })).toBe(0);
    });

    it('unfettered triggers exactly one phenomena roll', () => {
        expect(phenomenaRollCount({ mode: 'unfettered', pushLevel: 0 })).toBe(1);
        expect(phenomenaRollCount({ mode: 'unfettered', pushLevel: 4 })).toBe(1);
    });

    it('push triggers 1 + push level phenomena rolls', () => {
        expect(phenomenaRollCount({ mode: 'push', pushLevel: 0 })).toBe(1);
        expect(phenomenaRollCount({ mode: 'push', pushLevel: 1 })).toBe(2);
        expect(phenomenaRollCount({ mode: 'push', pushLevel: 3 })).toBe(4);
        expect(phenomenaRollCount({ mode: 'push', pushLevel: 5 })).toBe(6);
    });

    it('sanitises negative push level under push mode', () => {
        expect(phenomenaRollCount({ mode: 'push', pushLevel: -3 })).toBe(1);
    });
});

describe('bc-psychic-strength :: sustainPenalty', () => {
    it('exposes the RAW per-power penalty constant', () => {
        expect(BC_PSY_SUSTAIN_PENALTY_PER_POWER).toBe(-10);
    });

    it('is zero when no powers are sustained', () => {
        expect(sustainPenalty(0)).toBe(0);
    });

    it('is zero with a single sustained power (RAW: first is free)', () => {
        expect(sustainPenalty(1)).toBe(0);
    });

    it('is -10 per additional power beyond the first', () => {
        expect(sustainPenalty(2)).toBe(-10);
        expect(sustainPenalty(3)).toBe(-20);
        expect(sustainPenalty(4)).toBe(-30);
    });

    it('clamps negative counts to zero', () => {
        expect(sustainPenalty(-5)).toBe(0);
    });

    it('truncates fractional counts before applying', () => {
        expect(sustainPenalty(2.9)).toBe(-10);
    });
});

describe('bc-psychic-strength :: resolvePsychicTest', () => {
    it('composes a fettered cast with no sustains', () => {
        const result = resolvePsychicTest({
            psykerClass: 'unbound',
            mode: 'fettered',
            basePR: 5,
            pushLevel: 0,
            sustainedPowerCount: 0,
        });
        expect(result.effectivePR).toBe(2);
        expect(result.sustainPenalty).toBe(0);
        expect(result.phenomenaRolls).toBe(0);
    });

    it('composes an unfettered cast with one existing sustain (no penalty)', () => {
        const result = resolvePsychicTest({
            psykerClass: 'bound',
            mode: 'unfettered',
            basePR: 4,
            pushLevel: 0,
            sustainedPowerCount: 1,
        });
        expect(result.effectivePR).toBe(4);
        expect(result.sustainPenalty).toBe(0);
        expect(result.phenomenaRolls).toBe(1);
    });

    it('composes a push cast clamped by class ceiling, phenomena uses clamped value', () => {
        const result = resolvePsychicTest({
            psykerClass: 'bound', // ceiling +3
            mode: 'push',
            basePR: 4,
            pushLevel: 5, // requested above ceiling
            sustainedPowerCount: 2, // -10 penalty
        });
        // PR = 4 + min(5, 3) = 7; phenomena = 1 + 3 = 4
        expect(result.effectivePR).toBe(7);
        expect(result.sustainPenalty).toBe(-10);
        expect(result.phenomenaRolls).toBe(4);
    });

    it('composes a push cast for an unbound psyker at full ceiling with three sustains', () => {
        const result = resolvePsychicTest({
            psykerClass: 'unbound', // ceiling +5
            mode: 'push',
            basePR: 5,
            pushLevel: 5,
            sustainedPowerCount: 3, // -20 penalty
        });
        expect(result.effectivePR).toBe(10);
        expect(result.sustainPenalty).toBe(-20);
        expect(result.phenomenaRolls).toBe(6);
    });

    it('composes a daemonic push at a sub-ceiling level', () => {
        const result = resolvePsychicTest({
            psykerClass: 'daemonic', // ceiling +4
            mode: 'push',
            basePR: 3,
            pushLevel: 2,
            sustainedPowerCount: 0,
        });
        expect(result.effectivePR).toBe(5);
        expect(result.sustainPenalty).toBe(0);
        expect(result.phenomenaRolls).toBe(3);
    });

    it('handles every psyker class through the composed resolver', () => {
        const classes: PsykerClass[] = ['bound', 'unbound', 'daemonic'];
        for (const psykerClass of classes) {
            const result = resolvePsychicTest({
                psykerClass,
                mode: 'unfettered',
                basePR: 4,
                pushLevel: 0,
                sustainedPowerCount: 0,
            });
            expect(result.effectivePR).toBe(4);
            expect(result.sustainPenalty).toBe(0);
            expect(result.phenomenaRolls).toBe(1);
        }
    });
});
