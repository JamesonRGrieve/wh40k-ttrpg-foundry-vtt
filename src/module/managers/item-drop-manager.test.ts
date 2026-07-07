import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
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

    it('returns null when several distinct tokens are controlled and there is no user character', () => {
        const a = { type: 'character' };
        const b = { type: 'npc' };
        expect(ItemDropManager.resolveReceivingActor([{ actor: a }, { actor: b }], null)).toBeNull();
    });

    it('falls back to the assigned character when several tokens are controlled (silent, no prompt)', () => {
        // #385: an ambiguous multi-selection must not prompt for a token — the
        // picker's assigned character is a valid silent receiver.
        const a = { type: 'character' };
        const b = { type: 'npc' };
        const mine = { type: 'character' };
        expect(ItemDropManager.resolveReceivingActor([{ actor: a }, { actor: b }], mine)).toBe(mine);
    });

    it('falls back to the assigned character when only the loot pile is controlled', () => {
        const mine = { type: 'character' };
        expect(ItemDropManager.resolveReceivingActor([{ actor: { type: 'loot' } }], mine)).toBe(mine);
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

describe('ItemDropManager.tokenIdsForActor', () => {
    it('returns ids of tokens backed by the given actor', () => {
        const tokens = [
            { id: 't1', actorId: 'loot1' },
            { id: 't2', actorId: 'other' },
            { id: 't3', actorId: 'loot1' },
        ];
        expect(ItemDropManager.tokenIdsForActor(tokens, 'loot1')).toEqual(['t1', 't3']);
    });

    it('returns an empty array when no token matches', () => {
        expect(ItemDropManager.tokenIdsForActor([{ id: 't1', actorId: 'a' }], 'loot1')).toEqual([]);
    });

    it('skips tokens with a null or empty id', () => {
        const tokens = [
            { id: null, actorId: 'loot1' },
            { id: '', actorId: 'loot1' },
            { id: 't9', actorId: 'loot1' },
        ];
        expect(ItemDropManager.tokenIdsForActor(tokens, 'loot1')).toEqual(['t9']);
    });
});

describe('ItemDropManager.classifyItemDrop', () => {
    it('sorts when the item already lives on the target actor', () => {
        expect(ItemDropManager.classifyItemDrop({ sameActorHasItem: true, crossActor: false, sourceOwned: false })).toBe('sort');
    });

    it('transfers a cross-actor drop from an owned source', () => {
        expect(ItemDropManager.classifyItemDrop({ sameActorHasItem: false, crossActor: true, sourceOwned: true })).toBe('transfer');
    });

    it('copies a fresh compendium/world item (no source actor)', () => {
        expect(ItemDropManager.classifyItemDrop({ sameActorHasItem: false, crossActor: false, sourceOwned: false })).toBe('copy');
    });

    it('copies a cross-actor drop whose source is not owned (cannot clear the source)', () => {
        expect(ItemDropManager.classifyItemDrop({ sameActorHasItem: false, crossActor: true, sourceOwned: false })).toBe('copy');
    });
});

describe('ItemDropManager.isBound (#390)', () => {
    it('is true when system.bound is true', () => {
        expect(ItemDropManager.isBound({ system: { bound: true } })).toBe(true);
    });

    it('is false when system.bound is false, null, or absent', () => {
        expect(ItemDropManager.isBound({ system: { bound: false } })).toBe(false);
        expect(ItemDropManager.isBound({ system: { bound: null } })).toBe(false);
        expect(ItemDropManager.isBound({ system: {} })).toBe(false);
        expect(ItemDropManager.isBound({ system: null })).toBe(false);
    });

    it('is false for null/undefined items', () => {
        expect(ItemDropManager.isBound(null)).toBe(false);
        expect(ItemDropManager.isBound(undefined)).toBe(false);
    });
});

/**
 * Teardown coverage for {@link ItemDropManager.pickupLoot} (#385 reopen). The
 * pickup orchestration touches Foundry globals, so the actors, scenes, and
 * notifications are stubbed to the narrow surface the method reaches into.
 * The regression under test: when the pile's scene token is already gone (the
 * Item Piles module double-deletes it via its own actor-deletion hooks), the
 * teardown must NOT throw an uncaught rejection — it degrades gracefully and
 * pickup still succeeds.
 */
describe('ItemDropManager.pickupLoot (#385 teardown)', () => {
    interface PileItemStub {
        toObject: () => StackProjection & { _id?: string };
    }
    interface ReceiverStub {
        isOwner: boolean;
        name: string;
        items: PileItemStub[];
        createEmbeddedDocuments: (type: string, data: object[]) => Promise<void>;
        updateEmbeddedDocuments: (type: string, data: object[]) => Promise<void>;
    }
    interface PileStub {
        id: string | null;
        name: string;
        items: PileItemStub[];
        delete: () => Promise<void>;
    }
    interface SceneStub {
        tokens: Array<{ id: string | null; actorId: string | null }>;
        deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<void>;
    }

    const pileItem = (name: string, type: string): PileItemStub => ({
        toObject: () => ({ _id: `src-${name}`, name, type, system: null }),
    });

    const makeReceiver = (overrides: Partial<ReceiverStub> = {}): ReceiverStub => ({
        isOwner: true,
        name: 'Kael',
        items: [],
        createEmbeddedDocuments: vi.fn().mockResolvedValue([]),
        updateEmbeddedDocuments: vi.fn().mockResolvedValue([]),
        ...overrides,
    });

    const makePile = (overrides: Partial<PileStub> = {}): PileStub => ({
        id: 'loot1',
        name: 'Dropped: Hand Cannon',
        items: [pileItem('Hand Cannon', 'weapon')],
        delete: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    });

    const stubWorld = (scenes: SceneStub[]): void => {
        vi.stubGlobal('game', {
            scenes,
            i18n: { localize: (k: string): string => k, format: (k: string): string => k },
        });
        vi.stubGlobal('ui', { notifications: { info: vi.fn(), warn: vi.fn() } });
    };

    const pickup = async (receiver: ReceiverStub, pile: PileStub): Promise<boolean> =>
        // eslint-disable-next-line no-restricted-syntax -- boundary: test stubs bridged to the WH40KBaseActor params of the method under test
        ItemDropManager.pickupLoot(receiver as unknown as WH40KBaseActor, pile as unknown as WH40KBaseActor);

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('does not throw when the pile token is already gone (deleteEmbeddedDocuments rejects)', async () => {
        vi.spyOn(console, 'warn').mockImplementation((): void => {});
        // The scene still lists the pile's token, but deleting it rejects the way
        // Foundry does when Item Piles has already removed the same Token UUID.
        const deleteEmbeddedDocuments = vi
            .fn()
            .mockRejectedValue(new Error('undefined id [TGMEaMGcfFbkdhsb] does not exist in the EmbeddedCollection collection'));
        const scene: SceneStub = { tokens: [{ id: 'tok1', actorId: 'loot1' }], deleteEmbeddedDocuments };
        stubWorld([scene]);
        const receiver = makeReceiver();
        const pile = makePile();

        await expect(pickup(receiver, pile)).resolves.toBe(true);
        // Items still transferred and the actor still deleted despite the token fault.
        expect(receiver.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
        expect(pile.delete).toHaveBeenCalledTimes(1);
    });

    it('sweeps the orphaned token after deleting the actor (no Item Piles present)', async () => {
        const deleteEmbeddedDocuments = vi.fn().mockResolvedValue([]);
        const scene: SceneStub = { tokens: [{ id: 'tok1', actorId: 'loot1' }], deleteEmbeddedDocuments };
        stubWorld([scene]);
        const receiver = makeReceiver();
        const pile = makePile();

        await expect(pickup(receiver, pile)).resolves.toBe(true);
        expect(pile.delete).toHaveBeenCalledTimes(1);
        expect(deleteEmbeddedDocuments).toHaveBeenCalledWith('Token', ['tok1']);
    });

    it('deletes no token when none remains after the actor is gone (Item Piles cascade)', async () => {
        const deleteEmbeddedDocuments = vi.fn().mockResolvedValue([]);
        // Item Piles removed the token as part of the actor deletion; the scene
        // no longer lists a token backed by the pile, so nothing is re-deleted.
        const scene: SceneStub = { tokens: [{ id: 'tok1', actorId: 'other' }], deleteEmbeddedDocuments };
        stubWorld([scene]);
        const receiver = makeReceiver();
        const pile = makePile();

        await expect(pickup(receiver, pile)).resolves.toBe(true);
        expect(deleteEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('warns and does nothing when the receiver is not an owner', async () => {
        stubWorld([]);
        const receiver = makeReceiver({ isOwner: false });
        const pile = makePile();

        await expect(pickup(receiver, pile)).resolves.toBe(false);
        expect(pile.delete).not.toHaveBeenCalled();
    });

    it('warns and does nothing when the pile is empty', async () => {
        stubWorld([]);
        const receiver = makeReceiver();
        const pile = makePile({ items: [] });

        await expect(pickup(receiver, pile)).resolves.toBe(false);
        expect(pile.delete).not.toHaveBeenCalled();
    });
});
