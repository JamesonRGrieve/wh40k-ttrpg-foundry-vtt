/**
 * Unit coverage for the RT Crew Population & Morale combat-economy
 * helpers (issue #189).
 */

import { describe, expect, it } from 'vitest';
import {
    applyHullDamageToCrew,
    emptySnapshot,
    isCrippled,
    previousTurnLosses,
    recordCrewMoraleHit,
    recordHullHit,
    reducePriorTurnDamage,
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

describe('recordHullHit + reducePriorTurnDamage (Hold Fast! / Triage)', () => {
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

        // Turn rolls over — the next hit's snapshot is fresh for turn 2, and
        // turn 1's losses are kept as `previous` for Hold Fast! / Triage.
        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 2, 2));
        expect(snap.turn).toBe(2);
        expect(snap.hullLoss).toBe(2);
        expect(snap.previous).toEqual({ hullLoss: 5, crewLoss: 5, moraleLoss: 5, turn: 1 });
    });

    it('drops the old record when a hit lands two or more turns later', () => {
        const { snapshot } = recordHullHit(baseState(), { hullLoss: 4, crewLoss: 4, moraleLoss: 4, turn: 1 }, 1, 3);
        expect(snapshot.previous).toEqual({ hullLoss: 0, crewLoss: 0, moraleLoss: 0, turn: 0 });
    });

    // Regression (#189): Hold Fast! / Triage used to restore ALL of the
    // previous turn's hull, crew AND morale. RAW (RT) each reduces
    // ONE pool — Hold Fast! Morale, Triage Crew Population — by 1 + DoS.
    it('Hold Fast! reduces only the previous turn Morale loss, by the amount given', () => {
        let state = baseState();
        let snap = emptySnapshot(1);
        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 6, 1));
        const held = reducePriorTurnDamage(state, snap, 'morale', 2, 2);
        expect(held.restored).toBe(2);
        expect(held.next.crew.morale.value).toBe(96);
        expect(held.next.hullIntegrity.value).toBe(29);
        expect(held.next.crew.population).toBe(94);
        expect(held.snapshot.moraleLoss).toBe(4);
        expect(held.snapshot.crewLoss).toBe(6);
        expect(held.snapshot.hullLoss).toBe(6);
    });

    it('Triage reduces only the previous turn Crew Population loss', () => {
        let state = baseState();
        let snap = emptySnapshot(1);
        ({ next: state, snapshot: snap } = recordCrewMoraleHit(state, snap, 5, 3, 1));
        const treated = reducePriorTurnDamage(state, snap, 'crewPopulation', 3, 2);
        expect(treated.restored).toBe(3);
        expect(treated.next.crew.population).toBe(98);
        expect(treated.next.crew.morale.value).toBe(97);
        expect(treated.snapshot.crewLoss).toBe(2);
        expect(treated.snapshot.moraleLoss).toBe(3);
    });

    it('never restores more than was lost, nor Morale above its max', () => {
        const snap = { hullLoss: 5, crewLoss: 2, moraleLoss: 5, turn: 1 };
        const crew = reducePriorTurnDamage(baseState(), snap, 'crewPopulation', 9, 2);
        expect(crew.restored).toBe(2);
        const nearFull: ShipCombatState = { hullIntegrity: { value: 30, max: 35 }, crew: { population: 95, morale: { value: 99, max: 100 } } };
        const morale = reducePriorTurnDamage(nearFull, snap, 'morale', 4, 2);
        expect(morale.restored).toBe(1);
        expect(morale.next.crew.morale.value).toBe(100);
    });

    it('a second success the same turn only cancels what is left', () => {
        const first = reducePriorTurnDamage(baseState(), { hullLoss: 0, crewLoss: 0, moraleLoss: 3, turn: 1 }, 'morale', 2, 2);
        const second = reducePriorTurnDamage(first.next, first.snapshot, 'morale', 2, 2);
        expect(second.restored).toBe(0);
    });

    it('reduces the previous turn even after this turn has taken a hit', () => {
        let state = baseState();
        let snap = emptySnapshot(1);
        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 4, 1));
        ({ next: state, snapshot: snap } = recordHullHit(state, snap, 2, 2));
        const held = reducePriorTurnDamage(state, snap, 'morale', 3, 2);
        expect(held.restored).toBe(3);
        expect(held.snapshot.previous?.moraleLoss).toBe(1);
        // This turn's own loss is untouched.
        expect(held.snapshot.moraleLoss).toBe(2);
    });

    it('cannot touch this turn or anything older than the previous turn', () => {
        const thisTurn = reducePriorTurnDamage(baseState(), { hullLoss: 0, crewLoss: 0, moraleLoss: 3, turn: 2 }, 'morale', 3, 2);
        expect(thisTurn.restored).toBe(0);
        const older = reducePriorTurnDamage(baseState(), { hullLoss: 0, crewLoss: 0, moraleLoss: 3, turn: 1 }, 'morale', 3, 3);
        expect(older.restored).toBe(0);
    });

    it('previousTurnLosses reads the current record or its `previous`', () => {
        expect(previousTurnLosses(emptySnapshot(0), 5)).toBeNull();
        expect(previousTurnLosses({ hullLoss: 3, crewLoss: 3, moraleLoss: 3, turn: 1 }, 2)?.moraleLoss).toBe(3);
        const rolled = { hullLoss: 1, crewLoss: 1, moraleLoss: 1, turn: 2, previous: { hullLoss: 4, crewLoss: 4, moraleLoss: 4, turn: 1 } };
        expect(previousTurnLosses(rolled, 2)?.moraleLoss).toBe(4);
        expect(previousTurnLosses(rolled, 3)?.moraleLoss).toBe(1);
    });

    it('rolloverSnapshot returns a zero snapshot for the new turn', () => {
        const rolled = rolloverSnapshot(7);
        expect(rolled).toMatchObject({ hullLoss: 0, crewLoss: 0, moraleLoss: 0, turn: 7 });
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

describe('isCrippled (RT "Crippled Ships":0 Hull Integrity)', () => {
    it('is true only at 0 Hull Integrity', () => {
        expect(isCrippled({ value: 0, max: 35 })).toBe(true);
        expect(isCrippled({ value: 1, max: 35 })).toBe(false);
    });

    it('regression: half Hull is damaged, not Crippled', () => {
        // The old threshold was value ≤ ⌊max / 2⌋.
        expect(isCrippled({ value: 17, max: 35 })).toBe(false);
        expect(isCrippled({ value: 10, max: 40 })).toBe(false);
    });

    it('is false for a max of 0 (degenerate / unconfigured hull)', () => {
        expect(isCrippled({ value: 0, max: 0 })).toBe(false);
    });

    it('composes with applyHullDamageToCrew — the hit that takes the last point Cripples the ship', () => {
        let state: ShipCombatState = {
            hullIntegrity: { value: 2, max: 35 },
            crew: { population: 50, morale: { value: 60, max: 100 } },
        };
        ({ next: state } = applyHullDamageToCrew(state, 1));
        expect(state.hullIntegrity.value).toBe(1);
        expect(isCrippled(state.hullIntegrity)).toBe(false);
        ({ next: state } = applyHullDamageToCrew(state, 5));
        expect(state.hullIntegrity.value).toBe(0);
        expect(isCrippled(state.hullIntegrity)).toBe(true);
    });
});

describe('recordCrewMoraleHit', () => {
    it('drops crew and morale without touching hull, and records the losses', () => {
        const { next, snapshot } = recordCrewMoraleHit(baseState(), emptySnapshot(0), 7, 4, 3);
        expect(next.hullIntegrity.value).toBe(35);
        expect(next.crew.population).toBe(93);
        expect(next.crew.morale.value).toBe(96);
        expect(snapshot).toMatchObject({ hullLoss: 0, crewLoss: 7, moraleLoss: 4, turn: 3 });
    });

    it('floors at 0 and records only what was actually lost', () => {
        const state: ShipCombatState = { hullIntegrity: { value: 10, max: 35 }, crew: { population: 3, morale: { value: 2, max: 100 } } };
        const { next, snapshot } = recordCrewMoraleHit(state, emptySnapshot(0), 5, 5, 1);
        expect(next.crew.population).toBe(0);
        expect(next.crew.morale.value).toBe(0);
        expect(snapshot).toMatchObject({ hullLoss: 0, crewLoss: 3, moraleLoss: 2, turn: 1 });
    });

    it('appends to a snapshot from the same turn and rolls the previous turn over', () => {
        const same = recordCrewMoraleHit(baseState(), { hullLoss: 2, crewLoss: 2, moraleLoss: 2, turn: 4 }, 1, 1, 4).snapshot;
        expect(same).toEqual({ hullLoss: 2, crewLoss: 3, moraleLoss: 3, turn: 4 });
        const rolled = recordCrewMoraleHit(baseState(), { hullLoss: 2, crewLoss: 2, moraleLoss: 2, turn: 3 }, 1, 1, 4).snapshot;
        expect(rolled).toEqual({ hullLoss: 0, crewLoss: 1, moraleLoss: 1, turn: 4, previous: { hullLoss: 2, crewLoss: 2, moraleLoss: 2, turn: 3 } });
    });
});

describe('SHIP_ACTION_EFFECTS enum', () => {
    // Regression (#189): the blanket untested cancel is no longer an effect an order can opt into.
    it('offers replenishMorale and no longer offers the blanket cancelPriorTurnDamage', () => {
        expect([...SHIP_ACTION_EFFECTS]).toEqual(['replenishMorale']);
    });
});
