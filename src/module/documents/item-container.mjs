export class DarkHeresyItemContainer extends Item {
    get actor() {
        if (this.parent instanceof Item) return null;
        return this.parent;
    }

    get isEmbedded() {
        // for items with an item parent we need to relax the definition a bit.
        // TODO find out how to do this with proper wrapping
        if (!(this.parent instanceof Item)) return this.parent !== null && this.documentName in this.parent.constructor.metadata.embedded;
        return true;
    }

    static async _onCreateDocuments(items, context) {
        // Parent is not an item -- ignore
        if (!(context.parent instanceof Item)) return super._onCreateDocuments(items, context);
        // None of the items being created are containers -- ignore
        if (items.filter((item) => item.system.container).length === 0) return super._onCreateDocuments(items, context);

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
        game.dh.log('ItemContainer: ' + this.name + ' _onCreateDocuments');
        const cls = getDocumentClass('ActiveEffect');
        return cls.createDocuments(toCreate, context);
    }

    hasWeaponModification(mod) {
        return this.hasEmbeddedItem(mod, 'weaponModification');
    }

    hasEmbeddedItem(item, type) {
        game.dh.log('Check for Has Embedded', item);
        if (!this.system.container) return false;
        return !!this.items.find((i) => i.name === item && i.type === type && (i.system.equipped || i.system.enabled));
    }

    getWeaponModification(mod) {
        return this.getItemByName(mod, 'weaponModification');
    }

    getItemByName(item, type) {
        game.dh.log('Check for item by name', item);
        if (!this.system.container) return;
        return this.items.find((i) => i.name === item && i.type === type);
    }

    getEmbeddedDocument(embeddedName, id, { strict = false } = {}) {
        if (!this.system.container) return super.getEmbeddedDocument(embeddedName, id, { strict });
        return this.items.get(id);
    }

    async createEmbeddedDocuments(embeddedName, data, context) {
        if (!this.system.container || embeddedName !== 'Item') return await super.createEmbeddedDocuments(embeddedName, data, context);
        if (!Array.isArray(data)) data = [data];
        game.dh.log('ItemContainer: ' + this.name + ' createEmbeddedDocuments', data);
        const currentItems = duplicate(getProperty(this, 'flags.itemcollection.contentsData') ?? []);

        if (data.length) {
            for (let itemData of data) {
                let clone = JSON.parse(JSON.stringify(itemData));
                clone._id = randomID();
                clone = new CONFIG.Item.documentClass(clone, { parent: this }).toJSON();
                currentItems.push(clone);
            }
            if (this.parent)
                return await this.parent.updateEmbeddedDocuments('Item', [
                    {
                        '_id': this.id,
                        'flags.itemcollection.contentsData': currentItems,
                    },
                ]);
            else await this.setCollection(this, currentItems);
        }
    }

    async deleteEmbeddedDocuments(embeddedName, ids = [], options = {}) {
        if (!this.system.container || embeddedName !== 'Item') return super.deleteEmbeddedDocuments(embeddedName, ids, options);
        game.dh.log('ItemContainer: ' + this.name + ' deleteEmbeddedDocuments', ids);
        const containedItems = getProperty(this, 'flags.itemcollection.contentsData') ?? [];
        const newContained = containedItems.filter((itemData) => !ids.includes(itemData._id));
        const deletedItems = this.items.filter((item) => ids.includes(item.id));
        if (this.parent) {
            await this.parent.updateEmbeddedDocuments('Item', [
                {
                    '_id': this.id,
                    'flags.itemcollection.contentsData': newContained,
                },
            ]);
        } else {
            await this.setCollection(this, newContained);
        }
        return deletedItems;
    }

    async updateEmbeddedDocuments(embeddedName, data, options) {
        if (!this.system.container || embeddedName !== 'Item') return await super.updateEmbeddedDocuments(embeddedName, data, options);
        const contained = getProperty(this, 'flags.itemcollection.contentsData') ?? [];
        if (!Array.isArray(data)) data = [data];
        game.dh.log('ItemContainer: ' + this.name + ' updateEmbeddedDocuments');
        let updated = [];
        let newContained = contained.map((existing) => {
            let theUpdate = data.find((update) => update._id === existing._id);
            if (theUpdate) {
                const newData = mergeObject(theUpdate, existing, {
                    overwrite: false,
                    insertKeys: true,
                    insertValues: true,
                    inplace: false,
                });
                updated.push(newData);
                return newData;
            }
            return existing;
        });

        if (updated.length > 0) {
            if (this.parent) {
                await this.parent.updateEmbeddedDocuments('Item', [
                    {
                        '_id': this.id,
                        'flags.itemcollection.contentsData': newContained,
                    },
                ]);
            } else {
                await this.setCollection(this, newContained);
            }
        }
        return updated;
    }

    prepareEmbeddedDocuments() {
        super.prepareEmbeddedDocuments();
        if (!(this instanceof Item && this.system.container)) return;
        game.dh.log('ItemContainer: ' + this.name + ' prepareEmbeddedDocuments');
        const containedItems = getProperty(this.flags, 'itemcollection.contentsData') ?? [];
        const oldItems = this.items;
        this.items = new foundry.utils.Collection();
        containedItems.forEach((idata) => {
            if (!oldItems?.has(idata._id)) {
                const theItem = new CONFIG.Item.documentClass(idata, { parent: this });
                this.items.set(idata._id, theItem);
            } else {
                // TODO see how to avoid this - here to make sure the contained items is correctly setup
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

    getEmbeddedCollection(type) {
        if (type === 'Item' && this.system.container) return this.items;
        return super.getEmbeddedCollection(type);
    }

    async update(data, context) {
        game.dh.log('ItemContainer: ' + this.name + ' update', data);
        if (!(this.parent instanceof Item)) return super.update(data, context);
        data = foundry.utils.expandObject(data);
        data._id = this.id;
        await this.parent.updateEmbeddedDocuments('Item', [data]);
        this.render(false, { action: 'update', data: data });
    }

    async delete(data) {
        if (!(this.parent instanceof Item)) return super.delete(data);
        return this.parent.deleteEmbeddedDocuments('Item', [this.id]);
    }

    async createDocuments(data = [], context = { parent: {}, pack: {}, options: {} }) {
        const { parent, pack, options } = context;
        if (!(this.system.container && parent instanceof Item)) return super.createDocuments(data, context);
        await parent.createEmbeddedDocuments('Item', data, options);
    }

    async deleteDocuments(ids = [], context = { parent: {}, pack: {}, options: {} }) {
        const { parent, pack, options } = context;
        if (!(this.system.container && parent instanceof Item)) return super.deleteDocuments(ids, context);
        // an Item whose parent is an item only exists in the embedded documents
        return parent.deleteEmbeddedDocuments('Item', ids);
    }

    async updateDocuments(updates = [], context = { parent: {}, pack: {}, options: {} }) {
        const { parent, pack, options } = context;
        // An item whose parent is an item only exists in the parents embedded documents
        if (!(this.system.container && parent instanceof Item)) return super.updateDocuments(updates, context);
        return parent.updateEmbeddedDocuments('Item', updates, options);
    }

    async setCollection(item, contents) {
        await item.update({ 'flags.itemcollection.contentsData': duplicate(contents) });
    }
}
