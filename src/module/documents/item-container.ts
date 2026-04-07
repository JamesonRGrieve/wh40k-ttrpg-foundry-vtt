import { SYSTEM_ID } from '../constants.ts';

export const DH_CONTAINER_ID = 'nested';

export class WH40KItemContainer extends Item {
    declare items: foundry.utils.Collection<Item>;

    get actor(): Actor | null {
        if (this.parent instanceof Item) return null;
        return this.parent as Actor;
    }

    async update(data: Record<string, unknown> = {}, options: Record<string, unknown> = {}): Promise<any> {
        data._id = this.id;
        if (this.isNestedItem()) {
            await this.parent.updateNestedDocuments(data);
        } else {
            return super.update(data, options);
        }
    }

    isNestedItem(): boolean {
        return this.parent instanceof Item;
    }

    setNestedManual(data: Record<string, unknown> | Record<string, unknown>[]): void {
        // Check if each layer of the object exists, and create it if it doesn't
        if (!this.flags[SYSTEM_ID]) this.flags[SYSTEM_ID] = {};
        if (!this.flags[SYSTEM_ID][DH_CONTAINER_ID]) this.flags[SYSTEM_ID][DH_CONTAINER_ID] = [];
        // Set the value at the deepest level of the object
        // Make array if not
        if (!Array.isArray(data)) data = [data];
        this.flags[SYSTEM_ID][DH_CONTAINER_ID] = data;
    }

    async setNested(data: Record<string, unknown> | Record<string, unknown>[]): Promise<any> {
        // Make array if not
        if (!Array.isArray(data)) data = [data];
        return await this.setFlag(SYSTEM_ID, DH_CONTAINER_ID, data);
    }

    getNested(): any[] {
        return this.getFlag(SYSTEM_ID, DH_CONTAINER_ID) ?? [];
    }

    hasNested(): boolean {
        return this.getNested().length > 0;
    }

    async convertNestedToItems(): Promise<void> {
        // Convert Nested to Items
        game.wh40k.log(`Convert ${this.name} Nested`, this.hasNested());
        this.items = new foundry.utils.Collection();
        for (const nestedData of this.getNested()) {
            const item = new CONFIG.Item.documentClass(nestedData, { parent: this });
            await this.items.set(nestedData._id, item);
        }
        game.wh40k.log(`Item ${this.name} items:`, this.items);
    }

    static async _onCreateOperation(items: any[], context: any, user: any): Promise<any> {
        // Parent is not an item -- ignore
        if (!(context.parent instanceof Item)) return super._onCreateOperation(items, context, user);
        // None of the items being created are containers -- ignore
        if (items.filter((item) => item.system.container).length === 0) return super._onCreateOperation(items, context, user);

        const toCreate = [];
        for (const item of items) {
            for (const e of item.effects) {
                if (!e.data.transfer) continue;
                const effectData = e.toJSON();
                effectData.origin = item.uuid;
                toCreate.push(effectData);
            }
        }
        if (!toCreate.length) return [];
        game.wh40k.log(`ItemContainer: ${this.name} _onCreateDocuments`);
        const cls = getDocumentClass('ActiveEffect');
        return cls.createDocuments(toCreate, context);
    }

    hasWeaponModification(mod: string): boolean {
        return this.hasItemByType(mod, 'weaponModification');
    }

    hasItemByType(item: string, type: string): boolean {
        game.wh40k.log('Check for Has Nested Item', item);
        if (!this.system.container) return false;
        return !!this.items.find((i) => i.name === item && i.type === type && (i.system.equipped || i.system.enabled));
    }

    getWeaponModification(mod: string): Item | undefined {
        return this.getItemByName(mod, 'weaponModification');
    }

    getItemByName(item: string, type: string): Item | undefined {
        game.wh40k.log('Check for item by name', item);
        if (!this.system.container) return;
        return this.items.find((i) => i.name === item && i.type === type);
    }

    async createNestedDocuments(data: Record<string, unknown> | Record<string, unknown>[]): Promise<void> {
        if (!Array.isArray(data)) data = [data];
        game.wh40k.log(`ItemContainer: ${this.name} createNestedDocuments`, data);
        const currentItems = this.getNested();

        if (data.length > 0) {
            for (const itemData of data) {
                let clone = JSON.parse(JSON.stringify(itemData));
                clone._id = foundry.utils.randomID();
                clone = new CONFIG.Item.documentClass(clone, { parent: this }).toJSON();
                currentItems.push(clone);
            }

            await this.setNested(currentItems);
        }
    }

    async deleteNestedDocuments(ids: string[] = []): Promise<any[]> {
        game.wh40k.log(`ItemContainer: ${this.name} deleteNestedDocuments`, ids);
        const containedItems = this.getNested();
        const newContained = containedItems.filter((itemData) => !ids.includes(itemData._id));
        const deletedItems = this.items.filter((item) => ids.includes(item.id));
        await this.setNested(newContained);
        return deletedItems;
    }

    async updateNestedDocuments(data: Record<string, unknown> | Record<string, unknown>[]): Promise<any[]> {
        const contained = this.getNested();
        if (!Array.isArray(data)) data = [data];
        game.wh40k.log(`ItemContainer: ${this.name} updateNestedDocuments`, data);
        const updated = [];
        const newContained = contained.map((existing) => {
            const theUpdate = data.find((update) => update._id === existing._id);
            if (theUpdate) {
                game.wh40k.log('Found Update object', theUpdate);
                const newData = foundry.utils.mergeObject(theUpdate, existing, {
                    overwrite: false,
                    insertKeys: true,
                    insertValues: true,
                    inplace: false,
                });
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
        super.prepareEmbeddedDocuments();
        if (!(this instanceof Item && this.system.container)) return;
        game.wh40k.log(`ItemContainer: ${this.name}`, 'prepareEmbeddedDocuments');
        const containedItems = this.getNested();
        const oldItems = this.items;
        this.items = new foundry.utils.Collection();
        containedItems.forEach((idata) => {
            if (!oldItems?.has(idata._id)) {
                const theItem = new CONFIG.Item.documentClass(idata, { parent: this });
                this.items.set(idata._id, theItem);
            } else {
                // Reuse existing item instance and update its data
                const currentItem = oldItems.get(idata._id);
                currentItem.updateSource(idata);
                currentItem.prepareData();
                this.items.set(idata._id, currentItem);
                if (this.sheet) {
                    currentItem.render(false, { action: 'update', data: currentItem.system });
                }
            }
        });
    }
}
