/**
 * @file ContainerItemSheet - Item sheet for items that can contain other items
 * Handles weapons with mods, armour with upgrades, etc.
 */

import ConfirmationDialog from '../dialogs/confirmation-dialog.ts';
import BaseItemSheet from './base-item-sheet.ts';

/**
 * Item sheet for container-type items (weapons, armour, gear, etc.)
 * that can hold nested items like modifications.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class ContainerItemSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            ...BaseItemSheet.DEFAULT_OPTIONS?.actions,
            nestedItemCreate: ContainerItemSheet.#nestedItemCreate,
            nestedItemEdit: ContainerItemSheet.#nestedItemEdit,
            nestedItemDelete: ContainerItemSheet.#nestedItemDelete,
            nestedItemRoll: ContainerItemSheet.#nestedItemRoll,
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
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
    async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
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
    _setupContainerDragDrop(): void {
        const form = this.element.querySelector('form') ?? this.element;

        form.addEventListener('dragover', this._onDragOver.bind(this));
        form.addEventListener('drop', this._onDrop.bind(this));
        form.addEventListener('dragend', this._onDragEnd.bind(this));

        // Set up draggable nested items
        this.element.querySelectorAll('[data-nested-item-id]').forEach((el) => {
            el.setAttribute('draggable', true);
            el.addEventListener('dragstart', this._onNestedItemDragStart.bind(this));
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle dragover events.
     * @param {DragEvent} event  The drag event.
     * @protected
     */
    _onDragOver(event: Event): void {
        event.preventDefault();
        // @ts-expect-error - type assignment
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Handle dragend events.
     * @param {DragEvent} event  The drag event.
     * @protected
     */
    _onDragEnd(event: Event): void {
        event.preventDefault();
        // @ts-expect-error - type assignment
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Handle drop events for nested items.
     * @param {DragEvent} event  The drop event.
     * @protected
     */
    async _onDrop(event: Event): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        let data;
        let droppedItem;
        let sourceActor;

        try {
            // @ts-expect-error - TS2339
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.type !== 'Item') {
                game.wh40k.log('ItemContainer | Containers only accept items', data);
                // @ts-expect-error - type assignment
                return false;
            }

            droppedItem = await fromUuid(data.uuid);
            // @ts-expect-error - type assignment
            if (!droppedItem) return false;

            // Get source actor if applicable
            if (data.uuid?.startsWith('Actor.')) {
                sourceActor = await fromUuid(data.uuid.split('.Item.')[0]);
            }

            // Check if item already exists
            if (this.item.items?.find((i) => i._id === droppedItem._id)) {
                game.wh40k.log('Item already exists in container -- ignoring');
                // @ts-expect-error - type assignment
                return false;
            }
        } catch (err) {
            game.wh40k.log('ItemContainer | drop error', err);
            // @ts-expect-error - type assignment
            return false;
        }

        // Validate the drop
        if (!this._canAddItem(droppedItem)) {
            // @ts-expect-error - type assignment
            return false;
        }

        // Prevent dropping item onto itself or ancestors
        if (!this._validateDropTarget(droppedItem)) {
            (ui.notifications as any).info('Cannot drop item into itself');
            // @ts-expect-error - type assignment
            return false;
        }

        // Add the item to the container
        await this.item.createNestedDocuments([droppedItem]);

        // Remove from source actor if applicable
        if (sourceActor && ['acolyte', 'character'].includes(sourceActor.type)) {
            await sourceActor.deleteEmbeddedDocuments('Item', [droppedItem._id]);
        }

        // @ts-expect-error - type assignment
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Validate that the drop target is not the item itself or an ancestor.
     * @param {Item} droppedItem  The item being dropped.
     * @returns {boolean}
     * @protected
     */
    _validateDropTarget(droppedItem: any): boolean {
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
    _canAddItem(item: any): boolean {
        if (!this.item.system?.containerTypes) return false;
        return this.item.system.containerTypes.includes(item.type);
    }

    /* -------------------------------------------- */

    /**
     * Handle dragging a nested item out of the container.
     * @param {DragEvent} event  The drag event.
     * @protected
     */
    async _onNestedItemDragStart(event: Event): Promise<void> {
        event.stopPropagation();

        const element = event.currentTarget as HTMLElement;
        const itemId = (element as any).dataset.nestedItemId;
        if (!itemId) return;

        const nestedItem = this.item.items?.get(itemId);
        if (!nestedItem) return;

        // Create drag data
        const dragData = {
            parentId: this.item.id,
            type: 'Item',
            data: nestedItem,
        };
        // @ts-expect-error - TS2339
        event.dataTransfer.setData('text/plain', JSON.stringify(dragData));

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
    static async #nestedItemCreate(this: any, event: Event, target: HTMLElement): Promise<void> {
        const itemType = target.dataset.type ?? 'gear';
        const data = {
            name: `New ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`,
            type: itemType,
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
    static #nestedItemEdit(this: any, event: Event, target: HTMLElement): void {
        const itemId = (target.closest('[data-nested-item-id]') as HTMLElement | null)?.dataset.nestedItemId;
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
    static async #nestedItemDelete(this: any, event: Event, target: HTMLElement): Promise<void> {
        const itemId = (target.closest('[data-nested-item-id]') as HTMLElement | null)?.dataset.nestedItemId;
        if (!itemId) return;

        const confirmed = await ConfirmationDialog.confirm({
            title: 'Confirm Delete',
            content: 'Are you sure you would like to delete this?',
            confirmLabel: 'Delete',
            cancelLabel: 'Cancel',
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
    static #nestedItemRoll(event: Event, target: HTMLElement): void {
        // Placeholder for nested item rolls
        event.preventDefault();
    }
}
