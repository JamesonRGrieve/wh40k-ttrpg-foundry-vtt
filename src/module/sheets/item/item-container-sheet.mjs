/**
 * An item sheet that can accept other items within it --
 * e.g. weapons with associated weapon mods
 */
import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyItemContainerSheet extends DarkHeresyItemSheet {
    getData() {
        const context = super.getData();
        if (!context.item.system.container) {
            game.dh.warn('Unexpected Sheet Type: Item has container sheet but is not container?', context);
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
                item.addEventListener('dragstart', this._onItemDragStart.bind(this), false);
            });
        }
    }

    async _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        let data;
        let item;
        let actor;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.type !== 'Item') {
                game.dh.log('ItemCollection | Containers only accept items', data);
                return false;
            } else {
                game.dh.log('_onDrop data: ', data);

                if (data.uuid) {
                    item = await fromUuid(data.uuid);
                } else {
                    item = data.data;
                }

                if (data.actor) {
                    actor = data.actor;
                } else if (data.uuid) {
                    actor = await fromUuid(data.uuid);
                }

                // Check if Item already Exists
                if (this.item.items.find((i) => i._id === item._id)) {
                    game.dh.log('Item already exists in container -- ignoring');
                    return false;
                }
            }
        } catch (err) {
            game.dh.log('Item Container | drop error', err);
            return false;
        }

        if (item) {
            // Check up the chain that we are not dropping one of our parents onto us.
            let canAdd = this.item.id !== item._id;
            parent = this.item.parent;
            let count = 0;
            while (parent && count < 10) {
                // Don't allow drops of anything in the parent chain or the item will disappear.
                count += 1;
                canAdd = canAdd && parent.id !== item._id;
                parent = parent.parent;
            }
            if (!canAdd) {
                game.dh.log('ItemCollection | Cant drop on yourself');
                ui.notifications.info('Cannot drop item into itself');
                throw new Error('Dragging bag onto itself or ancestor opens a planar vortex and you are sucked into it');
            }
            // drop from player characters or another bag.
            if (this.canAdd(item)) {
                await this.item.createEmbeddedDocuments('Item', [item]);
                if (actor && (actor.type === 'acolyte' || actor.isToken)) await actor.deleteEmbeddedDocuments('Item', [item._id]);
                return false;
            }
            // Item is not accepted by this container -- place back onto actor
            else if (this.item.parent) {
                // this bag is owned by an actor - drop into the inventory instead.
                if (actor && actor.type === 'acolyte') await actor.deleteEmbeddedDocuments('Item', [item._id]);
                await this.item.parent.createEmbeddedDocuments('Item', [item]);
                ui.notifications.info('Item dropped back into actor.');
                return false;
            }
        }
        return false;
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
        Dialog.confirm({
            title: 'Confirm Delete',
            content: '<p>Are you sure you would like to delete this?</p>',
            yes: () => {
                const div = $(event.currentTarget);
                this.item.deleteEmbeddedDocuments('Item', [div.data('itemId')]);
                div.slideUp(200, () => this.render(false));
            },
            no: () => {},
            defaultYes: false,
        });
    }

    async _onItemDragStart(event) {
        event.stopPropagation();
        game.dh.log('Item:_onItemDragStart', event);

        const element = event.currentTarget;
        if (!element.dataset?.itemId) {
            game.dh.log('No Item Id - Cancelling Drag');
            return;
        }

        const itemId = element.dataset.itemId;
        let item = this.item.items.get(itemId);
        if (!item) {
            // Cannot find item on container? Just let foundry handle it...
            game.dh.log('Default Foundry Handler');
            return super._onDragStart(event);
        }

        // Create drag data
        const dragData = {
            parentId: this.item.id,
            type: 'Item',
            data: item,
        };
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        await this.item.deleteEmbeddedDocuments('Item', [itemId]);
    }

    canAdd(itemData) {
        return this.item.system.containerTypes.includes(itemData.type);
    }
}
