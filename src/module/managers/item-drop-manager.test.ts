import { describe, expect, it } from 'vitest';
import { ItemDropManager, type StackProjection, type TokenLike } from './item-drop-manager.ts';

/**
 * Unit coverage for the pure decision helpers in ItemDropManager. These
 * functions take plain data and touch no Foundry globals, so they run for
 * real in happy-dom (unlike DataModel classes, which need the Foundry
 * runtime). The orchestration methods are exercised by the Tier A
 * integration suite and the Tier B e2e spec.
 */
describe('ItemDropManager.isDroppable', () => {
    it('treats physical objects as droppable', () => {
        expect(ItemDropManager.isDroppable('weapon')).toBe(true);
        expect(ItemDropManager.isDroppable('armour')).toBe(true);
        expect(ItemDropManager.isDroppable('gear')).toBe(true);
        expect(ItemDropManager.isDroppable('ammunition')).toBe(true);
    });

    it('treats ownership-fact items as non-droppable', () => {
        expect(ItemDropManager.isDroppable('skill')).toBe(false);
        expect(ItemDropManager.isDroppable('talent')).toBe(false);
        expect(ItemDropManager.isDroppable('trait')).toBe(false);
        expect(ItemDropManager.isDroppable('condition')).toBe(false);
        expect(ItemDropManager.isDroppable('originPath')).toBe(false);
    });
});

describe('ItemDropManager.snapToGrid', () => {
    it('floors a point to the top-left of its grid cell', () => {
        expect(ItemDropManager.snapToGrid({ x: 137, y: 268 }, 100)).toEqual({ x: 100, y: 200 });
        expect(ItemDropManager.snapToGrid({ x: 100, y: 200 }, 100)).toEqual({ x: 100, y: 200 });
    });

    it('rounds when the grid size is unusable', () => {
        expect(ItemDropManager.snapToGrid({ x: 12.6, y: 9.2 }, 0)).toEqual({ x: 13, y: 9 });
        expect(ItemDropManager.snapToGrid({ x: 12.6, y: 9.2 }, -10)).toEqual({ x: 13, y: 9 });
    });
});

describe('ItemDropManager.findMergeablePileIndex', () => {
    const tokens: TokenLike[] = [
        { x: 0, y: 0, actor: { type: 'character' } },
        { x: 100, y: 200, actor: { type: 'loot' } },
        { x: 300, y: 300, actor: { type: 'loot' } },
    ];

    it('finds an existing loot pile occupying the target cell', () => {
        expect(ItemDropManager.findMergeablePileIndex(tokens, { x: 137, y: 268 }, 100)).toBe(1);
    });

    it('ignores non-loot tokens on the target cell', () => {
        expect(ItemDropManager.findMergeablePileIndex(tokens, { x: 40, y: 40 }, 100)).toBe(-1);
    });

    it('returns -1 when no pile is on the target cell', () => {
        expect(ItemDropManager.findMergeablePileIndex(tokens, { x: 600, y: 600 }, 100)).toBe(-1);
    });
});

describe('ItemDropManager.planStackMerge', () => {
    const make = (id: string, name: string, type: string, quantity?: number): StackProjection => ({
        _id: id,
        name,
        type,
        system: quantity === undefined ? null : { quantity },
    });

    it('bumps an existing stack of the same name+type', () => {
        const existing = [make('a', 'Lasgun Charge Pack', 'ammunition', 2)];
        const incoming = [{ name: 'Lasgun Charge Pack', type: 'ammunition', system: { quantity: 3 } }];
        const plan = ItemDropManager.planStackMerge(existing, incoming);
        expect(plan.updates).toEqual([{ _id: 'a', quantity: 5 }]);
        expect(plan.creates).toHaveLength(0);
    });

    it('creates fresh items when nothing matches', () => {
        const existing = [make('a', 'Sword', 'weapon', 1)];
        const incoming = [{ name: 'Shield', type: 'armour', system: { quantity: 1 } }];
        const plan = ItemDropManager.planStackMerge(existing, incoming);
        expect(plan.updates).toHaveLength(0);
        expect(plan.creates).toHaveLength(1);
    });

    it('accumulates several incoming stacks of the same key', () => {
        const existing = [make('a', 'Frag Grenade', 'gear', 1)];
        const incoming = [
            { name: 'Frag Grenade', type: 'gear', system: { quantity: 2 } },
            { name: 'Frag Grenade', type: 'gear', system: { quantity: 4 } },
        ];
        const plan = ItemDropManager.planStackMerge(existing, incoming);
        expect(plan.updates).toEqual([{ _id: 'a', quantity: 7 }]);
        expect(plan.creates).toHaveLength(0);
    });

    it('always creates non-stackable items (no numeric quantity)', () => {
        const existing = [make('a', 'Power Sword', 'weapon')];
        const incoming = [{ name: 'Power Sword', type: 'weapon', system: null }];
        const plan = ItemDropManager.planStackMerge(existing, incoming);
        expect(plan.updates).toHaveLength(0);
        expect(plan.creates).toHaveLength(1);
    });
});

describe('ItemDropManager.resolveReceivingActor', () => {
    it('uses the single controlled non-loot token actor', () => {
        const pc = { type: 'character' };
        const result = ItemDropManager.resolveReceivingActor([{ actor: pc }], null);
        expect(result).toBe(pc);
    });

    it('excludes the loot pile token itself and falls back to the user character', () => {
        const character = { type: 'character' };
        const result = ItemDropManager.resolveReceivingActor([{ actor: { type: 'loot' } }], character);
        expect(result).toBe(character);
    });

    it('returns null when several distinct tokens are controlled', () => {
        const a = { type: 'character' };
        const b = { type: 'npc' };
        expect(ItemDropManager.resolveReceivingActor([{ actor: a }, { actor: b }], null)).toBeNull();
    });

    it('returns null when nothing is controlled and there is no user character', () => {
        expect(ItemDropManager.resolveReceivingActor([], null)).toBeNull();
    });
});

describe('ItemDropManager.blocksLootTokenMove', () => {
    it('blocks a non-GM dragging a loot pile (x change)', () => {
        expect(ItemDropManager.blocksLootTokenMove('loot', { x: 200 }, false)).toBe(true);
    });

    it('blocks a non-GM dragging a loot pile (y change)', () => {
        expect(ItemDropManager.blocksLootTokenMove('loot', { y: 300 }, false)).toBe(true);
    });

    it('blocks a combined x/y move of a loot pile by a non-GM', () => {
        expect(ItemDropManager.blocksLootTokenMove('loot', { x: 100, y: 100 }, false)).toBe(true);
    });

    it('allows a non-GM to update a loot pile without moving it (no x/y in the change)', () => {
        expect(ItemDropManager.blocksLootTokenMove('loot', {}, false)).toBe(false);
    });

    it('allows the GM to move a loot pile', () => {
        expect(ItemDropManager.blocksLootTokenMove('loot', { x: 200, y: 200 }, true)).toBe(false);
    });

    it('never blocks moves of non-loot tokens', () => {
        expect(ItemDropManager.blocksLootTokenMove('character', { x: 200 }, false)).toBe(false);
        expect(ItemDropManager.blocksLootTokenMove('npc', { x: 200 }, false)).toBe(false);
        expect(ItemDropManager.blocksLootTokenMove(null, { x: 200 }, false)).toBe(false);
    });
});
