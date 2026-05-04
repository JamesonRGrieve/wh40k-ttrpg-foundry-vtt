/**
 * @gulpfile.js ContainerItemSheet - Item sheet for items that can contain other items
 * Handles weapons with mods, armour with upgrades, etc.
 */

import type { WH40KItem } from '../../documents/item.ts';
import ConfirmationDialog from '../dialogs/confirmation-dialog.ts';
import BaseItemSheet from './base-item-sheet.ts';

/**
 * Item sheet for container-type items (weapons, armour, gear, etc.)
 * that can hold nested items like modifications.
 */
export default class ContainerItemSheet extends BaseItemSheet {
    /** @foundry-v14-overrides.d.ts */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        actions: {
            ...(BaseItemSheet.DEFAULT_OPTIONS?.actions as Record<string, unknown>),
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
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const sys = this.item.system as { container?: boolean };

        // Add nested items if this is a container
        if (sys.container) {
            context.nestedItems = this.item.items?.contents ?? [];
            context.isContainer = true;
        }

        return context;
    }

    /* -------------------------------------------- */
    /*  Event Listeners and Handlers                */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Set up drag-drop for container items
        const sys = this.item.system as { container?: boolean };
        if (this.isEditable && sys.container) {
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
        form.addEventListener('drop', this._onDrop.bind(this) as unknown as EventListener);
        form.addEventListener('dragend', this._onDragEnd.bind(this));

        // Set up draggable nested items
        this.element.querySelectorAll('[data-nested-item-id]').forEach((el) => {
            el.setAttribute('draggable', 'true');
            el.addEventListener('dragstart', this._onNestedItemDragStart.bind(this) as unknown as EventListener);
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle dragover events.
     * @protected
     */
    _onDragOver(event: Event): boolean {
        event.preventDefault();
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Handle dragend events.
     * @protected
     */
    _onDragEnd(event: Event): boolean {
        event.preventDefault();
        return false;
    }

    /* -------------------------------------------- */

    /**
     * Handle drop events for nested items.
     * @protected
     */
    async _onDrop(event: DragEvent): Promise<boolean> {
        event.preventDefault();
        event.stopPropagation();

        let data;
        let droppedItem: WH40KItem | null;
        let sourceActor: Actor | null = null;

        try {
            data = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '{}');
            if (data.type !== 'Item') {
                return false;
            }

            droppedItem = (await fromUuid(data.uuid)) as WH40KItem | null;
            if (!droppedItem) return false;

            // Get source actor if applicable
            if (data.uuid?.startsWith('Actor.')) {
                sourceActor = (await fromUuid(data.uuid.split('.Item.')[0])) as Actor | null;
            }

            // Check if item already exists
            if (this.item.items?.find((i) => i._id === droppedItem!._id)) {
                return false;
            }
        } catch (err) {
            return false;
        }

        // Validate the drop
        if (!this._canAddItem(droppedItem)) {
            return false;
        }

        // Prevent dropping item onto itself or ancestors
        if (!this._validateDropTarget(droppedItem)) {
            ui.notifications.info('Cannot drop item into itself');
            return false;
        }

        // Add the item to the container
        await this.item.createNestedDocuments([droppedItem as unknown as Record<string, unknown>]);

        // Remove from source actor if applicable
        if (sourceActor && ['acolyte', 'character'].includes(sourceActor.type)) {
            await sourceActor.deleteEmbeddedDocuments('Item', [droppedItem._id!]);
        }

        return false;
    }

    /* -------------------------------------------- */

    /**
     * Validate that the drop target is not the item itself or an ancestor.
     * @protected
     */
    _validateDropTarget(droppedItem: WH40KItem): boolean {
        let canAdd = this.item.id !== droppedItem._id;
        let parent = this.item.parent as Record<string, unknown> | null;
        let count = 0;

        while (parent && count < 10) {
            count++;
            canAdd = canAdd && parent['id'] !== droppedItem._id;
            parent = parent['parent'] as Record<string, unknown> | null;
        }

        return canAdd;
    }

    /* -------------------------------------------- */

    /**
     * Check if an item can be added to this container.
     * @protected
     */
    _canAddItem(item: WH40KItem): boolean {
        const sys = this.item.system as { container?: boolean; containerTypes?: string[] };
        if (!sys.containerTypes) return false;
        return sys.containerTypes.includes(item.type);
    }

    /* -------------------------------------------- */

    /**
     * Handle dragging a nested item out of the container.
     * @protected
     */
    async _onNestedItemDragStart(event: DragEvent): Promise<void> {
        event.stopPropagation();

        const element = event.currentTarget as HTMLElement;
        const itemId = element.dataset.nestedItemId;
        if (!itemId) return;

        const nestedItem = this.item.items?.get(itemId);
        if (!nestedItem) return;

        // Create drag data
        const dragData = {
            parentId: this.item.id,
            type: 'Item',
            data: nestedItem,
        };
        event.dataTransfer?.setData('text/plain', JSON.stringify(dragData));

        // Remove from container
        await this.item.deleteNestedDocuments([itemId]);
    }

    /* -------------------------------------------- */

    /**
     * Handle creating a nested item.
     */
    static async #nestedItemCreate(this: ContainerItemSheet, event: Event, target: HTMLElement): Promise<void> {
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
     */
    static #nestedItemEdit(this: ContainerItemSheet, event: Event, target: HTMLElement): void {
        const itemId = (target.closest('[data-nested-item-id]') as HTMLElement | null)?.dataset.nestedItemId;
        const nestedItem = this.item.items?.get(itemId!);
        nestedItem?.sheet?.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting a nested item.
     */
    static async #nestedItemDelete(this: ContainerItemSheet, event: Event, target: HTMLElement): Promise<void> {
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
     */
    static #nestedItemRoll(this: ContainerItemSheet, event: Event, target: HTMLElement): void {
        // Placeholder for nested item rolls
        event.preventDefault();
    }
}
