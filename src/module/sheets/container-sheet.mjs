/**
 * An item sheet that can accept other items within it --
 * e.g. weapons with associated weapon mods
 */
import {DarkHeresyItemSheet} from "./item-sheet.mjs";

export class DarkHeresyContainerSheet extends DarkHeresyItemSheet {

    getData() {
        const context = super.getData();
        if (!context.data.container) {
            this.options.editable = false;
            options.editable = false;
            return context;
        }

        const item = this.item;
        context.flags = duplicate(item.data.flags);
        return context;
    }


    activateListeners(html) {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.isEditable) return;

        if (this.item.data.data.container) {
            this.form.ondragover = ev => this._onDragOver(ev);
            this.form.ondrop = ev => this._onDrop(ev);
            html.find('.item-delete').click(ev => this._onItemDelete(ev));

            // html.find('.item').each((i, li) => {
            //     li.setAttribute("draggable", true);
            //     li.addEventListener("dragstart", this._onDragItemStart.bind(this), false);
            // });
            //
            // document.addEventListener("dragend", this._onDragEnd.bind(this));
            // html.find('.item .item-name.rollable h4').click(event => this._onItemSummary(event));
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

    _onItemDelete(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        this.item.deleteEmbeddedDocuments("Item", [div.data("itemId")]);
        div.slideUp(200, () => this.render(false));
    }

    async _onDragItemStart(event) {
        event.stopPropagation();
        const itemId = event.currentTarget.dataset.itemId;
        let item = this.item.items.get(itemId);
        event.dataTransfer.setData("text/plain", JSON.stringify({
            type: "Item",
            data: item
        }));
        await this.item.deleteEmbeddedDocuments("Item", [itemId]);
    }

    canAdd(itemData) {
        return this.item.data.data.containerTypes.includes(itemData.type);
    }

    async _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        console.log("_onDrop");
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if ( data.type !== "Item" ) {
                console.log("ItemCollection | Containers only accept items");
                return false;
            }
        } catch (err) {
            console.log("ItemCollection | drop error")
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
        if ( data.data ) {
            // Check up the chain that we are not dropping one of our parents onto us.
            let canAdd = this.item.id !== data.data._id;
            parent = this.item.parent;
            let count = 0;
            while (parent && count < 10) { // Don't allow drops of anything in the parent chain or the item will disappear.
                count += 1;
                canAdd = canAdd && (parent.id !== data.data._id);
                parent = parent.parent;
            }
            if (!canAdd) {
                console.log("ItemCollection | Cant drop on yourself");
                ui.notifications.info("Cannot drop item into itself");
                throw new Error("Dragging bag onto itself or ancestor opens a planar vortex and you are sucked into it")
            }
            // drop from player characters or another bag.
            if (this.canAdd(data.data)) {
                let toDelete = data.data._id;
                await this.item.createEmbeddedDocuments("Item", [data.data]);
                if (actor && (actor.data.type === "character" || actor.isToken)) await actor.deleteEmbeddedDocuments("Item", [toDelete]);
                return false;
            }
            // Item is not accepted by this container -- place back onto actor
            else if (this.item.parent) { // this bag is owned by an actor - drop into the inventory instead.
                if (actor && actor.data.type === "character") await actor.deleteEmbeddedDocuments("Item", [data.data._id]);
                await this.item.parent.createEmbeddedDocuments("Item", [data.data]);
                ui.notifications.info(game.i18n.localize('itemcollection.AlternateDropInInventory'));
                return false;
            }
        }

        // Case 2 - Import from a Compendium pack
        else if ( data.pack ) {
            this._importItemFromCollection(data.pack, data.id);
        }

        // Case 3 - Import from World entity
        else {
            let item = game.items.get(data.id);
            if (this.canAdd(item.data)) {
                const itemData = item.data.toJSON();
                await this.item.createEmbeddedDocuments("Item", [itemData]);
            } else {
                console.log(`ItemCollection | no room in bag for dropped item`);
                ui.notifications.info(game.i18n.localize('itemcollection.NoRoomInBag'));
            }
        }
        return false;
    }

    async _importItemFromCollection(collection, entryId) {
        let item = await game.packs.get(collection).getDocument(entryId);
        if (!item) return;
        if (this.canAdd(item.data)) {
            return this.item.createEmbeddedDocuments("Item", item.data.toJSON())
        }
    }

}
