/**
 * Only War · Orders P0 engine (#153 — OW core.md §"ORDERS" line 12183).
 *
 * Pure rules / math layer. Per Direction #7 the content (speciality
 * Orders bought as XP advances, their effect text, their action costs,
 * their cohesion requirements) lives in compendium documents — this
 * module only bakes in the three RAW *generic* Orders that every PC
 * may issue, because those are engine primitives (Ranged Volley, Close
 * Quarters, Take Cover!).
 *
 * The engine is RNG-free and actor-decoupled; effect text and display
 * strings come from i18n / compendium at the UI layer. Only the
 * structured mechanical shape is described here.
 *
 * Three Order kinds:
 *   - `generic`   — every PC has access; built-in IDs below.
 *   - `speciality`— bought via XP, sourced from compendium documents
 *                   matching the OrderDef shape.
 *   - `sweeping`  — Sergeant Sweeping Orders (core.md line 12181); a
 *                   passive squad-wide effect applied continuously
 *                   while the sergeant is active. Duration management
 *                   lives at the caller; this engine treats Sweeping
 *                   Orders identically to other Orders for the purpose
 *                   of effect application.
 */

/* -------------------------------------------------------------------- */
/*  Public types                                                        */
/* -------------------------------------------------------------------- */

/**
 * Action economy cost of issuing the Order. `free` is reserved for
 * Sweeping Orders (passive) and compendium effects flagged as free.
 */
export type OrderActionCost = 'free' | 'half' | 'full';

/** Discriminator for the three Order classes. */
export type OrderKind = 'generic' | 'speciality' | 'sweeping';

/**
 * Content-agnostic effect descriptor. Concrete labels resolve via i18n
 * at render time; the engine only cares about the structured shape so
 * downstream consumers (chat cards, squad-stat aggregators) can act on
 * it without parsing English.
 *
 * - `skill` / `characteristic`: the actor stat the Order modifies.
 * - `modifier`: numeric delta applied to that stat.
 * - `trait`: opaque tag (e.g. `'ganging-up'`, `'cover-bonus'`) that the
 *   consumer maps onto a rules effect.
 * - `description`: opaque key / pre-resolved string for chat display;
 *   not interpreted by the engine.
 */
export interface OrderEffectRef {
    readonly skill?: string;
    readonly characteristic?: string;
    readonly modifier?: number;
    readonly trait?: string;
    readonly description?: string;
}

/**
 * One Order definition. Generic Orders are exported as constants below;
 * speciality / sweeping Orders are produced by the compendium layer in
 * this same shape.
 */
export interface OrderDef {
    readonly id: string;
    readonly kind: OrderKind;
    readonly actionCost: OrderActionCost;
    /** When true, issuing the Order consumes a Cohesion point. */
    readonly cohesionRequired?: boolean;
    readonly effect: OrderEffectRef;
    /** Convenience flag; true iff `kind === 'sweeping'`. */
    readonly sweeping?: boolean;
}

/* -------------------------------------------------------------------- */
/*  Generic Order constants                                             */
/* -------------------------------------------------------------------- */

/**
 * "Ranged Volley" — +5 BS to every squad member's ranged attacks for
 * the round. RAW: half-action, no Cohesion gate.
 */
export const GENERIC_ORDER_RANGED_VOLLEY: OrderDef = Object.freeze({
    id: 'ranged-volley',
    kind: 'generic',
    actionCost: 'half',
    effect: Object.freeze({
        characteristic: 'ballisticSkill',
        modifier: 5,
    }),
});

/**
 * "Close Quarters" — triggers Ganging Up bonuses for the squad against
 * a designated foe. RAW: half-action, no Cohesion gate.
 */
export const GENERIC_ORDER_CLOSE_QUARTERS: OrderDef = Object.freeze({
    id: 'close-quarters',
    kind: 'generic',
    actionCost: 'half',
    effect: Object.freeze({
        trait: 'ganging-up',
    }),
});

/**
 * "Take Cover!" — squad-wide cover bonus. RAW: half-action, no Cohesion
 * gate.
 */
export const GENERIC_ORDER_TAKE_COVER: OrderDef = Object.freeze({
    id: 'take-cover',
    kind: 'generic',
    actionCost: 'half',
    effect: Object.freeze({
        trait: 'cover-bonus',
    }),
});

/** Stable iteration order for the generic Orders. */
export const GENERIC_ORDERS: ReadonlyArray<OrderDef> = Object.freeze([GENERIC_ORDER_RANGED_VOLLEY, GENERIC_ORDER_CLOSE_QUARTERS, GENERIC_ORDER_TAKE_COVER]);

/* -------------------------------------------------------------------- */
/*  Validation                                                          */
/* -------------------------------------------------------------------- */

/** Reason an Order cannot be issued in the current action state. */
export type OrderBlockReason = 'insufficient-action' | 'insufficient-cohesion';

/** Result of `canIssueOrder`. */
export interface OrderIssueCheck {
    readonly allowed: boolean;
    readonly reason?: OrderBlockReason;
}

/** Inputs to `canIssueOrder`. */
export interface OrderIssueContext {
    readonly order: OrderDef;
    readonly hasFullAction: boolean;
    readonly hasHalfAction: boolean;
    readonly cohesionAvailable: boolean;
}

/**
 * Decide whether the active actor may issue the given Order this turn.
 *
 * Action gate:
 *   - `free`: always allowed action-wise.
 *   - `half`: requires either a half- OR full-action remaining.
 *   - `full`: requires a full-action remaining.
 *
 * Cohesion gate: only applied when `order.cohesionRequired === true`.
 * Per the issue brief, generic Orders never require Cohesion.
 */
export function canIssueOrder(ctx: OrderIssueContext): OrderIssueCheck {
    const { order, hasFullAction, hasHalfAction, cohesionAvailable } = ctx;

    const actionOk = ((): boolean => {
        if (order.actionCost === 'free') return true;
        if (order.actionCost === 'half') return hasHalfAction || hasFullAction;
        return hasFullAction;
    })();

    if (!actionOk) {
        return { allowed: false, reason: 'insufficient-action' };
    }

    if (order.cohesionRequired === true && !cohesionAvailable) {
        return { allowed: false, reason: 'insufficient-cohesion' };
    }

    return { allowed: true };
}

/* -------------------------------------------------------------------- */
/*  Effect application                                                  */
/* -------------------------------------------------------------------- */

/** Minimal squad-member shape carrying the running list of order mods. */
export interface SquadMemberMods {
    readonly id: string;
    readonly mods: ReadonlyArray<OrderEffectRef>;
}

/**
 * Append `order.effect` to every squad member's `mods` array. Pure /
 * non-mutating — returns a new array of new member objects so the
 * caller can replace state with a single assignment.
 *
 * Sweeping Orders are processed identically here; the difference is
 * duration / removal, which the caller manages (e.g. by re-evaluating
 * the squad mods list each round and dropping non-sweeping entries).
 */
export function applyOrderEffect(order: OrderDef, squad: ReadonlyArray<SquadMemberMods>): Array<{ id: string; mods: OrderEffectRef[] }> {
    return squad.map((member) => ({
        id: member.id,
        mods: [...member.mods, order.effect],
    }));
}

/* -------------------------------------------------------------------- */
/*  Sweeping filter                                                     */
/* -------------------------------------------------------------------- */

/**
 * Pick only the Sweeping Orders from a list. An Order qualifies when
 * either `kind === 'sweeping'` or the explicit `sweeping === true`
 * convenience flag is set (compendium documents may carry one or both).
 */
export function getSweepingOrders(orders: ReadonlyArray<OrderDef>): OrderDef[] {
    return orders.filter((o) => o.kind === 'sweeping' || o.sweeping === true);
}
