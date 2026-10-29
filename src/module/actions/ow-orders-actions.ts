/**
 * Only War: giving the Comrade an Order (#152, #153; OW core).
 *
 * `owIssueOrder` (wired into the character sheet's action map) resolves the
 * clicked Order against the line's printed Orders (`comradeOrdersFor`) through
 * `resolveComradeOrder`, which applies the rules: issuing is a Free Action for the
 * PC; the Comrade spends the Order's Half or Full Action out of its Turn's budget,
 * and an Order given after that is spent has no effect; following needs Cohesion,
 * and out of Cohesion the PC gains no benefit; a pinned or fleeing Comrade takes no
 * Actions; a wounded one cannot Run. The Comrade's spent actions and any benefit
 * that lasts the Turn (Ranged Volley) are saved on the actor in one update, and a
 * chat card states what happened.
 */

import { comradeOrdersFor, comradeRulesFor } from '../config/game-systems/index.ts';
import type { ActiveOrderEntry } from '../data/actor/mixins/ow-orders-template.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { currentCombatRound } from '../rolls/counter-attack-flow.ts';
import { emitChatFromTemplate } from '../rolls/roll-helpers.ts';
import type { CombatRoundStamp } from '../rules/counter-attack.ts';
import { type ComradeRecord, type ComradeRules, comradeActionsLeft, inCohesion, spendComradeActions } from '../rules/ow-comrade.ts';
import {
    type ComradeActionCost,
    type ComradeOrderBlock,
    type ComradeOrderDef,
    type ComradeOrderResolution,
    ordersInForce,
    resolveComradeOrder,
} from '../rules/ow-orders.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';

/** The OW character `system` fields this handler reads and writes. */
interface OwOrdersActorSystem {
    activeOrders: ActiveOrderEntry[];
    comrade: ComradeRecord;
}

export interface OwOrdersActionContext {
    actor: WH40KBaseActor & { system: OwOrdersActorSystem };
}

const ACTION_COST_KEY: Readonly<Record<ComradeActionCost, string>> = {
    half: 'WH40K.OW.Orders.ActionCost.Half',
    full: 'WH40K.OW.Orders.ActionCost.Full',
};

/** Why an Order does nothing, as the panel and the card say it. */
export const ORDER_BLOCK_KEYS: Readonly<Record<ComradeOrderBlock, string>> = {
    'not-in-combat': 'WH40K.OW.Orders.Block.NotInCombat',
    'dead': 'WH40K.OW.Orders.Block.Dead',
    'pinned': 'WH40K.OW.Orders.Block.Pinned',
    'fleeing': 'WH40K.OW.Orders.Block.Fleeing',
    'needs-cohesion': 'WH40K.OW.Orders.Block.NeedsCohesion',
    'wounded': 'WH40K.OW.Orders.Block.Wounded',
    'no-actions': 'WH40K.OW.Orders.Block.NoActions',
};

/** The langpack keys an Order is displayed with: one source for the sheet panel and the chat card. */
export interface OrderLabelKeys {
    nameKey: string;
    effectKey: string;
    actionCostKey: string;
    blockReasonKey: string | null;
}

/** Label keys for an Order, and for why it does nothing (`block`). */
export function orderLabelKeys(order: ComradeOrderDef, block: ComradeOrderBlock | null = null): OrderLabelKeys {
    return {
        nameKey: order.labelKey,
        effectKey: order.effectKey,
        actionCostKey: ACTION_COST_KEY[order.actionCost],
        blockReasonKey: block === null ? null : ORDER_BLOCK_KEYS[block],
    };
}

/** How an Order resolves for the actor's Comrade at `now`. */
export function resolveOrderFor(order: ComradeOrderDef, comrade: ComradeRecord, rules: ComradeRules, now: CombatRoundStamp | null): ComradeOrderResolution {
    return resolveComradeOrder({
        order,
        comrade,
        inCohesion: inCohesion(comrade, rules),
        actionsLeft: comradeActionsLeft(comrade.turn, now, rules),
        inCombat: now !== null,
    });
}

/** One Order row on the Orders panel. */
export interface OrderPanelRow extends OrderLabelKeys {
    orderId: string;
    actionCost: ComradeActionCost;
    /** The Comrade carries it out now. */
    canIssue: boolean;
    /** Carried out, but out of Cohesion the PC gains nothing from it. */
    noBenefit: boolean;
}

/** The Orders panel's rows: each Order resolved against the Comrade at `now`. */
export function orderPanelRows(orders: readonly ComradeOrderDef[], comrade: ComradeRecord, rules: ComradeRules, now: CombatRoundStamp | null): OrderPanelRow[] {
    return orders.map((order) => {
        const resolution = resolveOrderFor(order, comrade, rules, now);
        return {
            orderId: order.id,
            ...orderLabelKeys(order, resolution.block),
            actionCost: order.actionCost,
            canIssue: resolution.enacted,
            noBenefit: resolution.enacted && order.benefit !== null && !resolution.grantsBenefit,
        };
    });
}

/**
 * The actor update an enacted Order makes: the Comrade's spent actions, and the
 * Order's benefit in force for the Turn (older benefits dropped). Null when the
 * Order does nothing.
 */
export function issuedOrderUpdate(
    order: ComradeOrderDef,
    resolution: ComradeOrderResolution,
    system: OwOrdersActorSystem,
    now: CombatRoundStamp | null,
): Record<string, object> | null {
    if (!resolution.enacted || now === null) return null;
    const update: Record<string, object> = { 'system.comrade.turn': spendComradeActions(system.comrade.turn, now, resolution.halves) };
    if (resolution.grantsBenefit) {
        const entry: ActiveOrderEntry = { orderId: order.id, sweeping: false, appliedToMemberIds: [], combatId: now.combatId, round: now.round };
        update['system.activeOrders'] = [...ordersInForce(system.activeOrders, now), entry];
    }
    return update;
}

/**
 * `data-action="owIssueOrder"`: give the Comrade the Order on the clicked
 * button (`data-order-id`), save what it spends and grants, and post the card.
 */
export async function owIssueOrder(this: OwOrdersActionContext, event: Event, target: HTMLElement): Promise<void> {
    event.preventDefault();
    const line = firstSystemId(this.actor);
    const rules = comradeRulesFor(line);
    const order = comradeOrdersFor(line).find((candidate) => candidate.id === target.dataset['orderId']);
    if (rules === null || order === undefined) return;

    const now = currentCombatRound(game.combat);
    const { comrade } = this.actor.system;
    const resolution = resolveOrderFor(order, comrade, rules, now);
    const update = issuedOrderUpdate(order, resolution, this.actor.system, now);
    // Read before the update: the update replaces the stored record.
    const turnAfter = resolution.enacted && now !== null ? spendComradeActions(comrade.turn, now, resolution.halves) : comrade.turn;
    const comradeName = comrade.name;
    if (update !== null) await this.actor.update(update);

    const keys = orderLabelKeys(order, resolution.block);
    await emitChatFromTemplate(
        'systems/wh40k-rpg/templates/chat/ow-orders-chat.hbs',
        {
            gameSystem: 'ow',
            _gameSystemId: line,
            orderId: order.id,
            orderNameKey: keys.nameKey,
            actionCostKey: keys.actionCostKey,
            effectKey: keys.effectKey,
            comradeName,
            enacted: resolution.enacted,
            blockKey: keys.blockReasonKey,
            noBenefit: resolution.enacted && order.benefit !== null && !resolution.grantsBenefit,
            inCombat: now !== null,
            actionsLeft: comradeActionsLeft(turnAfter, now, rules),
        },
        { speaker: ChatMessage.getSpeaker({ actor: this.actor }) },
    );
}
