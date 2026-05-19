/**
 * Unit coverage for the RT Crew Population & Morale combat-economy
 * helpers (issue #189).
 */

import { describe, expect, it } from 'vitest';

import {
    applyHullDamageToCrew,
    canCancelPriorTurnDamage,
    cancelPriorTurnDamage,
    emptySnapshot,
    isCrippled,
    recordHullHit,
    replenishBetweenCombat,
    rolloverSnapshot,
    SHIP_ACTION_EFFECTS,
    type ShipCombatState,
} from './ship-crew-morale.ts';

function baseState(): ShipCombatState {
    return {
        hullIntegrity: { value: 35, max: 35 },
        crew: { population: 100, morale: { value: 100, max: 100 } },
    };
}

describe('applyHullDamageToCrew', () => {
    it('decrements hull, crew, and morale by the same amount per hull point lost', () => {
        const result = applyHullDamageToCrew(baseState(), 5);
        expect(result.next.hullIntegrity.value).toBe(30);
        expect(result.next.crew.population).toBe(95);
        expect(result.next.crew.morale.value).toBe(95);
        expect(result.delta).toEqual({ hullLoss: 5, crewLoss: 5, moraleLoss: 5 });
    });

    it('floors every stat at zero — never produces negative values', () => {
        const lowState: ShipCombatState = {
            hullIntegrity: { value: 3, max: 35 },
            crew: { population: 2, morale: { value: 1, max: 100 } },
        };
        const result = applyHullDamageToCrew(lowState, 50);
        expect(result.next.hullIntegrity.value).toBe(0);
        expect(result.next.crew.population).toBe(0);
        expect(result.next.crew.morale.value).toBe(0);
        // hullLoss is capped at the available hull (3), not the rolled damage
        expect(result.delta.hullLoss).toBe(3);
        expect(result.delta.crewLoss).toBe(2);
        expect(result.delta.moraleLoss).toBe(1);
    });

    it('treats negative or zero damage as a no-op (state object returned as-is)', () => {
        const s = baseState();
        const result = applyHullDamageToCrew(s, 0);
        expect(result.next).toBe(s);
        expect(result.delta).toEqual({ hullLoss: 0, crewLoss: 0, moraleLoss: 0 });

        const neg = applyHullDamageToCrew(s, -7);
        expect(neg.next).toBe(s);
        expect(neg.delta).toEqual({ hullLoss: 0, crewLoss: 0, moraleLoss: 0 });
    });

    it('preserves hull max across the damage application', () => {
        const result = applyHullDamageToCrew(baseState(), 12);
        expect(result.next.hullIntegrity.max).toBe(35);
        expect(result.next.crew.morale.max).toBe(100);
    });
});

describe('recordHullHit + cancelPriorTurnDamage (Hold Fast! / Triage)', () => {
    it('records cumulative losses to the snapshot for the current turn', () => {
        let state = baseState();
        let snap = emptySnapshot(2);

        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 3, 2));
        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 4, 2));

        expect(snap.turn).toBe(2);
        expect(snap.hullLoss).toBe(7);
        expect(snap.crewLoss).toBe(7);
        expect(snap.moraleLoss).toBe(7);
        expect(state.hullIntegrity.value).toBe(28);
    });

    it('replaces the snapshot when a hit lands in a NEW strategic turn', () => {
        let state = baseState();
        let snap = emptySnapshot(1);
        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 5, 1));
        expect(snap.turn).toBe(1);
        expect(snap.hullLoss).toBe(5);

        // Turn rolls over — the next hit's snapshot is fresh for turn 2.
        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 2, 2));
        expect(snap.turn).toBe(2);
        expect(snap.hullLoss).toBe(2);
    });

    it('cancels prior-turn damage exactly and clamps morale at its max', () => {
        let state = baseState();
        let snap = emptySnapshot(1);
        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 6, 1));
        // Now on turn 2 the captain orders Hold Fast! → cancel turn 1's losses.
        const cancelled = cancelPriorTurnDamage(state, snap);
        expect(cancelled.next.hullIntegrity.value).toBe(35);
        expect(cancelled.next.crew.population).toBe(100);
        expect(cancelled.next.crew.morale.value).toBe(100);
        expect(cancelled.snapshot.hullLoss).toBe(0);
        expect(cancelled.snapshot.crewLoss).toBe(0);
        expect(cancelled.snapshot.moraleLoss).toBe(0);
    });

    it('cancelling never floats morale above its max', () => {
        const state: ShipCombatState = {
            hullIntegrity: { value: 30, max: 35 },
            crew: { population: 95, morale: { value: 99, max: 100 } },
        };
        const snap = { hullLoss: 5, crewLoss: 5, moraleLoss: 5, turn: 1 };
        const cancelled = cancelPriorTurnDamage(state, snap);
        expect(cancelled.next.crew.morale.value).toBe(100);
        expect(cancelled.next.hullIntegrity.value).toBe(35);
        // Crew Population intentionally unclamped (no schema max).
        expect(cancelled.next.crew.population).toBe(100);
    });

    it('canCancelPriorTurnDamage requires a non-empty snapshot from a strictly prior turn', () => {
        expect(canCancelPriorTurnDamage(emptySnapshot(0), 5)).toBe(false);
        expect(
            canCancelPriorTurnDamage({ hullLoss: 0, crewLoss: 0, moraleLoss: 0, turn: 1 }, 2),
        ).toBe(false);
        // Same turn — current turn's damage cannot be cancelled per RAW.
        expect(
            canCancelPriorTurnDamage({ hullLoss: 3, crewLoss: 3, moraleLoss: 3, turn: 2 }, 2),
        ).toBe(false);
        // Strictly-prior, non-empty snapshot → eligible.
        expect(
            canCancelPriorTurnDamage({ hullLoss: 3, crewLoss: 3, moraleLoss: 3, turn: 1 }, 2),
        ).toBe(true);
    });

    it('rolloverSnapshot returns a zero snapshot for the new turn', () => {
        const rolled = rolloverSnapshot(7);
        expect(rolled).toEqual({ hullLoss: 0, crewLoss: 0, moraleLoss: 0, turn: 7 });
    });
});

describe('replenishBetweenCombat', () => {
    it('restores morale to its max but leaves crew population alone', () => {
        const battered: ShipCombatState = {
            hullIntegrity: { value: 20, max: 35 },
            crew: { population: 80, morale: { value: 40, max: 100 } },
        };
        const replenished = replenishBetweenCombat(battered);
        expect(replenished.crew.morale.value).toBe(100);
        // Crew Population intentionally NOT replenished (RAW — Endeavours only).
        expect(replenished.crew.population).toBe(80);
        // Hull damage persists (only repair actions restore hull).
        expect(replenished.hullIntegrity.value).toBe(20);
        expect(replenished.hullIntegrity.max).toBe(35);
    });

    it('is a no-op when morale is already at its max', () => {
        const state = baseState();
        const replenished = replenishBetweenCombat(state);
        expect(replenished.crew.morale.value).toBe(100);
        expect(replenished.crew.population).toBe(100);
    });
});

describe('isCrippled (composition)', () => {
    it('is true when hull value is at or below floor(max / 2)', () => {
        expect(isCrippled({ value: 17, max: 35 })).toBe(true);
        expect(isCrippled({ value: 18, max: 35 })).toBe(false);
        expect(isCrippled({ value: 0, max: 35 })).toBe(true);
    });

    it('is false for a max of 0 (degenerate / unconfigured hull)', () => {
        expect(isCrippled({ value: 0, max: 0 })).toBe(false);
    });

    it('composes with applyHullDamageToCrew — a hit that drops to floor crosses the threshold', () => {
        let state: ShipCombatState = {
            hullIntegrity: { value: 18, max: 35 },
            crew: { population: 50, morale: { value: 60, max: 100 } },
        };
        expect(isCrippled(state.hullIntegrity)).toBe(false);
        ({ next: state } = applyHullDamageToCrew(state, 1));
        expect(state.hullIntegrity.value).toBe(17);
        expect(isCrippled(state.hullIntegrity)).toBe(true);
    });
});

describe('SHIP_ACTION_EFFECTS enum', () => {
    it('contains the two RT-economy effects the compendium opts into', () => {
        expect(SHIP_ACTION_EFFECTS).toContain('cancelPriorTurnDamage');
        expect(SHIP_ACTION_EFFECTS).toContain('replenishMorale');
    });
});
