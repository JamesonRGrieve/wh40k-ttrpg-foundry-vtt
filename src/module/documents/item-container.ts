import { SYSTEM_ID } from '../constants.ts';
import type ItemDataModel from '../data/abstract/item-data-model.ts';

export const DH_CONTAINER_ID = 'nested';

/** Minimal shape of a raw nested item record stored in flags. */
interface NestedItemData extends Record<string, unknown> {
    _id: string;
}

/** System data shape expected by WH40KItemContainer for container/equipped checks. */
interface ContainerSystemData extends Record<string, unknown> {
    container: unknown;
    equipped?: boolean;
    enabled?: boolean;
}

export class WH40KItemContainer extends Item {
    // @ts-expect-error -- V14 types `Item.system` as a discriminated union over registered subTypes;
    // the abstract `ItemDataModel & ContainerSystemData` shape this base class needs is structurally
    // sound but not a member of that union. Subclasses (`WH40KItem`) refine to the concrete type.
    declare system: ItemDataModel & ContainerSystemData;
    declare items: foundry.utils.Collection<Item>;

    get actor(): Actor.Implementation | null {
        if (this.parent instanceof Item) return null;
        return this.parent instanceof Actor ? this.parent : null;
    }

    override async update(data: Item.UpdateInput = {}, options?: Parameters<Item['update']>[1]): Promise<this | undefined> {
        const dataRecord = data as Record<string, unknown>;
        dataRecord['_id'] = this.id;
        if (this.isNestedItem()) {
            const parentItem = this.parent as unknown as WH40KItemContainer;
            await parentItem.updateNestedDocuments(dataRecord);
            return undefined;
        } else {
            return super.update(data, options);
        }
    }

    isNestedItem(): boolean {
        return this.parent instanceof Item;
    }

    setNestedManual(data: Record<string, unknown> | Record<string, unknown>[]): void {
        // Check if each layer of the object exists, and create it if it doesn't
        if (this.flags[SYSTEM_ID] === undefined) this.flags[SYSTEM_ID] = {};
        if (this.flags[SYSTEM_ID][DH_CONTAINER_ID] === undefined) this.flags[SYSTEM_ID][DH_CONTAINER_ID] = [];
        // Set the value at the deepest level of the object
        // Make array if not
        const dataArray = Array.isArray(data) ? data : [data];
        this.flags[SYSTEM_ID][DH_CONTAINER_ID] = dataArray;
    }

    async setNested(data: Record<string, unknown> | Record<string, unknown>[]): Promise<unknown> {
        // Make array if not
        const dataArray = Array.isArray(data) ? data : [data];
        return this.setFlag(SYSTEM_ID, DH_CONTAINER_ID, dataArray);
    }

    getNested(): NestedItemData[] {
        return (this.getFlag(SYSTEM_ID, DH_CONTAINER_ID) as NestedItemData[] | undefined) ?? [];
    }

    hasNested(): boolean {
        return this.getNested().length > 0;
    }

    async convertNestedToItems(): Promise<void> {
        // Convert Nested to Items
        game.wh40k.log(`Convert ${this.name} Nested`, this.hasNested());
        this.items = new foundry.utils.Collection();
        const itemClass = CONFIG.Item.documentClass;
        for (const nestedData of this.getNested()) {
            const item = new itemClass(nestedData as unknown as never, { parent: this as unknown as never });
            await this.items.set(nestedData._id, item as unknown as Item);
        }
        game.wh40k.log(`Item ${this.name} items:`, this.items);
    }

    static async _onCreateOperation(
        items: InstanceType<typeof foundry.abstract.Document>[],
        context: Record<string, unknown>,
        user: Record<string, unknown>,
    ): Promise<unknown> {
        const superClass = Object.getPrototypeOf(WH40KItemContainer) as {
            _onCreateOperation?: (items: never, context: never, user: never) => Promise<unknown>;
        };
        const callSuper = async () => superClass._onCreateOperation?.(items as never, context as never, user as never);
        const typedItems = items as unknown as Array<{
            system: ContainerSystemData;
            effects: Iterable<{ data: { transfer: unknown }; toJSON(): Record<string, unknown>; uuid: string }>;
            uuid: string;
        }>;
        // Parent is not an item -- ignore
        if (!(context.parent instanceof Item)) return callSuper();
        // None of the items being created are containers -- ignore
        if (typedItems.filter((item) => item.system.container !== undefined && item.system.container !== null).length === 0) return callSuper();

        const toCreate: Record<string, unknown>[] = [];
        for (const item of typedItems) {
            for (const e of item.effects) {
                if (e.data.transfer === undefined || e.data.transfer === null || e.data.transfer === false) continue;
                const effectData = e.toJSON();
                effectData['origin'] = item.uuid;
                toCreate.push(effectData);
            }
        }
        if (toCreate.length === 0) return [];
        game.wh40k.log(`ItemContainer: ${this.name} _onCreateDocuments`);
        const cls = getDocumentClass('ActiveEffect');
        return (cls as unknown as { createDocuments(data: Record<string, unknown>[], context: Record<string, unknown>): Promise<unknown> }).createDocuments(
            toCreate,
            context,
        );
    }

    hasWeaponModification(mod: string): boolean {
        return this.hasItemByType(mod, 'weaponModification');
    }

    hasItemByType(item: string, type: string): boolean {
        game.wh40k.log('Check for Has Nested Item', item);
        if (this.system.container === undefined || this.system.container === null) return false;
        return (
            this.items.find((i) => {
                const sys = i.system as unknown as ContainerSystemData;
                return i.name === item && i.type === type && (sys.equipped === true || sys.enabled === true);
            }) !== undefined
        );
    }

    getWeaponModification(mod: string): Item | undefined {
        return this.getItemByName(mod, 'weaponModification');
    }

    getItemByName(item: string, type: string): Item | undefined {
        game.wh40k.log('Check for item by name', item);
        if (this.system.container === undefined || this.system.container === null) return undefined;
        return this.items.find((i) => i.name === item && i.type === type);
    }

    async createNestedDocuments(data: Record<string, unknown> | Record<string, unknown>[]): Promise<void> {
        const dataArray = Array.isArray(data) ? data : [data];
        game.wh40k.log(`ItemContainer: ${this.name} createNestedDocuments`, dataArray);
        const currentItems = this.getNested();
        const itemClass = CONFIG.Item.documentClass;

        if (dataArray.length > 0) {
            for (const itemData of dataArray) {
                let clone = JSON.parse(JSON.stringify(itemData)) as NestedItemData;
                clone._id = foundry.utils.randomID();
                clone = new itemClass(clone as unknown as never, { parent: this as unknown as never }).toJSON() as NestedItemData;
                currentItems.push(clone);
            }

            await this.setNested(currentItems);
        }
    }

    async deleteNestedDocuments(ids: string[] = []): Promise<unknown[]> {
        game.wh40k.log(`ItemContainer: ${this.name} deleteNestedDocuments`, ids);
        const containedItems = this.getNested();
        const newContained = containedItems.filter((itemData) => !ids.includes(itemData._id));
        const deletedItems = this.items.filter((item) => ids.includes(item.id ?? ''));
        await this.setNested(newContained);
        return deletedItems;
    }

    async updateNestedDocuments(data: Record<string, unknown> | Record<string, unknown>[]): Promise<unknown[]> {
        const contained = this.getNested();
        const dataArray = Array.isArray(data) ? data : [data];
        game.wh40k.log(`ItemContainer: ${this.name} updateNestedDocuments`, dataArray);
        const updated: NestedItemData[] = [];
        const newContained = contained.map((existing) => {
            const theUpdate = dataArray.find((update) => update._id === existing._id);
            if (theUpdate !== undefined) {
                game.wh40k.log('Found Update object', theUpdate);
                const newData = foundry.utils.mergeObject(theUpdate, existing, {
                    overwrite: false,
                    insertKeys: true,
                    insertValues: true,
                    inplace: false,
                }) as NestedItemData;
                game.wh40k.log('Merged Update object', newData);
                updated.push(newData);
                return newData;
            }
            return existing;
        });

        if (updated.length > 0) {
            await this.setNested(newContained);
        }
        return updated;
    }

    prepareEmbeddedDocuments(): void {
        // Equivalent to `super.prepareEmbeddedDocuments()`, but routed through Item.prototype
        // to dodge the ItemBase typing gap (the method exists on ClientDocument at runtime).
        // Walking via `Object.getPrototypeOf(Object.getPrototypeOf(this))` is unsafe: when a
        // subclass like WH40KItem extends this class, two prototype hops land back on
        // WH40KItemContainer.prototype and recurse into this same method → stack overflow.
        (Item.prototype as { prepareEmbeddedDocuments?: () => void }).prepareEmbeddedDocuments?.call(this);
        if (!(this instanceof Item) || this.system.container === undefined || this.system.container === null) return;
        game.wh40k.log(`ItemContainer: ${this.name}`, 'prepareEmbeddedDocuments');
        const containedItems = this.getNested();
        const oldItems = this.items;
        this.items = new foundry.utils.Collection();
        const itemClass = CONFIG.Item.documentClass;
        containedItems.forEach((idata) => {
            if (!oldItems.has(idata._id)) {
                const theItem = new itemClass(idata as unknown as never, { parent: this as unknown as never });
                this.items.set(idata._id, theItem as unknown as Item);
            } else {
                // Reuse existing item instance and update its data
                const currentItem = oldItems.get(idata._id);
                if (currentItem === undefined) return;
                currentItem.updateSource(idata);
                currentItem.prepareData();
                this.items.set(idata._id, currentItem);
                if (this.sheet !== null) {
                    currentItem.render(false);
                }
            }
        });
    }
}
