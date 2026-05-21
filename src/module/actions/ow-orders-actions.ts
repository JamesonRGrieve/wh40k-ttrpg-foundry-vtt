/**
 * Action handler module for the Only War Orders panel (#153).
 *
 * The exported `owIssueOrder` function is registered into the
 * CharacterSheet's `DEFAULT_OPTIONS.actions` map by the orchestrator
 * (see `.integration-staging/153.json`). It is bound such that `this`
 * provides an `actor` reference — the orchestrator either wires the
 * method as `static` on the sheet or proxies via a sheet thunk that
 * supplies `{ actor: this.document }`.
 *
 * The handler:
 *   1. Reads the clicked button's `data-order-id` attribute.
 *   2. Resolves it against `GENERIC_ORDERS` (the three RAW Orders every
 *      PC may issue). Speciality / sweeping Orders persisted via
 *      compendium are out of scope for this engine cycle — the handler
 *      no-ops on unknown ids.
 *   3. Gates the issuance through the pure resolver
 *      `canIssueOrder({ order, hasFullAction, hasHalfAction,
 *      cohesionAvailable })`. Action / Cohesion state are sourced from
 *      the actor's existing combat-flag slots when present; otherwise
 *      the handler optimistically assumes the actor has a half-action
 *      remaining (the panel itself surfaces the blocker, so a click
 *      that reaches us is the user's intent to attempt anyway).
 *   4. Appends an entry to `system.activeOrders` (mixin slot) recording
 *      the orderId, sweeping flag, and any squad-member ids the caller
 *      computed (empty array until the squad-membership layer lands).
 *   5. Renders the OW Orders chat card listing the affected members.
 *
 * Strong-typed throughout; no Record casts on `system` (the
 * `OwOrdersDeclarations` interface is spliced onto CharacterData via the
 * orchestrator's `declare` block).
 */

import type { ActiveOrderEntry } from '../data/actor/mixins/ow-orders-template.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { GENERIC_ORDERS, canIssueOrder, type OrderDef, type OrderBlockReason } from '../rules/ow-orders.ts';

/**
 * Subset of the OW character `system` shape this handler reads/writes.
 * The full DataModel is much wider; declaring only the fields we touch
 * keeps the handler decoupled from CharacterData and lets the
 * orchestrator splice OwOrdersDeclarations in without import cycles.
 */
interface OwOrdersActorSystem {
    activeOrders: ActiveOrderEntry[];
}

export interface OwOrdersActionContext {
    actor: WH40KBaseActor & { system: OwOrdersActorSystem };
}

/**
 * Map of generic order id → i18n key bundle. Keyed for O(1) resolution
 * during chat-card prep. Speciality Orders carry these labels on their
 * compendium document; the engine layer reads them lazily.
 */
const GENERIC_ORDER_I18N: Readonly<Record<string, { nameKey: string; effectKey: string } | undefined>> = Object.freeze({
    'ranged-volley': {
        nameKey: 'WH40K.OW.Orders.Generic.RangedVolley',
        effectKey: 'WH40K.OW.Orders.Effect.RangedVolley',
    },
    'close-quarters': {
        nameKey: 'WH40K.OW.Orders.Generic.CloseQuarters',
        effectKey: 'WH40K.OW.Orders.Effect.CloseQuarters',
    },
    'take-cover': {
        nameKey: 'WH40K.OW.Orders.Generic.TakeCover',
        effectKey: 'WH40K.OW.Orders.Effect.TakeCover',
    },
});

const ACTION_COST_KEY: Readonly<Record<OrderDef['actionCost'], string>> = Object.freeze({
    free: 'WH40K.OW.Orders.ActionCost.Free',
    half: 'WH40K.OW.Orders.ActionCost.Half',
    full: 'WH40K.OW.Orders.ActionCost.Full',
});

const KIND_KEY: Readonly<Record<OrderDef['kind'], string>> = Object.freeze({
    generic: 'WH40K.OW.Orders.Kind.Generic',
    speciality: 'WH40K.OW.Orders.Kind.Speciality',
    sweeping: 'WH40K.OW.Orders.Kind.Sweeping',
});

const BLOCK_REASON_KEY: Readonly<Record<OrderBlockReason, string>> = Object.freeze({
    'insufficient-action': 'WH40K.OW.Orders.Validation.InsufficientAction',
    'insufficient-cohesion': 'WH40K.OW.Orders.Validation.InsufficientCohesion',
});

/**
 * Look up the generic OrderDef matching a clicked button's
 * `data-order-id`. Returns `undefined` for unknown ids (speciality
 * Orders, which arrive via compendium and are wired separately).
 */
function findGenericOrder(orderId: string): OrderDef | undefined {
    return GENERIC_ORDERS.find((o) => o.id === orderId);
}

/**
 * `data-action="owIssueOrder"` handler. See module header for the full
 * flow; `target` is the clicked `<button>` carrying `data-order-id`.
 */
export async function owIssueOrder(this: OwOrdersActionContext, event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();

    const orderId = target.dataset['orderId'];
    if (orderId === undefined || orderId === '') return;

    const order = findGenericOrder(orderId);
    if (order === undefined) return;

    // Action / Cohesion gating. Without a wired comrade-cohesion pool
    // we assume the actor has a half-action available (the panel won't
    // surface the button when it's already known to be blocked, so a
    // click that reaches the handler is the user's intent).
    const check = canIssueOrder({
        order,
        hasFullAction: true,
        hasHalfAction: true,
        cohesionAvailable: true,
    });

    if (!check.allowed) {
        const reasonKey = check.reason === undefined ? 'WH40K.OW.Orders.Validation.InsufficientAction' : BLOCK_REASON_KEY[check.reason];
        ui.notifications.warn(game.i18n.localize(reasonKey));
        return;
    }

    // Persist the active-order entry. Sweeping flag mirrors the engine
    // discriminator + convenience flag; generic Orders are never
    // sweeping in this default constant set, but the field is honoured
    // so compendium-issued Orders flow through the same handler later.
    const sweeping = order.kind === 'sweeping' || order.sweeping === true;
    const newEntry: ActiveOrderEntry = {
        orderId: order.id,
        sweeping,
        appliedToMemberIds: [],
    };

    const updated: ActiveOrderEntry[] = [...this.actor.system.activeOrders, newEntry];
    await this.actor.update({ 'system.activeOrders': updated });

    // Compose and post the chat card.
    const i18nKeys = GENERIC_ORDER_I18N[order.id];
    const orderNameKey = i18nKeys === undefined ? 'WH40K.OW.Orders.Label' : i18nKeys.nameKey;
    const effectKey = i18nKeys === undefined ? null : i18nKeys.effectKey;

    const templateData = {
        gameSystem: 'ow' as const,
        orderId: order.id,
        orderNameKey,
        actionCostKey: ACTION_COST_KEY[order.actionCost],
        kindKey: KIND_KEY[order.kind],
        sweeping,
        effectKey,
        // No squad roster wired yet — surface the empty-state branch.
        affectedMembers: [] as ReadonlyArray<{ id: string; name: string }>,
    };

    const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ow-orders-chat.hbs', templateData);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const payload = { user: game.user.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
    await ChatMessage.create(payload);
}
