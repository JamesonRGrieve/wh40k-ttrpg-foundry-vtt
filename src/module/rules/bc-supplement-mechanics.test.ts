/**
 * Vitest coverage for `bc-supplement-mechanics.ts` — the BC P2
 * supplement mechanics umbrella (#181). Each mechanic gets at least
 * three direct tests plus boundary cases (non-finite, negative,
 * fractional, threshold edges) so the pure-rules surface is fully
 * pinned.
 */

import { describe, expect, it } from 'vitest';
import {
    applyIrradiatedTick,
    daemonEngineRageBonus,
    incrementLegacyWeaponKills,
    legacyWeaponTierForKills,
    LEGACY_WEAPON_TIER_THRESHOLDS,
    QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT,
    quickAndTheDeadInitiativeBonus,
    resolveOverchargedShot,
    type IrradiatedHit,
    type LegacyWeaponState,
} from './bc-supplement-mechanics.ts';

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
/*  Legacy Weapons                              */
/* -------------------------------------------- */

describe('legacyWeaponTierForKills', () => {
    it('returns 0 below the first threshold', () => {
        expect(legacyWeaponTierForKills(0)).toBe(0);
        expect(legacyWeaponTierForKills(9)).toBe(0);
    });

    it('advances to tier 1 at exactly the first threshold', () => {
        expect(legacyWeaponTierForKills(LEGACY_WEAPON_TIER_THRESHOLDS[0])).toBe(1);
        expect(legacyWeaponTierForKills(24)).toBe(1);
    });

    it('advances to tier 2 at exactly the second threshold', () => {
        expect(legacyWeaponTierForKills(LEGACY_WEAPON_TIER_THRESHOLDS[1])).toBe(2);
        expect(legacyWeaponTierForKills(49)).toBe(2);
    });

    it('advances to tier 3 at exactly the third threshold and never higher', () => {
        expect(legacyWeaponTierForKills(LEGACY_WEAPON_TIER_THRESHOLDS[2])).toBe(3);
        expect(legacyWeaponTierForKills(1_000_000)).toBe(3);
    });

    it('sanitises non-finite/negative inputs to tier 0', () => {
        expect(legacyWeaponTierForKills(Number.NaN)).toBe(0);
        expect(legacyWeaponTierForKills(-50)).toBe(0);
    });
});

describe('incrementLegacyWeaponKills', () => {
    it('adds new kills and recomputes the tier', () => {
        const state: LegacyWeaponState = { kills: 5, tier: 0 };
        const next = incrementLegacyWeaponKills(state, 7);
        expect(next).toEqual({ kills: 12, tier: 1 });
    });

    it('crosses two thresholds in a single increment', () => {
        const state: LegacyWeaponState = { kills: 8, tier: 0 };
        const next = incrementLegacyWeaponKills(state, 20);
        expect(next).toEqual({ kills: 28, tier: 2 });
    });

    it('returns a fresh object (no mutation of the input)', () => {
        const state: LegacyWeaponState = { kills: 10, tier: 1 };
        const next = incrementLegacyWeaponKills(state, 5);
        expect(next).not.toBe(state);
        expect(state).toEqual({ kills: 10, tier: 1 });
        expect(next).toEqual({ kills: 15, tier: 1 });
    });

    it('recomputes the tier from kills, ignoring a stale input tier', () => {
        const state: LegacyWeaponState = { kills: 60, tier: 0 };
        const next = incrementLegacyWeaponKills(state, 0);
        expect(next.tier).toBe(3);
    });

    it('treats negative killCount as a no-op', () => {
        const state: LegacyWeaponState = { kills: 12, tier: 1 };
        const next = incrementLegacyWeaponKills(state, -5);
        expect(next).toEqual({ kills: 12, tier: 1 });
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

/* -------------------------------------------- */
/*  Quick and the Dead                          */
/* -------------------------------------------- */

describe('quickAndTheDeadInitiativeBonus', () => {
    it('adds +10 for Khorne and Slaanesh', () => {
        expect(quickAndTheDeadInitiativeBonus(20, 'khorne')).toBe(30);
        expect(quickAndTheDeadInitiativeBonus(20, 'slaanesh')).toBe(30);
    });

    it('adds +5 for Tzeentch and Unaligned', () => {
        expect(quickAndTheDeadInitiativeBonus(20, 'tzeentch')).toBe(25);
        expect(quickAndTheDeadInitiativeBonus(20, 'unaligned')).toBe(25);
    });

    it('adds 0 for Nurgle', () => {
        expect(quickAndTheDeadInitiativeBonus(20, 'nurgle')).toBe(20);
    });

    it('sanitises a non-finite base initiative to 0 before adding the bonus', () => {
        expect(quickAndTheDeadInitiativeBonus(Number.NaN, 'khorne')).toBe(10);
        expect(quickAndTheDeadInitiativeBonus(Number.NEGATIVE_INFINITY, 'tzeentch')).toBe(5);
    });

    it('clamps negative base initiative to 0', () => {
        expect(quickAndTheDeadInitiativeBonus(-15, 'slaanesh')).toBe(10);
    });

    it('exposes the bonus table for UI/tooltip use', () => {
        expect(QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT).toEqual({
            khorne: 10,
            slaanesh: 10,
            nurgle: 0,
            tzeentch: 5,
            unaligned: 5,
        });
    });
});
