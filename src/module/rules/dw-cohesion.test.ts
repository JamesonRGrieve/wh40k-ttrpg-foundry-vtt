import { describe, expect, it } from 'vitest';
import {
    applyCohesionDamage,
    cohesionChallenge,
    COHESION_CHALLENGE_DIE_SIZE,
    COHESION_DAMAGE_PER_TURN_CAP,
    COHESION_DAMAGE_THRESHOLD,
    maxCohesion,
    recoverCohesion,
    type CohesionRng,
} from './dw-cohesion';

/**
 * RAW Kill-team Cohesion resolver tests (#162 — core.md §"COHESION").
 *
 * Mental-math style: every literal assertion is grounded in a single
 * RAW citation and a hand-checked value, so failures fingerprint to a
 * specific rule rather than a vague "math drifted".
 */

/** Build a deterministic RNG that returns the supplied values in order. */
function scriptedRng(values: readonly number[]): CohesionRng {
    let i = 0;
    return (_size: number): number => {
        const v = values[i] ?? values[values.length - 1] ?? 1;
        i++;
        return v;
    };
}

describe('Constants', () => {
    it('threshold is 10 pre-soak damage', () => {
        expect(COHESION_DAMAGE_THRESHOLD).toBe(10);
    });
    it('per-turn cap is 1 point', () => {
        expect(COHESION_DAMAGE_PER_TURN_CAP).toBe(1);
    });
    it('challenge die is d10', () => {
        expect(COHESION_CHALLENGE_DIE_SIZE).toBe(10);
    });
});

describe('maxCohesion — leader FelBonus + Rank/Command (Table 7-8)', () => {
    it('FB 4 + Rank value 3 → 7', () => {
        expect(maxCohesion(4, 3)).toBe(7);
    });
    it('FB 0 + Rank value 0 → 0', () => {
        expect(maxCohesion(0, 0)).toBe(0);
    });
    it('FB 5 + Rank value 5 → 10 (top of the band)', () => {
        expect(maxCohesion(5, 5)).toBe(10);
    });
    it('non-finite inputs sanitise to 0', () => {
        expect(maxCohesion(Number.NaN, 4)).toBe(4);
        expect(maxCohesion(3, Number.NaN)).toBe(3);
    });
    it('negative inputs clamp to 0', () => {
        expect(maxCohesion(-2, 4)).toBe(4);
        expect(maxCohesion(4, -7)).toBe(4);
    });
    it('fractional inputs truncate (FB is integer division)', () => {
        expect(maxCohesion(4.9, 3.1)).toBe(7);
    });
});

describe('applyCohesionDamage — ≥10 pre-soak from qualifying weapons strips 1', () => {
    it('10 damage from Accurate-basic strips 1 (boundary)', () => {
        const result = applyCohesionDamage({
            damage: 10,
            weapon: 'accurate-basic',
            currentCohesion: 5,
            alreadyLostThisTurn: 0,
            rallied: false,
        });
        expect(result.cohesionLost).toBe(1);
        expect(result.newCohesion).toBe(4);
        expect(result.reason).toBe('lost');
    });
    it('15 damage from Blast strips 1', () => {
        const result = applyCohesionDamage({
            damage: 15,
            weapon: 'blast',
            currentCohesion: 6,
            alreadyLostThisTurn: 0,
            rallied: false,
        });
        expect(result.cohesionLost).toBe(1);
        expect(result.newCohesion).toBe(5);
    });
    it('20 damage from Devastating strips 1', () => {
        const result = applyCohesionDamage({
            damage: 20,
            weapon: 'devastating',
            currentCohesion: 6,
            alreadyLostThisTurn: 0,
            rallied: false,
        });
        expect(result.cohesionLost).toBe(1);
    });
    it('9 damage (below threshold) → 0 loss, reason below-threshold', () => {
        const result = applyCohesionDamage({
            damage: 9,
            weapon: 'blast',
            currentCohesion: 6,
            alreadyLostThisTurn: 0,
            rallied: false,
        });
        expect(result.cohesionLost).toBe(0);
        expect(result.newCohesion).toBe(6);
        expect(result.reason).toBe('below-threshold');
    });
    it('unqualified weapon (null) → 0 loss, reason unqualified-weapon', () => {
        const result = applyCohesionDamage({
            damage: 30,
            weapon: null,
            currentCohesion: 6,
            alreadyLostThisTurn: 0,
            rallied: false,
        });
        expect(result.cohesionLost).toBe(0);
        expect(result.reason).toBe('unqualified-weapon');
    });
    it('per-turn cap: a second qualifying hit does NOT remove another point', () => {
        const result = applyCohesionDamage({
            damage: 25,
            weapon: 'devastating',
            currentCohesion: 4,
            alreadyLostThisTurn: 1,
            rallied: false,
        });
        expect(result.cohesionLost).toBe(0);
        expect(result.newCohesion).toBe(4);
        expect(result.reason).toBe('cap-reached');
    });
    it('successful rally negates a qualifying hit', () => {
        const result = applyCohesionDamage({
            damage: 50,
            weapon: 'blast',
            currentCohesion: 3,
            alreadyLostThisTurn: 0,
            rallied: true,
        });
        expect(result.cohesionLost).toBe(0);
        expect(result.newCohesion).toBe(3);
        expect(result.reason).toBe('rallied');
    });
    it('squad at 0 Cohesion cannot drop further', () => {
        const result = applyCohesionDamage({
            damage: 99,
            weapon: 'devastating',
            currentCohesion: 0,
            alreadyLostThisTurn: 0,
            rallied: false,
        });
        expect(result.cohesionLost).toBe(0);
        expect(result.newCohesion).toBe(0);
        expect(result.reason).toBe('already-empty');
    });
    it('NaN damage is treated as below threshold (defensive)', () => {
        const result = applyCohesionDamage({
            damage: Number.NaN,
            weapon: 'blast',
            currentCohesion: 4,
            alreadyLostThisTurn: 0,
            rallied: false,
        });
        expect(result.cohesionLost).toBe(0);
        expect(result.reason).toBe('below-threshold');
    });
    it('negative currentCohesion sanitises to 0 → already-empty', () => {
        const result = applyCohesionDamage({
            damage: 20,
            weapon: 'blast',
            currentCohesion: -3,
            alreadyLostThisTurn: 0,
            rallied: false,
        });
        expect(result.newCohesion).toBe(0);
        expect(result.reason).toBe('already-empty');
    });
});

describe('cohesionChallenge — roll 1d10 ≤ current Cohesion', () => {
    it('roll equal to Cohesion is a success', () => {
        const result = cohesionChallenge({ currentCohesion: 5, rng: scriptedRng([5]) });
        expect(result.rolled).toBe(5);
        expect(result.success).toBe(true);
    });
    it('roll below Cohesion is a success', () => {
        const result = cohesionChallenge({ currentCohesion: 7, rng: scriptedRng([3]) });
        expect(result.rolled).toBe(3);
        expect(result.success).toBe(true);
    });
    it('roll above Cohesion is a failure', () => {
        const result = cohesionChallenge({ currentCohesion: 4, rng: scriptedRng([8]) });
        expect(result.rolled).toBe(8);
        expect(result.success).toBe(false);
    });
    it('Cohesion 0 → automatic failure (no roll can be ≤ 0)', () => {
        const result = cohesionChallenge({ currentCohesion: 0, rng: scriptedRng([1]) });
        expect(result.rolled).toBe(1);
        expect(result.success).toBe(false);
    });
    it('clamps RNG output above die size', () => {
        const result = cohesionChallenge({ currentCohesion: 10, rng: scriptedRng([99]) });
        expect(result.rolled).toBe(10);
        expect(result.success).toBe(true);
    });
    it('clamps RNG output below 1', () => {
        const result = cohesionChallenge({ currentCohesion: 2, rng: scriptedRng([0]) });
        expect(result.rolled).toBe(1);
        expect(result.success).toBe(true);
    });
});

describe('recoverCohesion — +1, clamped to max, per RAW source', () => {
    it('recovers 1 on objective completion', () => {
        const result = recoverCohesion(3, 6, 'objective');
        expect(result.newCohesion).toBe(4);
        expect(result.gained).toBe(1);
    });
    it('recovers 1 on Fate spend', () => {
        const result = recoverCohesion(2, 5, 'fate');
        expect(result.newCohesion).toBe(3);
        expect(result.gained).toBe(1);
    });
    it('recovers 1 on GM ruling', () => {
        const result = recoverCohesion(0, 5, 'gm');
        expect(result.newCohesion).toBe(1);
        expect(result.gained).toBe(1);
    });
    it('already at max → no gain', () => {
        const result = recoverCohesion(6, 6, 'objective');
        expect(result.newCohesion).toBe(6);
        expect(result.gained).toBe(0);
    });
    it('above max sanitises down to max (no-op gain)', () => {
        const result = recoverCohesion(9, 6, 'gm');
        expect(result.newCohesion).toBe(6);
        expect(result.gained).toBe(0);
    });
    it('negative current sanitises to 0 before adding', () => {
        const result = recoverCohesion(-3, 5, 'fate');
        expect(result.newCohesion).toBe(1);
        expect(result.gained).toBe(1);
    });
    it('zero max → no-op', () => {
        const result = recoverCohesion(0, 0, 'objective');
        expect(result.newCohesion).toBe(0);
        expect(result.gained).toBe(0);
    });
    it('negative max sanitises to 0 → no-op', () => {
        const result = recoverCohesion(2, -5, 'gm');
        expect(result.newCohesion).toBe(0);
        expect(result.gained).toBe(0);
    });
});
