/**
 * An item sheet that can accept other items within it --
 * e.g. weapons with associated weapon mods
 */
import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyItemContainerSheet extends DarkHeresyItemSheet {
    getData() {
        const context = super.getData();
        if (!context.item.system.container) {
            console.warn('Unexpected Sheet Type: Item has container sheet but is not container?', context);
            this.options.editable = false;
            return context;
        }
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        if (this.item.system.container) {
            this.form.ondragover = (ev) => this._onDragOver(ev);
            this.form.ondrop = (ev) => this._onDrop(ev);
            this.form.ondragend = (ev) => this._onDragEnd(ev);
            html.find('.item-roll').click((ev) => this._onItemRoll(ev));
            html.find('.item-create').click(async (ev) => await this._onItemCreate(ev));
            html.find('.item-edit').click((ev) => this._onItemEdit(ev));
            html.find('.item-delete').click((ev) => this._onItemDelete(ev));
            html.find('.item-drag').each((i, item) => {
                item.setAttribute('draggable', true);
                item.addEventListener('dragstart', this._onDragItemStart.bind(this), false);
            });
        }
    }

    _onDragEnd(event) {
        event.preventDefault();
        return false;
    }

    _onDragOver(event) {
        event.preventDefault();
        return false;
    }

    _onItemRoll(event) {
        event.preventDefault();
        return false;
    }

    async _onItemCreate(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        let data = {
            name: `New ${div.data('type').capitalize()}`,
            type: div.data('type'),
        };
        await this.item.createEmbeddedDocuments('Item', [data]);
    }

    _onItemEdit(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        let item = this.item.items.get(div.data('itemId'));
        item.sheet.render(true);
    }

    _onItemDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        this.item.deleteEmbeddedDocuments('Item', [div.data('itemId')]);
        div.slideUp(200, () => this.render(false));
    }

    async _onDragItemStart(event) {
        event.stopPropagation();

        const element = event.currentTarget;
        if (!element.dataset?.itemId) {
            console.log('No Item Id - Cancelling Drag');
            return;
        }

        const itemId = element.dataset.itemId;
        let item = this.item.items.get(itemId);
        event.dataTransfer.setData(
            'text/plain',
            JSON.stringify({
                type: 'Item',
                data: item,
            }),
        );
        await this.item.deleteEmbeddedDocuments('Item', [itemId]);
    }

    canAdd(itemData) {
        return this.item.system.containerTypes.includes(itemData.type);
    }

    async _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        console.log('ItemContainerSheet _onDrop', event);
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.type !== 'Item') {
                console.log('ItemCollection | Containers only accept items');
                return false;
            }
        } catch (err) {
            console.log('Item Container | drop error');
            console.log(event.dataTransfer.getData('text/plain'));
            console.log(err);
            return false;
        }

        // Case 1 - Data explicitly provided
        let actor = game.actors.get(data.actorId);
        if (data.tokenId) {
            const uuid = `Scene.${data.sceneId}.Token.${data.tokenId}`;
            const tokenDocument = await fromUuid(uuid);
            if (tokenDocument) actor = tokenDocument.actor;
        }
        if (data.system) {
            // Check up the chain that we are not dropping one of our parents onto us.
            let canAdd = this.item.id !== data.system._id;
            parent = this.item.parent;
            let count = 0;
            while (parent && count < 10) {
                // Don't allow drops of anything in the parent chain or the item will disappear.
                count += 1;
                canAdd = canAdd && parent.id !== data.system._id;
                parent = parent.parent;
            }
            if (!canAdd) {
                console.log('ItemCollection | Cant drop on yourself');
                ui.notifications.info('Cannot drop item into itself');
                throw new Error('Dragging bag onto itself or ancestor opens a planar vortex and you are sucked into it');
            }
            // drop from player characters or another bag.
            if (this.canAdd(data)) {
                let toDelete = data.system._id;
                await this.item.createEmbeddedDocuments('Item', [data.system]);
                if (actor && (actor.system.type === 'character' || actor.isToken)) await actor.deleteEmbeddedDocuments('Item', [toDelete]);
                return false;
            }
            // Item is not accepted by this container -- place back onto actor
            else if (this.item.parent) {
                // this bag is owned by an actor - drop into the inventory instead.
                if (actor && actor.type === 'character') await actor.deleteEmbeddedDocuments('Item', [data.system._id]);
                await this.item.parent.createEmbeddedDocuments('Item', [data.system]);
                ui.notifications.info('Item dropped back into actor.');
                return false;
            }
        }

        // Case 2 - Import from a Compendium pack
        else if (data.pack) {
            this._importItemFromCollection(data.pack, data.id);
        }

        // Case 3 - Import from World entity
        else {
            let item = game.items.get(data.id);
            if (this.canAdd(item)) {
                const itemData = item.system.toJSON();
                await this.item.createEmbeddedDocuments('Item', [itemData]);
            }
        }
        return false;
    }

    async _importItemFromCollection(collection, entryId) {
        let item = await game.packs.get(collection).getDocument(entryId);
        if (!item) return;
        if (this.canAdd(item)) {
            return this.item.createEmbeddedDocuments('Item', item.system.toJSON());
        }
    }
}
