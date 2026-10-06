/**
 * Vitest coverage for `bc-supplement-mechanics.ts` — the BC P2
 * supplement mechanics umbrella (#181). Each mechanic gets at least
 * three direct tests plus boundary cases (non-finite, negative,
 * fractional, threshold edges) so the pure-rules surface is fully
 * pinned.
 */

import { describe, expect, it } from 'vitest';
import { applyIrradiatedTick, daemonEngineRageBonus, resolveOverchargedShot, type IrradiatedHit } from './bc-supplement-mechanics.ts';

/* -------------------------------------------- */
/*  Irradiated(X)                               */
/* -------------------------------------------- */

describe('applyIrradiatedTick', () => {
    it('applies `rating` damage and decrements ticksRemaining by one', () => {
        const state: IrradiatedHit = { rating: 3, ticksRemaining: 4 };
        const result = applyIrradiatedTick(state);
        expect(result.damage).toBe(3);
        expect(result.newState).toEqual({ rating: 3, ticksRemaining: 3 });
    });

    it('returns 0 damage and clamps ticks to 0 when none remain', () => {
        const state: IrradiatedHit = { rating: 5, ticksRemaining: 0 };
        const result = applyIrradiatedTick(state);
        expect(result.damage).toBe(0);
        expect(result.newState).toEqual({ rating: 5, ticksRemaining: 0 });
    });

    it('processes the full sequence over multiple ticks until exhausted', () => {
        let state: IrradiatedHit = { rating: 2, ticksRemaining: 3 };
        const damageLog: number[] = [];
        for (let i = 0; i < 5; i++) {
            const result = applyIrradiatedTick(state);
            damageLog.push(result.damage);
            state = result.newState;
        }
        // 3 productive ticks (2 dmg each), then 2 no-op ticks.
        expect(damageLog).toEqual([2, 2, 2, 0, 0]);
        expect(state.ticksRemaining).toBe(0);
    });

    it('sanitises non-finite rating to 0 damage', () => {
        const state: IrradiatedHit = { rating: Number.NaN, ticksRemaining: 2 };
        const result = applyIrradiatedTick(state);
        expect(result.damage).toBe(0);
        expect(result.newState.ticksRemaining).toBe(1);
    });

    it('clamps negative ticks to 0', () => {
        const state: IrradiatedHit = { rating: 4, ticksRemaining: -3 };
        const result = applyIrradiatedTick(state);
        expect(result.damage).toBe(0);
        expect(result.newState.ticksRemaining).toBe(0);
    });

    it('truncates fractional rating to an integer', () => {
        const state: IrradiatedHit = { rating: 3.9, ticksRemaining: 1 };
        const result = applyIrradiatedTick(state);
        expect(result.damage).toBe(3);
    });
});

/* -------------------------------------------- */
/*  Overcharge                                  */
/* -------------------------------------------- */

describe('resolveOverchargedShot', () => {
    it('doubles damage on an aligned firer', () => {
        const outcome = resolveOverchargedShot({ untested: false });
        expect(outcome).toEqual({ effectiveDamageMultiplier: 2, jammed: false });
    });

    it('jams on an Untested+ firer and suppresses the doubling', () => {
        const outcome = resolveOverchargedShot({ untested: true });
        expect(outcome).toEqual({ effectiveDamageMultiplier: 1, jammed: true });
    });

    it('returns a discriminable shape (jammed XOR multiplier=2)', () => {
        const ok = resolveOverchargedShot({ untested: false });
        const jam = resolveOverchargedShot({ untested: true });
        expect(ok.jammed).toBe(false);
        expect(ok.effectiveDamageMultiplier).toBe(2);
        expect(jam.jammed).toBe(true);
        expect(jam.effectiveDamageMultiplier).toBe(1);
    });
});

/* -------------------------------------------- */
/*  Daemon Engine(X)                            */
/* -------------------------------------------- */

describe('daemonEngineRageBonus', () => {
    it('returns rating when idle counter is 0 (just damaged)', () => {
        expect(daemonEngineRageBonus({ rating: 3, turnsSinceLastDamage: 0 })).toBe(3);
    });

    it('grows linearly while idle below the rating cap', () => {
        expect(daemonEngineRageBonus({ rating: 4, turnsSinceLastDamage: 1 })).toBe(5);
        expect(daemonEngineRageBonus({ rating: 4, turnsSinceLastDamage: 2 })).toBe(6);
        expect(daemonEngineRageBonus({ rating: 4, turnsSinceLastDamage: 3 })).toBe(7);
    });

    it('caps the idle component at the rating value', () => {
        // rating 4 → bonus tops out at 4 + 4 = 8.
        expect(daemonEngineRageBonus({ rating: 4, turnsSinceLastDamage: 4 })).toBe(8);
        expect(daemonEngineRageBonus({ rating: 4, turnsSinceLastDamage: 100 })).toBe(8);
    });

    it('returns 0 when rating is 0 regardless of idle', () => {
        expect(daemonEngineRageBonus({ rating: 0, turnsSinceLastDamage: 5 })).toBe(0);
    });

    it('sanitises non-finite and negative inputs', () => {
        expect(daemonEngineRageBonus({ rating: Number.NaN, turnsSinceLastDamage: 3 })).toBe(0);
        expect(daemonEngineRageBonus({ rating: 3, turnsSinceLastDamage: -2 })).toBe(3);
    });
});
