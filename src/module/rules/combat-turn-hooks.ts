/**
 * System-level combat turn-boundary hooks (#413).
 *
 * Foundry fires `updateCombat` with a `turn` / `round` delta whenever the
 * tracker advances, but it never says "turn ENDED for combatant X, STARTED for
 * combatant Y" — each feature that needs a boundary (action economy #264,
 * movement budget #235, weapon jam checks #411, ammo bookkeeping) otherwise
 * re-derives it from the delta and `combat.previous`. This module derives that
 * boundary ONCE and exposes a small {@link onTurnStart} / {@link onTurnEnd}
 * subscription API so downstream features register in one place.
 *
 * The derivation is the pure {@link deriveTurnBoundary}; the hook reads the
 * loosely-typed Foundry Combat, resolves the ended / started combatants, and
 * fans out to subscribers. Deliberately conservative: every subscriber call is
 * isolated, so one throwing handler can never wedge the turn cycle or block the
 * others.
 */

/** Minimal Combatant view a turn subscriber receives. Kept structural so the
 * concrete Foundry Combatant (with its narrowly-typed getFlag/setFlag) is
 * assignable to it. */
export interface TurnCombatant {
    id?: string | null;
    actorId?: string | null;
}

/** Minimal Combat view the boundary derivation reads. */
export interface TurnCombat {
    combatant?: TurnCombatant | null | undefined;
    combatants?: Iterable<TurnCombatant> | null | undefined;
    previous?: { combatantId?: string | null | undefined; round?: number | null | undefined; turn?: number | null | undefined } | null | undefined;
}

/** The combatant ids on either side of a turn boundary. */
export interface TurnBoundary {
    /** The combatant whose turn just ended (null when unknown — e.g. combat start). */
    endedCombatantId: string | null;
    /** The combatant whose turn just started (null when unknown — e.g. combat end). */
    startedCombatantId: string | null;
}

/**
 * Pure boundary derivation: given whether the turn/round changed and the
 * previous / current combatant ids, produce the ended / started pair. Returns
 * null only when no turn/round actually changed (a flag-only `updateCombat`) or
 * neither side is known. A turn/round change that lands back on the same
 * combatant (a solo combat's round wrap) still counts — that combatant ends and
 * re-starts, so its budget resets.
 */
export function deriveTurnBoundary(input: {
    turnChanged: boolean;
    previousCombatantId: string | null | undefined;
    currentCombatantId: string | null | undefined;
}): TurnBoundary | null {
    if (!input.turnChanged) return null;
    const ended = input.previousCombatantId ?? null;
    const started = input.currentCombatantId ?? null;
    if (ended === null && started === null) return null;
    return { endedCombatantId: ended, startedCombatantId: started };
}

/** A turn-boundary subscriber. Receives the combatant (null when unresolved)
 * and the combat it belongs to. */
export type TurnCallback = (combatant: TurnCombatant | null, combat: TurnCombat) => void;

const startSubscribers = new Set<TurnCallback>();
const endSubscribers = new Set<TurnCallback>();

/** Subscribe to combatant turn-start boundaries. Returns an unsubscribe fn. */
export function onTurnStart(callback: TurnCallback): () => void {
    startSubscribers.add(callback);
    return () => startSubscribers.delete(callback);
}

/** Subscribe to combatant turn-end boundaries. Returns an unsubscribe fn. */
export function onTurnEnd(callback: TurnCallback): () => void {
    endSubscribers.add(callback);
    return () => endSubscribers.delete(callback);
}

/** Test seam: drop every subscriber (so a suite starts from a clean registry). */
export function clearTurnSubscribers(): void {
    startSubscribers.clear();
    endSubscribers.clear();
}

/** Index a combat's combatants by id for boundary resolution. */
function combatantById(combat: TurnCombat, id: string | null): TurnCombatant | null {
    if (id === null) return null;
    const combatants = combat.combatants;
    if (!combatants) return null;
    for (const c of combatants) {
        if (c.id === id) return c;
    }
    return null;
}

/** Invoke one subscriber in isolation — a throwing handler never blocks the rest. */
function safeInvoke(callback: TurnCallback, combatant: TurnCombatant | null, combat: TurnCombat): void {
    try {
        callback(combatant, combat);
    } catch (err) {
        console.error('WH40K | combat turn hook subscriber threw — ignoring', err);
    }
}

/** updateCombat handler: derive the boundary and fan out to subscribers. */
function onUpdateCombat(combat: TurnCombat, changes: { turn?: number | null | undefined; round?: number | null | undefined }): void {
    try {
        const boundary = deriveTurnBoundary({
            turnChanged: 'turn' in changes || 'round' in changes,
            previousCombatantId: combat.previous?.combatantId,
            currentCombatantId: combat.combatant?.id,
        });
        if (boundary === null) return;

        const ended = combatantById(combat, boundary.endedCombatantId);
        const started = combatantById(combat, boundary.startedCombatantId);

        for (const callback of endSubscribers) safeInvoke(callback, ended, combat);
        for (const callback of startSubscribers) safeInvoke(callback, started, combat);
    } catch (err) {
        console.error('WH40K | combat turn hooks (updateCombat) — ignoring', err);
    }
}

/** Register the single `updateCombat` hook that drives the turn-boundary fan-out. */
export function registerCombatTurnHooks(): void {
    Hooks.on('updateCombat', onUpdateCombat);
}
