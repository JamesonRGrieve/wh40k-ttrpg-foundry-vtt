/**
 * @file ContainerItemSheet - Item sheet for items that can contain other items
 * Handles weapons with mods, armour with upgrades, etc.
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Item sheet for container-type items (weapons, armour, gear, etc.)
 * that can hold nested items like modifications.
 */
export default class ContainerItemSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            nestedItemCreate: ContainerItemSheet.#nestedItemCreate,
            nestedItemEdit: ContainerItemSheet.#nestedItemEdit,
            nestedItemDelete: ContainerItemSheet.#nestedItemDelete,
            nestedItemRoll: ContainerItemSheet.#nestedItemRoll
        }
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Add nested items if this is a container
        if (this.item.system?.container) {
            context.nestedItems = this.item.items?.contents ?? [];
            context.isContainer = true;
        }

        return context;
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up drag-drop for container items
        if (this.isEditable && this.item.system?.container) {
            this._setupContainerDragDrop();
        }
    }

    /* -------------------------------------------- */

    /**
     * Set up drag-drop handlers for container functionality.
     * @protected
     */
    _setupContainerDragDrop() {
        const form = this.element.querySelector("form") ?? this.element;
        
        form.addEventListener("dragover", this._onDragOver.bind(this));
        form.addEventListener("drop", this._onDrop.bind(this));
        form.addEventListener("dragend", this._onDragEnd.bind(this));

        // Set up draggable nested items
        this.element.querySelectorAll("[data-nested-item-id]").forEach(el => {
            el.setAttribute("draggable", true);
            el.addEventListener("dragstart", this._onNestedItemDragStart.bind(this));
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle dragover events.
     * @param {DragEvent} event  The drag event.
     * @protected
     */
    _onDragOver(event) {
        event.preventDefault();
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Handle dragend events.
     * @param {DragEvent} event  The drag event.
     * @protected
     */
    _onDragEnd(event) {
        event.preventDefault();
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Handle drop events for nested items.
     * @param {DragEvent} event  The drop event.
     * @protected
     */
    async _onDrop(event) {
        event.preventDefault();
        event.stopPropagation();

        let data;
        let droppedItem;
        let sourceActor;

        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
            if (data.type !== "Item") {
                game.rt.log("ItemContainer | Containers only accept items", data);
                return false;
            }

            droppedItem = await fromUuid(data.uuid);
            if (!droppedItem) return false;

            // Get source actor if applicable
            if (data.uuid?.startsWith("Actor.")) {
                sourceActor = await fromUuid(data.uuid.split(".Item.")[0]);
            }

            // Check if item already exists
            if (this.item.items?.find(i => i._id === droppedItem._id)) {
                game.rt.log("Item already exists in container -- ignoring");
                return false;
            }
        } catch (err) {
            game.rt.log("ItemContainer | drop error", err);
            return false;
        }

        // Validate the drop
        if (!this._canAddItem(droppedItem)) {
            return false;
        }

        // Prevent dropping item onto itself or ancestors
        if (!this._validateDropTarget(droppedItem)) {
            ui.notifications.info("Cannot drop item into itself");
            return false;
        }

        // Add the item to the container
        await this.item.createNestedDocuments([droppedItem]);

        // Remove from source actor if applicable
        if (sourceActor && ["acolyte", "character"].includes(sourceActor.type)) {
            await sourceActor.deleteEmbeddedDocuments("Item", [droppedItem._id]);
        }

        return false;
    }

    /* -------------------------------------------- */

    /**
     * Validate that the drop target is not the item itself or an ancestor.
     * @param {Item} droppedItem  The item being dropped.
     * @returns {boolean}
     * @protected
     */
    _validateDropTarget(droppedItem) {
        let canAdd = this.item.id !== droppedItem._id;
        let parent = this.item.parent;
        let count = 0;

        while (parent && count < 10) {
            count++;
            canAdd = canAdd && parent.id !== droppedItem._id;
            parent = parent.parent;
        }

        return canAdd;
    }

    /* -------------------------------------------- */

    /**
     * Check if an item can be added to this container.
     * Override in subclasses for specific restrictions.
     * @param {Item} item  The item to check.
     * @returns {boolean}
     * @protected
     */
    _canAddItem(item) {
        if (!this.item.system?.containerTypes) return false;
        return this.item.system.containerTypes.includes(item.type);
    }

    /* -------------------------------------------- */

    /**
     * Handle dragging a nested item out of the container.
     * @param {DragEvent} event  The drag event.
     * @protected
     */
    async _onNestedItemDragStart(event) {
        event.stopPropagation();

        const element = event.currentTarget;
        const itemId = element.dataset.nestedItemId;
        if (!itemId) return;

        const nestedItem = this.item.items?.get(itemId);
        if (!nestedItem) return;

        // Create drag data
        const dragData = {
            parentId: this.item.id,
            type: "Item",
            data: nestedItem
        };
        event.dataTransfer.setData("text/plain", JSON.stringify(dragData));

        // Remove from container
        await this.item.deleteNestedDocuments([itemId]);
    }

    /* -------------------------------------------- */

    /**
     * Handle creating a nested item.
     * @this {ContainerItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #nestedItemCreate(event, target) {
        const itemType = target.dataset.type ?? "gear";
        const data = {
            name: `New ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
            type: itemType
        };
        await this.item.createNestedDocuments([data]);
    }

    /* -------------------------------------------- */

    /**
     * Handle editing a nested item.
     * @this {ContainerItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #nestedItemEdit(event, target) {
        const itemId = target.closest("[data-nested-item-id]")?.dataset.nestedItemId;
        const nestedItem = this.item.items?.get(itemId);
        nestedItem?.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting a nested item.
     * @this {ContainerItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #nestedItemDelete(event, target) {
        const itemId = target.closest("[data-nested-item-id]")?.dataset.nestedItemId;
        if (!itemId) return;

        const confirmed = await Dialog.confirm({
            title: "Confirm Delete",
            content: "<p>Are you sure you would like to delete this?</p>",
            defaultYes: false
        });

        if (confirmed) {
            await this.item.deleteNestedDocuments([itemId]);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling a nested item.
     * @this {ContainerItemSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #nestedItemRoll(event, target) {
        // Placeholder for nested item rolls
        event.preventDefault();
    }
}
