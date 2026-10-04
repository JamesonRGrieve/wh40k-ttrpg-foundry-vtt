import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERIC_ORDERS } from '../rules/ow-orders.ts';
import { orderLabelKeys } from './ow-orders-actions.ts';

/**
 * Regression guard: every generic Order resolves to langpack keys that exist.
 * The OW character sheet once rebuilt the keys from the order id
 * (`WH40K.OW.Orders.Generic.Ranged-volley.Name`), so the Orders panel showed raw
 * keys; the sheet and the chat card now share `orderLabelKeys`.
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

describe('orderLabelKeys', () => {
    it.each(GENERIC_ORDERS.map((order) => [order.id, order] as const))('%s resolves every label to an existing langpack key', (_id, order) => {
        const keys = orderLabelKeys(order, 'insufficient-cohesion');
        for (const key of [keys.nameKey, keys.effectKey, keys.actionCostKey, keys.blockReasonKey]) {
            expect(key, 'key present').not.toBeNull();
            expect(hasKey(key ?? ''), `${key ?? ''} exists in en.json`).toBe(true);
        }
    });

    it.each(GENERIC_ORDERS.map((order) => [order.id, order] as const))('%s has no block reason when it can be issued', (_id, order) => {
        expect(orderLabelKeys(order).blockReasonKey).toBeNull();
    });
});
