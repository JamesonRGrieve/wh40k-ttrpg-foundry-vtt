/**
 * @file comrade-order-modifiers — the Path B rows a PC's Comrade Orders add to its
 * tests (#152). Ranged Volley (OW): "The Player Character gains an
 * additional +5 to all Ballistics Skill Tests this Turn." Each Order in force this
 * Round is one sourced row in the `comrade-orders` bucket, which sums into the
 * target through the central aggregator and expands on the card.
 */

import { comradeOrdersFor } from '../config/game-systems/index.ts';
import { readComradeRecord } from '../rules/ow-comrade.ts';
import { comradeOrderTestComponents, readActiveComradeOrders } from '../rules/ow-orders.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';
import { currentCombatRound } from './counter-attack-flow.ts';

/** The localiser and the combat the collector reads; absent under unit tests. */
interface CollectorRuntime {
    i18n?: { localize: (key: string) => string; format: (key: string, data: Record<string, string>) => string };
    combat?: Parameters<typeof currentCombatRound>[0] | undefined;
}

function runtime(): CollectorRuntime {
    // eslint-disable-next-line no-restricted-syntax -- boundary: `game` is the Foundry runtime global; roll data also runs under unit tests where it is absent
    return (globalThis as { game?: CollectorRuntime }).game ?? {};
}

/** One sourced row — structurally a `RollModifierComponent`. */
export interface ComradeOrderModifier {
    key: string;
    label: string;
    value: number;
    source: string;
}

/**
 * The rows the actor's Comrade Orders add to a test on `characteristic` this Round:
 * none for an actor whose line prints no Comrades, out of combat, or with no
 * matching Order in force.
 */
export function comradeOrderModifiersFor(actor: { readonly system: object } | null, characteristic: string): ComradeOrderModifier[] {
    if (actor === null) return [];
    const orders = comradeOrdersFor(firstSystemId(actor));
    if (orders.length === 0) return [];
    const { i18n, combat } = runtime();
    const comradeName = readComradeRecord(actor.system)?.name ?? '';
    return comradeOrderTestComponents(readActiveComradeOrders(actor.system), orders, currentCombatRound(combat ?? null), characteristic, (order) => {
        const label = i18n?.localize(order.labelKey) ?? order.labelKey;
        const comrade = comradeName === '' ? i18n?.localize('WH40K.OW.Comrade.Label') ?? '' : comradeName;
        return { label, source: i18n?.format('WH40K.OW.Orders.Source', { order: label, comrade }) ?? label };
    });
}
