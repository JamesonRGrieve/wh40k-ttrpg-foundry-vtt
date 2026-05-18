/**
 * Regression coverage for the shared owned-item id resolver (S5). Pins the
 * closest-ancestor + self-dataset fallback semantics so collapsing the ~dozen
 * hand-rolled `data-item-id` lookups onto it cannot drift behaviour.
 */

import { describe, expect, it } from 'vitest';
import { itemIdFromTarget } from '../src/module/applications/api/item-target.ts';

function target(id: string | null, wrap = false): HTMLElement {
    const el = document.createElement('div');
    if (id !== null) el.dataset['itemId'] = id;
    if (!wrap) return el;
    const child = document.createElement('i');
    el.appendChild(child);
    return child;
}

describe('itemIdFromTarget', () => {
    it('resolves from the element itself', () => {
        expect(itemIdFromTarget(target('abc'))).toBe('abc');
    });
    it('resolves from the closest ancestor when clicked on a child', () => {
        expect(itemIdFromTarget(target('abc', true))).toBe('abc');
    });
    it('returns undefined when absent or empty', () => {
        expect(itemIdFromTarget(target(null))).toBeUndefined();
        expect(itemIdFromTarget(target(''))).toBeUndefined();
    });
});
