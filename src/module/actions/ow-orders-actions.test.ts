import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { comradeOrdersFor, comradeRulesFor } from '../config/game-systems/index.ts';
import type { ComradeRecord, ComradeRules } from '../rules/ow-comrade.ts';
import type { ComradeOrderDef } from '../rules/ow-orders.ts';
import { ORDER_BLOCK_KEYS, issuedOrderUpdate, orderLabelKeys, resolveOrderFor } from './ow-orders-actions.ts';

/**
 * Giving the Comrade an Order (#152): every printed Order resolves to langpack keys
 * that exist, and an enacted Order saves what the Comrade spent and the benefit
 * that lasts the Turn, in one update.
 */

/** The langpack: nested groups whose leaves are strings. */
interface LangTree {
    [key: string]: string | LangTree;
}

const LANG = JSON.parse(readFileSync(resolve(__dirname, '../../lang/en.json'), 'utf8')) as LangTree;

function hasKey(key: string): boolean {
    let node: string | LangTree = LANG;
    for (const part of key.split('.')) {
        if (typeof node === 'string') return false;
        // `find` is `| undefined` under both tsconfigs, so this guard is real in each.
        const next: string | LangTree | undefined = Object.entries(node).find(([name]) => name === part)?.[1];
        if (next === undefined) return false;
        node = next;
    }
    return typeof node === 'string';
}

const ORDERS = comradeOrdersFor('ow');
const RULES: ComradeRules = comradeRulesFor('ow') ?? { cohesionRangeM: 0, actionBudget: 0, mentalDeathThreshold: 0 };

function order(id: string): ComradeOrderDef {
    const found = ORDERS.find((candidate) => candidate.id === id);
    if (found === undefined) throw new Error(`no ${id}`);
    return found;
}

const COMRADE: ComradeRecord = {
    name: 'Vask',
    state: 'unharmed',
    distanceM: 2,
    hasVisualLine: true,
    fleeing: false,
    pinned: false,
    fearImmune: false,
    pinningImmune: false,
    turn: { combatId: 'c1', round: 3, halvesSpent: 0 },
    mental: { combatId: '', round: 0, insanity: 0, corruption: 0 },
};
const NOW = { combatId: 'c1', round: 3 };

describe('orderLabelKeys', () => {
    it.each(ORDERS.map((def) => [def.id, def] as const))('%s resolves every label to an existing langpack key', (_id, def) => {
        const keys = orderLabelKeys(def, 'no-actions');
        for (const key of [keys.nameKey, keys.effectKey, keys.actionCostKey, keys.blockReasonKey]) {
            expect(hasKey(key ?? ''), `${key ?? ''} exists in en.json`).toBe(true);
        }
        expect(orderLabelKeys(def).blockReasonKey).toBeNull();
    });

    it('every block reason has langpack text', () => {
        expect(Object.values(ORDER_BLOCK_KEYS).filter((key) => !hasKey(key))).toEqual([]);
    });
});

describe('issuedOrderUpdate', () => {
    it('Ranged Volley in Cohesion: spends a Half Action and puts its benefit in force for the Turn', () => {
        const volley = order('ranged-volley');
        const update = issuedOrderUpdate(volley, resolveOrderFor(volley, COMRADE, RULES, NOW), { comrade: COMRADE, activeOrders: [] }, NOW);
        expect(update).toEqual({
            'system.comrade.turn': { combatId: 'c1', round: 3, halvesSpent: 1 },
            'system.activeOrders': [{ orderId: 'ranged-volley', sweeping: false, appliedToMemberIds: [], combatId: 'c1', round: 3 }],
        });
    });

    it('out of Cohesion the Comrade still spends the action, but no benefit is put in force', () => {
        const volley = order('ranged-volley');
        const away = { ...COMRADE, distanceM: 9 };
        expect(issuedOrderUpdate(volley, resolveOrderFor(volley, away, RULES, NOW), { comrade: away, activeOrders: [] }, NOW)).toEqual({
            'system.comrade.turn': { combatId: 'c1', round: 3, halvesSpent: 1 },
        });
    });

    it('drops benefits from earlier Turns when a new one is put in force', () => {
        const volley = order('ranged-volley');
        const stale = { orderId: 'ranged-volley', sweeping: false, appliedToMemberIds: [], combatId: 'c1', round: 2 };
        const update = issuedOrderUpdate(volley, resolveOrderFor(volley, COMRADE, RULES, NOW), { comrade: COMRADE, activeOrders: [stale] }, NOW);
        expect(update?.['system.activeOrders']).toEqual([{ ...stale, round: 3 }]);
    });

    it('an Order with no effect changes nothing', () => {
        const spent = { ...COMRADE, turn: { combatId: 'c1', round: 3, halvesSpent: 2 } };
        const volley = order('ranged-volley');
        expect(issuedOrderUpdate(volley, resolveOrderFor(volley, spent, RULES, NOW), { comrade: spent, activeOrders: [] }, NOW)).toBeNull();
        expect(issuedOrderUpdate(volley, resolveOrderFor(volley, COMRADE, RULES, null), { comrade: COMRADE, activeOrders: [] }, null)).toBeNull();
    });
});
