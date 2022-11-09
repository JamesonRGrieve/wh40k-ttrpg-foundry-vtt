export class DarkHeresyItemContainer extends Item {
  getEmbeddedDocument(embeddedName, id, { strict = false } = {}) {
    if (!this.system.container) return super.getEmbeddedDocument(embeddedName, id, { strict });
    return this.items.get(id);
  }

  async createEmbeddedDocuments(embeddedName, data, context) {
    if (!this.system.container || embeddedName !== 'Item') return await super.createEmbeddedDocuments(embeddedName, data, context);
    if (!Array.isArray(data)) data = [data];
    const currentItems = duplicate(getProperty(this, 'data.flags.itemcollection.contentsData') ?? []);

    if (data.length) {
      for (let itemData of data) {
        let theData = itemData;
        theData._id = randomID();
        theData = new CONFIG.Item.documentClass(theData, { parent: this }).toJSON();
        currentItems.push(theData);
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
    const containedItems = getProperty(this.data, 'flags.itemcollection.contentsData') ?? [];
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
    const contained = getProperty(this, 'data.flags.itemcollection.contentsData') ?? [];
    if (!Array.isArray(data)) data = [data];
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
        setProperty(currentItem.data._source, 'flags', idata.flags);
        setProperty(currentItem.data._source, 'data', idata.data);
        currentItem.prepareData();
        this.items.set(idata._id, currentItem);
        if (this.sheet) {
          currentItem.render(false, { action: 'update', data: currentItem.data });
        }
      }
    });
  }

  getEmbeddedCollection(type) {
    if (type === 'Item' && this.system.container) return this.items;
    return super.getEmbeddedCollection(type);
  }

  get actor() {
    if (this.parent instanceof Item) return null;
    return this.parent;
  }

  async update(data, context) {
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

  get isEmbedded() {
    // for items with an item parent we need to relax the definition a bit.
    // TODO find out how to do this with proper wrapping
    if (!(this.parent instanceof Item)) return this.parent !== null && this.documentName in this.parent.constructor.metadata.embedded;
    return this.parent !== null;
  }

  static async _onCreateDocuments(items, context) {
    if (!(context.parent instanceof Item)) return super._onCreateDocuments(items, context);
    if (items.filter((item) => item.system.container).length === 0) return super._onCreateDocuments(items, context);
    const toCreate = [];
    for (let item of items) {
      for (let e of item.effects) {
        if (!e.data.transfer) continue;
        const effectData = e.toJSON();
        effectData.origin = item.uuid;
        toCreate.push(effectData);
      }
    }
    if (!toCreate.length) return [];
    const cls = getDocumentClass('ActiveEffect');
    return cls.createDocuments(toCreate, context);
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
