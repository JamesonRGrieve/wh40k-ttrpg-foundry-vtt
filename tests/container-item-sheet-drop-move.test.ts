/**
 * Regression (#722): dragging an item from a character into a container MOVES it.
 *
 * The container sheet's drop handler nested a copy and then took the item off the
 * source actor only when that actor's type was `acolyte` or `character`. Every
 * line's player character is a `<line>-character`, so the item stayed on the
 * character and the drag duplicated it.
 *
 * The handler runs here against a structural host and stubbed `fromUuid`, so the
 * whole drop path executes without a live ApplicationV2.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import ContainerItemSheet from '../src/module/applications/item/container-item-sheet.ts';
import type { WH40KItem } from '../src/module/documents/item.ts';

// The sheet extends BaseItemSheet, whose mixin chain needs Foundry's ApplicationV2.
vi.mock('../src/module/applications/item/base-item-sheet.ts', () => {
    class FakeBaseItemSheet {
        static DEFAULT_OPTIONS = { actions: {} };
    }
    return { default: FakeBaseItemSheet };
});
vi.mock('../src/module/applications/dialogs/confirmation-dialog.ts', () => ({ default: { confirm: vi.fn() } }));

const ITEM_ID = 'itm722';
const ACTOR_UUID = 'Actor.act722';

/** A container's system data: its DataModel class declares the types it accepts. */
class StoreSystem {
    static containerTypes = ['gear'];
}

interface DroppedItemStub {
    _id: string;
    type: string;
    toObject: () => { name: string; type: string };
}

interface SourceActorStub {
    type: string;
    deleteEmbeddedDocuments: ReturnType<typeof vi.fn<(embeddedName: string, ids: string[]) => Promise<void>>>;
}

/** The dragged item as `fromUuid` resolves it. */
function droppedItem(type = 'gear'): DroppedItemStub {
    return { _id: ITEM_ID, type, toObject: () => ({ name: 'Rope', type }) };
}

/** An actor the item is dragged from. */
function sourceActor(type: string): SourceActorStub {
    return { type, deleteEmbeddedDocuments: vi.fn<(embeddedName: string, ids: string[]) => Promise<void>>().mockResolvedValue(undefined) };
}

/** Resolve drag uuids to the stubs, as Foundry's `fromUuid` does to documents. */
function stubFromUuid(docs: Record<string, object>): ReturnType<typeof vi.fn<(uuid: string) => Promise<object | null>>> {
    const lookup = vi.fn<(uuid: string) => Promise<object | null>>(async (uuid) => Promise.resolve(docs[uuid] ?? null));
    vi.stubGlobal('fromUuid', lookup);
    return lookup;
}

/** The surface of the sheet the drop handler reaches into. */
function makeHost(): {
    item: {
        id: string;
        parent: null;
        system: StoreSystem;
        items: { find: (fn: (i: { _id: string }) => boolean) => undefined };
        createNestedDocuments: ReturnType<typeof vi.fn<(data: object[]) => Promise<void>>>;
    };
    _onDropDefault: ReturnType<typeof vi.fn<(event: DragEvent) => Promise<void>>>;
    _canAddItem: (item: WH40KItem) => boolean;
    _validateDropTarget: (item: WH40KItem) => boolean;
} {
    return {
        item: {
            id: 'store722',
            parent: null,
            system: new StoreSystem(),
            items: { find: () => undefined },
            createNestedDocuments: vi.fn<(data: object[]) => Promise<void>>().mockResolvedValue(undefined),
        },
        _onDropDefault: vi.fn<(event: DragEvent) => Promise<void>>().mockResolvedValue(undefined),
        // The sheet's own validators, with their own signatures: the handler hands
        // them whatever `fromUuid` resolved, which here is the dragged-item stub.
        _canAddItem(item) {
            return ContainerItemSheet.prototype._canAddItem.call(this, item);
        },
        _validateDropTarget(item) {
            return ContainerItemSheet.prototype._validateDropTarget.call(this, item);
        },
    };
}

/** A drop event carrying `payload` as its drag data. */
function dropEvent(payload: object): DragEvent {
    const event = new DragEvent('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { getData: () => JSON.stringify(payload) } });
    return event;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('a container drop moves an item off a character (#722)', () => {
    const characterTypes = ['dh2-character', 'dh1-character', 'bc-character', 'dw-character', 'ow-character', 'rt-character', 'im-character', 'character'];

    for (const type of characterTypes) {
        it(`nests the item and removes it from a ${type}`, async () => {
            const item = droppedItem();
            const actor = sourceActor(type);
            stubFromUuid({ [`${ACTOR_UUID}.Item.${ITEM_ID}`]: item, [ACTOR_UUID]: actor });
            const host = makeHost();

            await ContainerItemSheet.prototype._onDrop.call(host, dropEvent({ type: 'Item', uuid: `${ACTOR_UUID}.Item.${ITEM_ID}` }));

            expect(host.item.createNestedDocuments).toHaveBeenCalledWith([{ name: 'Rope', type: 'gear' }]);
            expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledTimes(1);
            expect(actor.deleteEmbeddedDocuments).toHaveBeenCalledWith('Item', [ITEM_ID]);
        });
    }

    it('nests the copy before it removes the original, so a failed nest loses nothing', async () => {
        const actor = sourceActor('dh2-character');
        stubFromUuid({ [`${ACTOR_UUID}.Item.${ITEM_ID}`]: droppedItem(), [ACTOR_UUID]: actor });
        const host = makeHost();

        await ContainerItemSheet.prototype._onDrop.call(host, dropEvent({ type: 'Item', uuid: `${ACTOR_UUID}.Item.${ITEM_ID}` }));

        const nested = host.item.createNestedDocuments.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
        const removed = actor.deleteEmbeddedDocuments.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY;
        expect(nested).toBeLessThan(removed);
    });

    it('leaves the item on the character when the container refuses its type', async () => {
        const actor = sourceActor('dh2-character');
        stubFromUuid({ [`${ACTOR_UUID}.Item.${ITEM_ID}`]: droppedItem('talent'), [ACTOR_UUID]: actor });
        const host = makeHost();

        await ContainerItemSheet.prototype._onDrop.call(host, dropEvent({ type: 'Item', uuid: `${ACTOR_UUID}.Item.${ITEM_ID}` }));

        expect(host.item.createNestedDocuments).not.toHaveBeenCalled();
        expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('copies an item dragged from an actor that is not a character', async () => {
        const actor = sourceActor('dh2-npc');
        stubFromUuid({ [`${ACTOR_UUID}.Item.${ITEM_ID}`]: droppedItem(), [ACTOR_UUID]: actor });
        const host = makeHost();

        await ContainerItemSheet.prototype._onDrop.call(host, dropEvent({ type: 'Item', uuid: `${ACTOR_UUID}.Item.${ITEM_ID}` }));

        expect(host.item.createNestedDocuments).toHaveBeenCalledTimes(1);
        expect(actor.deleteEmbeddedDocuments).not.toHaveBeenCalled();
    });

    it('copies a world item and looks up no source actor', async () => {
        const lookup = stubFromUuid({ [`Item.${ITEM_ID}`]: droppedItem() });
        const host = makeHost();

        await ContainerItemSheet.prototype._onDrop.call(host, dropEvent({ type: 'Item', uuid: `Item.${ITEM_ID}` }));

        expect(host.item.createNestedDocuments).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('hands a drop that is not an Item to the base handler and nests nothing', async () => {
        stubFromUuid({});
        const host = makeHost();
        const event = dropEvent({ type: 'ActiveEffect', uuid: 'Item.x.ActiveEffect.y' });

        await ContainerItemSheet.prototype._onDrop.call(host, event);

        expect(host._onDropDefault).toHaveBeenCalledWith(event);
        expect(host.item.createNestedDocuments).not.toHaveBeenCalled();
    });
});
