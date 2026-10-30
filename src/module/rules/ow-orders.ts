/**
 * Only War · a Comrade's Orders (#152, #153; OW rules).
 *
 * Pure rules over one PC ↔ Comrade pair. Which Orders a line prints, what each
 * costs the Comrade and what it grants are that line's printed content and live on
 * its game-system config (`comradeOrders`); this module resolves them:
 *
 *   - Issuing an Order is a Free Action for the PC, with no test. The Comrade
 *     spends the Order's Half or Full Action out of its own budget of two Half
 *     Actions or one Full Action a Turn; once that is spent, further Orders that
 *     Turn do nothing.
 *   - Cohesion: following the PC is only possible in Cohesion; out of it the
 *     Comrade moves only by the move Orders. An Order benefits the PC only while
 *     the Comrade is in Cohesion, unless the Order says otherwise.
 *   - A wounded Comrade "cannot Run"; a pinned one "may not take Actions
 *     until they receive an order that allows them to recover"; a fleeing one flees
 *     "as quickly as possible".
 *   - A benefit that lasts "this Turn" (Ranged Volley: "+5 to all Ballistics Skill
 *     Tests this Turn") is recorded with the Round it was given in, and reaches
 *     tests through {@link comradeOrderTestComponents}, a Path B collector.
 */

import type { CombatRoundStamp } from './counter-attack.ts';
import type { ComradeRecord } from './ow-comrade.ts';

/** The Comrade's action an Order costs. */
export type ComradeActionCost = 'half' | 'full';

/** Half Actions each cost spends (a Full Action is the whole Turn's two Half Actions). */
export const COMRADE_ACTION_HALVES: Readonly<Record<ComradeActionCost, number>> = { half: 1, full: 2 };

/**
 * How an Order depends on Cohesion:
 * - `to-act`: the Comrade can only carry it out in Cohesion (following the PC);
 * - `for-benefit`: carried out anywhere, but the PC gains its benefit only in Cohesion;
 * - `none`: no Cohesion needed (a move Order, or one whose effect is the Comrade's own).
 */
export type ComradeOrderCohesion = 'to-act' | 'for-benefit' | 'none';

/** What an Order grants its PC. */
type ComradeOrderBenefit =
    /** A modifier to the PC's tests on one characteristic for the rest of the Turn. */
    | { readonly kind: 'characteristic'; readonly characteristic: string; readonly modifier: number }
    /** A named effect the table applies (Ganging Up, the Comrade in cover). */
    | { readonly kind: 'effect' };

/** One Order a Comrade can be given. */
export interface ComradeOrderDef {
    readonly id: string;
    readonly labelKey: string;
    readonly effectKey: string;
    readonly actionCost: ComradeActionCost;
    readonly cohesion: ComradeOrderCohesion;
    /** A wounded Comrade cannot carry it out ("If a Comrade is wounded he cannot Run"). */
    readonly notWhenWounded: boolean;
    readonly benefit: ComradeOrderBenefit | null;
}

/** Why an Order does nothing. */
export type ComradeOrderBlock = 'not-in-combat' | 'dead' | 'pinned' | 'fleeing' | 'needs-cohesion' | 'wounded' | 'no-actions';

/** What resolving an Order reads. */
export interface ComradeOrderContext {
    readonly order: ComradeOrderDef;
    readonly comrade: Pick<ComradeRecord, 'state' | 'fleeing' | 'pinned'>;
    readonly inCohesion: boolean;
    /** Half Actions the Comrade has left this Turn. */
    readonly actionsLeft: number;
    /** Whether a combat is running (Orders are a Turn's actions). */
    readonly inCombat: boolean;
}

/** How an Order resolved. */
export interface ComradeOrderResolution {
    /** Whether the Comrade carries it out (and spends its action). */
    readonly enacted: boolean;
    readonly block: ComradeOrderBlock | null;
    /** Half Actions it spends when enacted. */
    readonly halves: number;
    /** Whether the PC gains the Order's benefit. */
    readonly grantsBenefit: boolean;
}

/**
 * Resolve an Order given to the Comrade. In order: a combat must be running; the
 * Comrade must be alive, not pinned and not fleeing; a follow needs Cohesion; a
 * wounded Comrade cannot Run; and the Comrade must have the action left. A
 * `for-benefit` Order out of Cohesion is still carried out, but grants nothing.
 */
export function resolveComradeOrder(ctx: ComradeOrderContext): ComradeOrderResolution {
    const { order, comrade } = ctx;
    const halves = COMRADE_ACTION_HALVES[order.actionCost];
    const blocked = (block: ComradeOrderBlock): ComradeOrderResolution => ({ enacted: false, block, halves, grantsBenefit: false });
    if (!ctx.inCombat) return blocked('not-in-combat');
    if (comrade.state === 'dead') return blocked('dead');
    if (comrade.pinned) return blocked('pinned');
    if (comrade.fleeing) return blocked('fleeing');
    if (order.cohesion === 'to-act' && !ctx.inCohesion) return blocked('needs-cohesion');
    if (order.notWhenWounded && comrade.state === 'wounded') return blocked('wounded');
    if (ctx.actionsLeft < halves) return blocked('no-actions');
    const grantsBenefit = order.benefit !== null && (order.cohesion !== 'for-benefit' || ctx.inCohesion);
    return { enacted: true, block: null, halves, grantsBenefit };
}

/* -------------------------------------------------------------------- */
/*  Benefits in force                                                   */
/* -------------------------------------------------------------------- */

/** An Order's benefit in force on its PC, stamped with the Round it was given in. */
export interface ActiveComradeOrder {
    readonly orderId: string;
    readonly combatId: string;
    readonly round: number;
}

/**
 * The Order benefits stored on an actor's system data (`system.activeOrders`), or
 * none when the actor type has no such slot. Read off the actor-type union without
 * a cast; malformed entries are skipped.
 */
export function readActiveComradeOrders(system: object): ActiveComradeOrder[] {
    if (!('activeOrders' in system) || !Array.isArray(system.activeOrders)) return [];
    return system.activeOrders.filter(isActiveComradeOrder);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: an array entry read off an actor-type union; narrowed by this guard
function isActiveComradeOrder(entry: unknown): entry is ActiveComradeOrder {
    if (typeof entry !== 'object' || entry === null) return false;
    return (
        'orderId' in entry &&
        typeof entry.orderId === 'string' &&
        'combatId' in entry &&
        typeof entry.combatId === 'string' &&
        'round' in entry &&
        typeof entry.round === 'number'
    );
}

/** The benefits still in force at `now`: those given this Round. */
export function ordersInForce<T extends ActiveComradeOrder>(entries: readonly T[], now: CombatRoundStamp | null): T[] {
    if (now === null) return [];
    return entries.filter((entry) => entry.combatId === now.combatId && entry.round === now.round);
}

/** The roll-modifier bucket Comrade Order benefits are summed under. */
export const COMRADE_ORDER_BUCKET = 'comrade-orders';

/** One sourced contribution — structurally a `RollModifierComponent`. */
interface ComradeOrderComponent {
    key: string;
    label: string;
    value: number;
    source: string;
}

/**
 * Path B: the modifiers the PC's Comrade Orders give a test on `characteristic`
 * this Turn (Ranged Volley: "+5 to all Ballistics Skill Tests this Turn"), one
 * sourced row per Order. `label` and `source` are resolved by the caller.
 */
export function comradeOrderTestComponents(
    entries: readonly ActiveComradeOrder[],
    orders: readonly ComradeOrderDef[],
    now: CombatRoundStamp | null,
    characteristic: string,
    describe: (order: ComradeOrderDef) => { label: string; source: string },
): ComradeOrderComponent[] {
    return ordersInForce(entries, now).flatMap((entry) => {
        const order = orders.find((candidate) => candidate.id === entry.orderId);
        const benefit = order?.benefit;
        if (order === undefined || benefit?.kind !== 'characteristic' || benefit.characteristic !== characteristic) return [];
        return [{ key: `comrade-order-${order.id}`, value: benefit.modifier, ...describe(order) }];
    });
}

/** The sum of the components. */
export function sumComradeOrderComponents(components: readonly { value: number }[]): number {
    return components.reduce((total, component) => total + component.value, 0);
}
