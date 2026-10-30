/**
 * Rogue Trader · Crew Population & Morale combat economy.
 *
 * Pure (DataModel-free) helpers for the RT void-combat damage economy:
 *
 *   • Every Hull Integrity point lost ALSO decrements Crew Population by 1
 *     AND Morale by 1, floored at 0. (RT rules and a supplement.)
 *   • The Hold Fast! and Triage extended actions (RT rules), on a
 *     success, each reduce ONE pool of the previous turn's damage — Hold
 *     Fast! Morale, Triage Crew Population — by 1 plus 1 per degree of
 *     success, never by more than that pool actually lost. Neither touches
 *     Hull Integrity. The losses come from the per-turn snapshot that
 *     `recordHullHit` / `recordCrewMoraleHit` keep.
 *   • Between combats, the ship replenishes Morale to its maximum and
 *     does NOT replenish Crew Population (lost crew stay lost — they are
 *     recruited via Endeavours, off-screen).
 *   • The "Crippled" threshold is composed from current Hull Integrity vs.
 *     its maximum; the helper here exists so call sites and tests can
 *     reason about composition without instantiating a Foundry actor.
 *
 * These primitives are content-agnostic per Direction #7: the per-system
 * gate (RT only) lives in the calling Document layer; this module just
 * provides the math.
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
 * The losses one strategic turn recorded. All values are POSITIVE losses
 * (the amount that came off).
 */
export interface TurnLosses {
    /** Hull Integrity points lost during the turn. */
    hullLoss: number;
    /** Crew Population lost during the turn. */
    crewLoss: number;
    /** Morale points lost during the turn. */
    moraleLoss: number;
    /** Strategic turn number the losses belong to; 0 == nothing recorded. */
    turn: number;
}

/**
 * The running damage record Hold Fast! / Triage read: the current turn's
 * losses, plus the turn before it once a hit lands in a newer turn (so a hit
 * taken this turn does not wipe out last turn's record before it is cancelled).
 */
export interface PriorTurnDamageSnapshot extends TurnLosses {
    /** The losses of the turn immediately before `turn`, if any. */
    previous?: TurnLosses;
}

/** The opening (zero) snapshot. */
export function emptySnapshot(turn = 0): PriorTurnDamageSnapshot {
    return { hullLoss: 0, crewLoss: 0, moraleLoss: 0, turn, previous: { hullLoss: 0, crewLoss: 0, moraleLoss: 0, turn: 0 } };
}

/** The losses-only view of a snapshot (no `previous`). */
function turnLosses(snapshot: TurnLosses): TurnLosses {
    return { hullLoss: snapshot.hullLoss, crewLoss: snapshot.crewLoss, moraleLoss: snapshot.moraleLoss, turn: snapshot.turn };
}

/**
 * The snapshot to append a hit taken on `turn` to. A snapshot for the same
 * turn (or an empty one) keeps running; a newer turn opens a fresh record and
 * keeps the old one as `previous` when it is the turn immediately before.
 */
function snapshotForTurn(snapshot: PriorTurnDamageSnapshot, turn: number): PriorTurnDamageSnapshot {
    if (snapshot.turn === turn || snapshot.turn === 0) return snapshot;
    const fresh = emptySnapshot(turn);
    if (snapshot.turn === turn - 1) fresh.previous = turnLosses(snapshot);
    return fresh;
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

/** The damage pools Hold Fast! (Morale) and Triage (Crew Population) reduce. */
export type PriorTurnPool = 'morale' | 'crewPopulation';

/**
 * The losses recorded for the turn immediately before `currentTurn`, or null
 * when nothing was recorded for it. RAW (RT rules): Hold Fast! / Triage
 * "may only cancel ... damage suffered during the previous turn" — not this
 * turn's, and not anything older.
 */
export function previousTurnLosses(snapshot: PriorTurnDamageSnapshot, currentTurn: number): TurnLosses | null {
    const wanted = currentTurn - 1;
    if (wanted < 1) return null;
    if (snapshot.turn === wanted) return turnLosses(snapshot);
    if (snapshot.turn === currentTurn && snapshot.previous?.turn === wanted) return snapshot.previous;
    return null;
}

/**
 * Reduce one pool of the previous turn's damage (Hold Fast! → Morale,
 * Triage → Crew Population, RT rules) by `amount`.
 *
 * The reduction never exceeds what that pool lost in the previous turn, and
 * Morale never rises above its maximum. Crew Population has no schema max
 * (Endeavours can raise it), so only the recorded loss caps it. Hull
 * Integrity is never touched. The restored amount is taken off the recorded
 * loss, so a second success the same turn can only cancel what is left.
 */
export function reducePriorTurnDamage(
    state: ShipCombatState,
    snapshot: PriorTurnDamageSnapshot,
    pool: PriorTurnPool,
    amount: number,
    currentTurn: number,
): { next: ShipCombatState; snapshot: PriorTurnDamageSnapshot; restored: number } {
    const losses = previousTurnLosses(snapshot, currentTurn);
    const wanted = Math.max(0, Math.floor(amount));
    if (losses === null || wanted === 0) return { next: state, snapshot, restored: 0 };

    const lost = pool === 'morale' ? losses.moraleLoss : losses.crewLoss;
    const headroom = pool === 'morale' ? Math.max(0, state.crew.morale.max - state.crew.morale.value) : Number.POSITIVE_INFINITY;
    const restored = Math.min(wanted, lost, headroom);
    if (restored === 0) return { next: state, snapshot, restored: 0 };

    const reduced: TurnLosses =
        pool === 'morale' ? { ...losses, moraleLoss: losses.moraleLoss - restored } : { ...losses, crewLoss: losses.crewLoss - restored };
    const nextSnapshot: PriorTurnDamageSnapshot =
        snapshot.turn === losses.turn ? { ...reduced, ...(snapshot.previous ? { previous: snapshot.previous } : {}) } : { ...snapshot, previous: reduced };

    const next: ShipCombatState =
        pool === 'morale'
            ? {
                  hullIntegrity: { ...state.hullIntegrity },
                  crew: { population: state.crew.population, morale: { value: state.crew.morale.value + restored, max: state.crew.morale.max } },
              }
            : {
                  hullIntegrity: { ...state.hullIntegrity },
                  crew: { population: state.crew.population + restored, morale: { ...state.crew.morale } },
              };
    return { next, snapshot: nextSnapshot, restored };
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
 * Is the ship Crippled? RT 1.4 errata, "Crippled Ships": "When a ship
 * reaches 0 Hull Integrity, it becomes Crippled … A ship will remain Crippled
 * … until it has regained at least 1 Hull Integrity." The single definition
 * the voidcraft DataModel and Document getters and the fire path read. A hull
 * with no maximum is unconfigured, not Crippled.
 */
export function isCrippled(hullIntegrity: { value: number; max: number }): boolean {
    if (hullIntegrity.max <= 0) return false;
    return hullIntegrity.value <= 0;
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
    // A snapshot from an older turn rolls over (keeping the immediately
    // preceding turn as `previous`); otherwise append to the running tally.
    const baseSnapshot = snapshotForTurn(snapshot, turn);
    return {
        next,
        snapshot: {
            ...baseSnapshot,
            hullLoss: baseSnapshot.hullLoss + delta.hullLoss,
            crewLoss: baseSnapshot.crewLoss + delta.crewLoss,
            moraleLoss: baseSnapshot.moraleLoss + delta.moraleLoss,
            turn,
        },
    };
}

/**
 * Record direct Crew Population / Morale damage that does not come through
 * Hull Integrity (e.g. a boarding party cutting through the crew, RT
 * rules). Floors both stats at 0 and appends the losses to the running
 * prior-turn snapshot so Hold Fast! / Triage can cancel them next turn.
 */
export function recordCrewMoraleHit(
    state: ShipCombatState,
    snapshot: PriorTurnDamageSnapshot,
    crewDamage: number,
    moraleDamage: number,
    turn: number,
): { next: ShipCombatState; snapshot: PriorTurnDamageSnapshot } {
    const crewAfter = Math.max(0, state.crew.population - Math.max(0, Math.floor(crewDamage)));
    const moraleAfter = Math.max(0, state.crew.morale.value - Math.max(0, Math.floor(moraleDamage)));
    const baseSnapshot = snapshotForTurn(snapshot, turn);
    return {
        next: {
            hullIntegrity: { ...state.hullIntegrity },
            crew: { population: crewAfter, morale: { value: moraleAfter, max: state.crew.morale.max } },
        },
        snapshot: {
            ...baseSnapshot,
            hullLoss: baseSnapshot.hullLoss,
            crewLoss: baseSnapshot.crewLoss + (state.crew.population - crewAfter),
            moraleLoss: baseSnapshot.moraleLoss + (state.crew.morale.value - moraleAfter),
            turn,
        },
    };
}

/**
 * Content-agnostic effect identifiers an `order` item may declare via its
 * `shipActionEffect` field. A PRIMITIVE (mechanic enum), not a content name
 * (Direction #7).
 *
 * `cancelPriorTurnDamage` was removed (#189): it restored ALL of last turn's
 * hull, crew and morale with no test. Hold Fast! / Triage instead roll their
 * test and call `reducePriorTurnDamage` for one pool.
 */
export const SHIP_ACTION_EFFECTS = ['replenishMorale'] as const;
export type ShipActionEffect = (typeof SHIP_ACTION_EFFECTS)[number];
