/**
 * Rogue Trader · Crew Population & Morale combat economy.
 *
 * Pure (DataModel-free) helpers for the RT void-combat damage economy:
 *
 *   • Every Hull Integrity point lost ALSO decrements Crew Population by 1
 *     AND Morale by 1, floored at 0. (Battlefleet Koronus / RT Core p.222.)
 *   • The Hold Fast! and Triage extended actions, when successfully
 *     resolved on the strategic turn AFTER a hit, *cancel the prior turn's
 *     hull/crew/morale damage* — represented here by reverting from the
 *     snapshot recorded at the moment of impact.
 *   • Between combats, the ship replenishes Morale to its maximum and
 *     does NOT replenish Crew Population (lost crew stay lost — they are
 *     recruited via Endeavours, off-screen).
 *   • The "Crippled" threshold is composed from current Hull Integrity vs.
 *     its maximum; the helper here exists so call sites and tests can
 *     reason about composition without instantiating a Foundry actor.
 *
 * These primitives are content-agnostic per Direction #7: per-system
 * mechanic toggles (RT-only) and per-action wiring (`cancelPriorTurnDamage`,
 * `replenishMorale`) live in the calling Document layer; this module
 * just provides the math.
 *
 * @issue #189
 */

/**
 * Subset of the StarshipData shape this module consumes. Mirroring the
 * shipped schema (`src/module/data/actor/starship.ts`) without importing
 * the Foundry DataModel keeps these helpers callable from Vitest unit
 * tests without a Foundry runtime.
 */
export interface ShipCombatState {
    hullIntegrity: { value: number; max: number };
    crew: { population: number; morale: { value: number; max: number } };
}

/**
 * Delta recorded against the actor's current strategic-turn snapshot so
 * Hold Fast! / Triage can revert exactly what the prior turn took away.
 * All values are POSITIVE losses (the amount that came off).
 */
export interface PriorTurnDamageSnapshot {
    /** Hull Integrity points lost since the snapshot opened. */
    hullLoss: number;
    /** Crew Population lost since the snapshot opened. */
    crewLoss: number;
    /** Morale points lost since the snapshot opened. */
    moraleLoss: number;
    /** Strategic turn number this snapshot is valid for; 0 == no snapshot. */
    turn: number;
}

/** The opening (zero) snapshot. */
export function emptySnapshot(turn = 0): PriorTurnDamageSnapshot {
    return { hullLoss: 0, crewLoss: 0, moraleLoss: 0, turn };
}

/**
 * Apply a hull-damage event to a starship's combat state. Returns the
 * NEW combat state plus the *delta* that was applied (so the caller can
 * append it to a running snapshot).
 *
 * Floors every value at 0; never grows a stat above its current value.
 * Hull max is preserved.
 */
export function applyHullDamageToCrew(
    state: ShipCombatState,
    hullDamage: number,
): { next: ShipCombatState; delta: { hullLoss: number; crewLoss: number; moraleLoss: number } } {
    const dmg = Math.max(0, Math.floor(hullDamage));
    if (dmg === 0) {
        return {
            next: state,
            delta: { hullLoss: 0, crewLoss: 0, moraleLoss: 0 },
        };
    }

    const hullBefore = state.hullIntegrity.value;
    const hullAfter = Math.max(0, hullBefore - dmg);
    const hullLoss = hullBefore - hullAfter;

    // -1 Crew / -1 Morale per Hull point lost (not per damage rolled —
    // a hit that hits a 0-hull ship adds no further crew/morale loss).
    const crewBefore = state.crew.population;
    const moraleBefore = state.crew.morale.value;
    const crewAfter = Math.max(0, crewBefore - hullLoss);
    const moraleAfter = Math.max(0, moraleBefore - hullLoss);

    return {
        next: {
            hullIntegrity: { value: hullAfter, max: state.hullIntegrity.max },
            crew: {
                population: crewAfter,
                morale: { value: moraleAfter, max: state.crew.morale.max },
            },
        },
        delta: {
            hullLoss,
            crewLoss: crewBefore - crewAfter,
            moraleLoss: moraleBefore - moraleAfter,
        },
    };
}

/**
 * Cancel (revert) the recorded prior-turn damage on a starship.
 *
 * Restores hull / crew / morale by exactly the snapshot's losses,
 * clamped at each stat's max. Returns the restored state and a fresh
 * zero snapshot for the current turn.
 *
 * The caller (Hold Fast! / Triage handler) is responsible for
 * verifying the snapshot's `turn` matches the *previous* strategic
 * turn before invoking this — see `canCancelPriorTurnDamage`.
 */
export function cancelPriorTurnDamage(state: ShipCombatState, snapshot: PriorTurnDamageSnapshot): { next: ShipCombatState; snapshot: PriorTurnDamageSnapshot } {
    const hullRestored = Math.min(state.hullIntegrity.max, state.hullIntegrity.value + Math.max(0, snapshot.hullLoss));
    const moraleRestored = Math.min(state.crew.morale.max, state.crew.morale.value + Math.max(0, snapshot.moraleLoss));
    // Crew Population has no schema-level max in the RT economy — population
    // can rise above its starting value via Endeavours — so we restore the
    // exact crew lost without clamping. Note this is asymmetric with morale
    // and reflects the RAW.
    const crewRestored = state.crew.population + Math.max(0, snapshot.crewLoss);

    return {
        next: {
            hullIntegrity: { value: hullRestored, max: state.hullIntegrity.max },
            crew: {
                population: crewRestored,
                morale: { value: moraleRestored, max: state.crew.morale.max },
            },
        },
        snapshot: emptySnapshot(snapshot.turn),
    };
}

/**
 * Decide whether the Hold Fast! / Triage cancel may fire. RAW: cancels
 * only the *prior* turn's damage — the current turn's hits are not
 * affected, and a snapshot with no recorded losses is a no-op.
 */
export function canCancelPriorTurnDamage(snapshot: PriorTurnDamageSnapshot, currentTurn: number): boolean {
    if (snapshot.turn === 0) return false;
    if (snapshot.hullLoss === 0 && snapshot.crewLoss === 0 && snapshot.moraleLoss === 0) {
        return false;
    }
    // The snapshot must reflect the IMMEDIATELY PRECEDING strategic turn.
    return snapshot.turn < currentTurn;
}

/**
 * Open a fresh snapshot for the given strategic turn, discarding any
 * prior-turn record. Called at the top of each strategic round.
 */
export function rolloverSnapshot(turn: number): PriorTurnDamageSnapshot {
    return emptySnapshot(turn);
}

/**
 * Replenish a ship's combat economy between engagements.
 *
 * RAW: Morale recovers fully between combats; Crew Population does
 * NOT (lost crew stay lost). Hull Integrity is restored only through
 * dedicated repair actions, not by simply leaving combat — so it is
 * left untouched here.
 */
export function replenishBetweenCombat(state: ShipCombatState): ShipCombatState {
    return {
        hullIntegrity: { ...state.hullIntegrity },
        crew: {
            population: state.crew.population,
            morale: { value: state.crew.morale.max, max: state.crew.morale.max },
        },
    };
}

/**
 * Pure "is the ship crippled?" composition — value ≤ ⌊max/2⌋. Mirrors
 * `WH40KStarship.isCrippled` so tests can exercise the rule without
 * the Document layer.
 */
export function isCrippled(hullIntegrity: { value: number; max: number }): boolean {
    if (hullIntegrity.max <= 0) return false;
    return hullIntegrity.value <= Math.floor(hullIntegrity.max / 2);
}

/**
 * Composed step a caller (sheet action / chat-card resolution) runs
 * when a hit lands: apply hull damage, decrement crew + morale, AND
 * append the loss to the running prior-turn snapshot so a later
 * Hold Fast! / Triage can cancel it.
 */
export function recordHullHit(
    state: ShipCombatState,
    snapshot: PriorTurnDamageSnapshot,
    hullDamage: number,
    turn: number,
): { next: ShipCombatState; snapshot: PriorTurnDamageSnapshot } {
    const { next, delta } = applyHullDamageToCrew(state, hullDamage);
    // If the recorded snapshot belongs to a stale turn, start a fresh one
    // for the current hit; otherwise append to the running tally.
    const baseSnapshot: PriorTurnDamageSnapshot = snapshot.turn === turn || snapshot.turn === 0 ? snapshot : emptySnapshot(turn);
    return {
        next,
        snapshot: {
            hullLoss: baseSnapshot.hullLoss + delta.hullLoss,
            crewLoss: baseSnapshot.crewLoss + delta.crewLoss,
            moraleLoss: baseSnapshot.moraleLoss + delta.moraleLoss,
            turn,
        },
    };
}

/**
 * Recognised content-agnostic effect identifiers an `order` item may
 * declare via the `shipActionEffect` field to participate in the RT
 * Crew/Morale economy.
 *
 * These are PRIMITIVES (mechanic enums), not content names — the
 * compendium-side `Hold Fast!` and `Triage` entries opt-in by tagging
 * `shipActionEffect: 'cancelPriorTurnDamage'`. No string-matching
 * against display names happens in `src/` (Direction #7).
 */
export const SHIP_ACTION_EFFECTS = ['cancelPriorTurnDamage', 'replenishMorale'] as const;
export type ShipActionEffect = (typeof SHIP_ACTION_EFFECTS)[number];
