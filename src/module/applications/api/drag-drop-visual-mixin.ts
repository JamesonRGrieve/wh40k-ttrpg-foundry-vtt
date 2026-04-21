/**
 * @file DragDropVisualMixin - Visual drag-drop feedback layer
 * Extends the base DragDropAPIMixin with WH40K RPG-specific visual enhancements
 *
 * Features:
 * - Custom Gothic 40K drag ghost images
 * - Visual drop zone highlighting
 * - Item reordering within lists
 * - Quick equip to equipment slots
 * - Item splitting (Ctrl+Drag for stacks)
 * - Stat comparison tooltips while dragging
 * - Snap-to-slot animations
 * - Favorites bar for quick access items
 *
 * This is the visual layer - for core API, see drag-drop-api-mixin.mjs
 */

type ApplicationV2 = foundry.applications.api.ApplicationV2.Any;
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KBaseActorDocument, WH40KItemDocument } from '../../types/global.d.ts';
import type { EnhancedDragDropMixinAPI } from './sheet-mixin-types.js';

/** Human-readable labels for item types shown in the header drop zone. */
const DROP_ZONE_LABELS: Record<string, string> = {
    weapon: 'Add Weapon',
    armour: 'Add Armour',
    gear: 'Add Item',
    ammunition: 'Add Ammunition',
    cybernetic: 'Add Cybernetic',
    talent: 'Add Talent',
    trait: 'Add Trait',
    psychicPower: 'Add Psychic Power',
    forceField: 'Add Force Field',
    criticalInjury: 'Add Critical Injury',
    condition: 'Add Condition',
    skill: 'Add Skill',
    specialAbility: 'Add Special Ability',
};
const DROP_ZONE_DEFAULT_LABEL = 'Drag and Drop from Compendium to Add';

/** Captured at dragstart so dragover handlers can read the item type. */
let _activeDragType: string | null = null;
let _globalDragListenersSetup = false;

function ensureGlobalDragTracking(): void {
    if (_globalDragListenersSetup) return;
    _globalDragListenersSetup = true;
    document.addEventListener(
        'dragstart',
        (e: DragEvent) => {
            try {
                const raw = e.dataTransfer?.getData('text/plain');
                interface DragData {
                    type?: string;
                }
                _activeDragType = raw ? (JSON.parse(raw) as DragData).type ?? null : null;
            } catch {
                _activeDragType = null;
            }
        },
        false,
    );
    document.addEventListener(
        'dragend',
        () => {
            _activeDragType = null;
        },
        false,
    );
}

/**
 * Mixin that adds enhanced drag-drop with visual feedback
 * @template {ApplicationV2} T
 * @param {T} Base  The base class being mixed
 * @returns {any}
 * @mixin
 */
export default function EnhancedDragDropMixin<T extends new (...args: any[]) => ApplicationV2>(Base: T) {
    return class EnhancedDragDropApplication extends Base implements EnhancedDragDropMixinAPI {
        /* -------------------------------------------- */
        /*  Initialization                              */
        /* -------------------------------------------- */

        _draggedItem: { id: string; item: WH40KItem; element: HTMLElement } | null = null;
        _dragStartPos: { x: number; y: number } | null = null;
        _splitResult: { quantity: number } | null = null;

        static DRAG_THRESHOLD: number = 5;

        declare document: WH40KBaseActorDocument | WH40KItemDocument;

        /* -------------------------------------------- */
        /*  Render Hooks                                */
        /* -------------------------------------------- */

        /** @inheritDoc */
        async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
            await super._onRender(context, options);

            // Enhanced drag-drop setup
            this._setupEnhancedDragDrop();
        }

        /* -------------------------------------------- */

        /**
         * Setup enhanced drag-drop handlers
         * @private
         */
        _setupEnhancedDragDrop(): void {
            this.element.querySelectorAll<HTMLElement>('[data-item-id]').forEach((el) => {
                if (el.closest('.wh40k-tp_row') || el.closest('.wh40k-talent-row')) return;
                if (el.closest('[data-disable-drag="true"]') || el.closest('.wh40k-panel-backpack-split')) return;

                el.setAttribute('draggable', 'true');

                el.addEventListener('dragstart', (event: DragEvent) => this._onEnhancedDragStart(event));
                el.addEventListener('dragend', (event: DragEvent) => this._onEnhancedDragEnd(event));
            });

            this._setupDropZones();
            this._setupFavoritesBar();
        }

        /* -------------------------------------------- */

        /**
         * Setup drop zones for equipment slots and inventory sections
         * @private
         */
        _setupDropZones(): void {
            ensureGlobalDragTracking();
            const dropZones = this.element.querySelectorAll<HTMLElement>('[data-drop-zone]');

            dropZones.forEach((zone) => {
                zone.addEventListener('dragover', (event: DragEvent) => this._onEnhancedDragOver(event));
                zone.addEventListener('dragleave', (event: DragEvent) => this._onEnhancedDragLeave(event));
                zone.addEventListener('drop', (event: DragEvent) => this._onEnhancedDrop(event));
            });

            const inventoryLists = this.element.querySelectorAll<HTMLElement>('.inventory-list, .item-list');
            inventoryLists.forEach((list) => {
                list.addEventListener('dragover', (event: DragEvent) => this._onInventoryDragOver(event));
                list.addEventListener('drop', (event: DragEvent) => this._onInventoryDrop(event));
            });
        }

        /* -------------------------------------------- */

        /**
         * Setup favorites bar if present
         * @private
         */
        _setupFavoritesBar(): void {
            const favBar = this.element.querySelector<HTMLElement>('[data-favorites-bar]');
            if (!favBar) return;

            favBar.addEventListener('dragover', (event: DragEvent) => this._onFavoritesDragOver(event));
            favBar.addEventListener('drop', (event: DragEvent) => this._onFavoritesDrop(event));
        }

        /* -------------------------------------------- */
        /*  Drag Start Handlers                         */
        /* -------------------------------------------- */

        /**
         * Enhanced drag start with visual feedback
         * @param {DragEvent} event  The drag start event
         * @private
         */
        async _onEnhancedDragStart(event: DragEvent): Promise<void> {
            const element = event.currentTarget as HTMLElement;
            const itemId = element.dataset.itemId;
            const item = this.document.items.get(itemId ?? '') as WH40KItem | undefined;

            if (!item) return;

            this._dragStartPos = { x: event.clientX, y: event.clientY };

            this._draggedItem = {
                id: itemId ?? '',
                item,
                element,
            };

            if (event.ctrlKey && this._canSplitItem(item)) {
                const result = await this._showSplitDialog(item);
                if (!result) {
                    event.preventDefault();
                    this._resetDrag();
                    return;
                }
                this._splitResult = result;
            }

            const ghost = this._createDragGhost(item, event);
            document.body.appendChild(ghost);
            event.dataTransfer?.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
            setTimeout(() => ghost.remove(), 0);

            event.dataTransfer?.setData('text/plain', JSON.stringify(item.toDragData()));

            element.classList.add('dragging');
            this.element.classList.add('drag-active');

            this._highlightValidDropZones(item);
        }

        /* -------------------------------------------- */

        /**
         * Create a custom drag ghost image with WH40K styling
         * @param {WH40KItem} item        The item being dragged
         * @param {DragEvent} event  The drag event
         * @returns {HTMLElement}    The ghost element
         * @private
         */
        _createDragGhost(item: WH40KItem, event: DragEvent): HTMLElement {
            const ghost = document.createElement('div');
            ghost.className = 'wh40k-drag-ghost';

            const system = item.system as Record<string, unknown>;
            const quantity = this._splitResult ? this._splitResult.quantity : (system.quantity as number) || 1;

            ghost.innerHTML = `
                <div class="ghost-content">
                    <img src="${item.img}" alt="${item.name}" />
                    <div class="ghost-details">
                        <div class="ghost-name">${item.name}</div>
                        ${quantity > 1 ? `<div class="ghost-quantity">×${quantity}</div>` : ''}
                        ${system.equipped ? '<i class="fas fa-check-circle ghost-equipped"></i>' : ''}
                    </div>
                </div>
            `;

            ghost.style.position = 'absolute';
            ghost.style.top = '-1000px';
            ghost.style.left = '-1000px';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '10000';

            return ghost;
        }

        /* -------------------------------------------- */

        /**
         * Check if an item can be split
         * @param {WH40KItem} item  The item to check
         * @returns {boolean}  True if item can be split
         * @private
         */
        _canSplitItem(item: WH40KItem): boolean {
            const system = item.system as Record<string, unknown>;
            const quantity = system.quantity as number;
            if (!quantity || quantity <= 1) return false;

            const splittableTypes = ['gear', 'weapon'];
            return splittableTypes.includes(item.type);
        }

        /* -------------------------------------------- */

        /**
         * Show dialog to split item stack
         * @param {WH40KItem} item  The item to split
         * @returns {Promise<{quantity: number}|null>}  Split result or null if cancelled
         * @private
         */
        _showSplitDialog(item: WH40KItem): Promise<{ quantity: number } | null> {
            const system = item.system as Record<string, unknown>;
            const quantity = (system.quantity as number) || 1;

            return (foundry.applications.api.DialogV2 as any).prompt({
                window: { title: `Split ${item.name}` },
                content: `
                    <form class="wh40k-split-dialog">
                        <div class="form-group">
                            <label>Quantity to move (max ${quantity})</label>
                            <input type="number" name="quantity" min="1" max="${quantity}" value="1" autofocus />
                        </div>
                        <p class="hint">The remaining ${quantity - 1} will stay in the original stack.</p>
                    </form>
                `,
                ok: {
                    icon: 'fas fa-split',
                    label: 'Split',
                    callback: (event: SubmitEvent, button: HTMLButtonElement, dialog: HTMLElement) => {
                        const input = dialog.querySelector<HTMLInputElement>('[name="quantity"]');
                        const qty = input ? parseInt(input.value) : 0;
                        if (qty > 0 && qty <= quantity) {
                            return { quantity: qty };
                        }
                        ui.notifications.warn('Invalid quantity');
                        return null;
                    },
                },
                rejectClose: false,
            });
        }

        /* -------------------------------------------- */

        /**
         * Highlight valid drop zones based on dragged item
         * @param {WH40KItem} item  The dragged item
         * @private
         */
        _highlightValidDropZones(item: WH40KItem): void {
            const dropZones = this.element.querySelectorAll('[data-drop-zone]');

            dropZones.forEach((zone) => {
                const zoneEl = zone as HTMLElement;
                const accepts = zoneEl.dataset.accepts?.split(',') || [];

                if (accepts.length === 0 || accepts.includes(item.type)) {
                    zoneEl.classList.add('drop-valid');
                } else {
                    zoneEl.classList.add('drop-invalid');
                }
            });
        }

        /* -------------------------------------------- */
        /*  Drag Over Handlers                          */
        /* -------------------------------------------- */

        /**
         * Enhanced drag over handler with visual feedback
         * @param {DragEvent} event  The drag over event
         * @private
         */
        _onEnhancedDragOver(event: DragEvent): void {
            event.preventDefault();
            event.stopPropagation();

            const zone = event.currentTarget as HTMLElement;

            if (zone.classList.contains('drop-invalid')) {
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
                return;
            }

            zone.classList.add('wh40k-drag-over');
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';

            const textEl = zone.querySelector('.wh40k-dropzone-text');
            if (textEl) {
                const type = _activeDragType ?? this._draggedItem?.item?.type ?? null;
                textEl.textContent = type && DROP_ZONE_LABELS[type] ? DROP_ZONE_LABELS[type] : DROP_ZONE_DEFAULT_LABEL;
            }
        }

        /* -------------------------------------------- */

        /**
         * Drag leave handler to remove hover effects
         * @param {DragEvent} event  The drag leave event
         * @private
         */
        _onEnhancedDragLeave(event: DragEvent): void {
            const zone = event.currentTarget as HTMLElement;
            zone.classList.remove('drop-hover');
            zone.classList.remove('wh40k-drag-over');

            const textEl = zone.querySelector('.wh40k-dropzone-text');
            if (textEl) textEl.textContent = 'Drag and Drop from Compendium to Add';
        }

        /* -------------------------------------------- */

        /**
         * Inventory list drag over for reordering
         * @param {DragEvent} event  The drag over event
         * @private
         */
        _onInventoryDragOver(event: DragEvent): void {
            event.preventDefault();
            event.stopPropagation();

            if (!this._draggedItem) return;

            const targetRow = (event.target as HTMLElement).closest('[data-item-id]') as HTMLElement | null;
            if (!targetRow || targetRow === this._draggedItem.element) return;

            const rect = targetRow.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const insertBefore = event.clientY < midpoint;

            this.element.querySelectorAll('.drop-indicator').forEach((el) => el.remove());

            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            if (insertBefore) {
                targetRow.parentNode?.insertBefore(indicator, targetRow);
            } else {
                targetRow.parentNode?.insertBefore(indicator, targetRow.nextSibling);
            }
        }

        /* -------------------------------------------- */

        /**
         * Favorites bar drag over handler
         * @param {DragEvent} event  The drag over event
         * @private
         */
        _onFavoritesDragOver(event: DragEvent): void {
            event.preventDefault();
            event.stopPropagation();

            const favBar = event.currentTarget as HTMLElement;
            favBar.classList.add('drop-hover');
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
        }

        /* -------------------------------------------- */
        /*  Drop Handlers                               */
        /* -------------------------------------------- */

        /**
         * Enhanced drop handler with equipment slots
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onEnhancedDrop(event: DragEvent): Promise<void> {
            event.preventDefault();
            event.stopPropagation();

            const zone = event.currentTarget as HTMLElement;
            zone.classList.remove('drop-hover');

            const data = TextEditor.getDragEventData(event) as any;
            if (!data?.uuid) return;

            const item = (await fromUuid(data.uuid)) as WH40KItem | null;
            if (!item) return;

            const zoneType = zone.dataset.dropZone;
            const slot = zone.dataset.slot;

            if (zoneType === 'personal') {
                if (item.actor?.id !== this.document.id) {
                    const itemData = item.toObject();
                    (itemData.system as any).inShipStorage = false;
                    (itemData.system as any).equipped = false;
                    await this.document.createEmbeddedDocuments('Item', [itemData]);
                } else {
                    await item.update({
                        'system.inShipStorage': false,
                    });
                }
            } else if (zoneType === 'ship') {
                if (item.actor?.id !== this.document.id) {
                    const itemData = item.toObject();
                    (itemData.system as any).inShipStorage = true;
                    (itemData.system as any).equipped = false;
                    (itemData.system as any).inBackpack = false;
                    await this.document.createEmbeddedDocuments('Item', [itemData]);
                } else {
                    await item.update({
                        'system.equipped': false,
                        'system.inBackpack': false,
                        'system.inShipStorage': true,
                    });
                }
            } else if (zoneType === 'equipment') {
                await this._handleEquipmentDrop(item, slot ?? '');
            } else {
                await this._handleGeneralDrop(item, event);
            }

            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Handle drop onto equipment slot
         * @param {WH40KItem} item  The dropped item
         * @param {string} slot  The equipment slot
         * @private
         */
        async _handleEquipmentDrop(item: WH40KItem, slot: string): Promise<void> {
            if (item.actor?.id !== this.document.id) {
                ui.notifications.warn('Cannot equip items from other actors');
                return;
            }

            const validSlot = this._validateEquipmentSlot(item, slot);
            if (!validSlot) {
                ui.notifications.warn(`${item.name} cannot be equipped in ${slot} slot`);
                return;
            }

            await item.update({ 'system.equipped': true });
            ui.notifications.info(`Equipped ${item.name}`);
            this._animateSnapToSlot(item);
        }

        /* -------------------------------------------- */

        /**
         * Validate if item can be equipped in slot
         * @param {WH40KItem} item  The item to validate
         * @param {string} slot  The target slot
         * @returns {boolean}  True if valid
         * @private
         */
        _validateEquipmentSlot(item: WH40KItem, slot: string): boolean {
            if (slot === 'primary-weapon' || slot === 'secondary-weapon') {
                return item.type === 'weapon';
            }

            if (slot.includes('armor')) {
                return item.type === 'armour';
            }

            return true;
        }

        /* -------------------------------------------- */

        /**
         * Handle general drop (not equipment slot)
         * @param {WH40KItem} item  The dropped item
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _handleGeneralDrop(item: WH40KItem, event: DragEvent): Promise<void> {
            if (this._splitResult) {
                await this._handleSplitDrop(item, this._splitResult.quantity);
                this._splitResult = null;
                return;
            }

            const behavior = (this as any)._dropBehavior(event);

            if (behavior === 'copy') {
                const itemData = item.toObject();
                await this.document.createEmbeddedDocuments('Item', [itemData]);
                ui.notifications.info(`Added ${item.name} to inventory`);
            } else if (behavior === 'move') {
                ui.notifications.info(`Moved ${item.name}`);
            }
        }

        /* -------------------------------------------- */

        /**
         * Handle split item drop
         * @param {WH40KItem} item  The source item
         * @param {number} quantity  Quantity to split
         * @private
         */
        async _handleSplitDrop(item: WH40KItem, quantity: number): Promise<void> {
            const system = item.system as Record<string, unknown>;
            const currentQty = (system.quantity as number) || 1;
            const remaining = currentQty - quantity;

            if (remaining <= 0) {
                ui.notifications.error('Cannot split entire stack');
                return;
            }

            const newItemData = item.toObject();
            const newSystem = newItemData.system as Record<string, unknown>;
            newSystem.quantity = quantity;
            newItemData.name = `${item.name} (${quantity})`;

            await this.document.createEmbeddedDocuments('Item', [newItemData]);
            await item.update({ 'system.quantity': remaining });

            ui.notifications.info(`Split ${item.name}: ${quantity} moved, ${remaining} remaining`);
        }

        /* -------------------------------------------- */

        /**
         * Handle drop in inventory list for reordering
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onInventoryDrop(event: DragEvent): Promise<void> {
            event.preventDefault();
            event.stopPropagation();

            this.element.querySelectorAll('.drop-indicator').forEach((el) => el.remove());

            if (!this._draggedItem) return;

            const targetRow = (event.target as HTMLElement).closest('[data-item-id]') as HTMLElement | null;
            if (!targetRow) return;

            const targetId = targetRow.dataset.itemId;
            const sourceId = this._draggedItem.id;

            if (sourceId === targetId) return;

            await this._reorderItems(sourceId as string, targetId as string, event.clientY);
            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Reorder items in the list
         * @param {string} sourceId  Source item ID
         * @param {string} targetId  Target item ID
         * @param {number} clientY  Y position for before/after
         * @private
         */
        async _reorderItems(sourceId: string, targetId: string, clientY: number): Promise<void> {
            const items = Array.from(this.document.items) as WH40KItem[];
            const sourceIndex = items.findIndex((i) => i.id === sourceId);
            const targetIndex = items.findIndex((i) => i.id === targetId);

            if (sourceIndex === -1 || targetIndex === -1) return;

            const [removed] = items.splice(sourceIndex, 1);
            items.splice(targetIndex, 0, removed);

            const updates = items.map((item, index) => ({
                _id: item.id,
                sort: index * 100,
            }));

            await this.document.updateEmbeddedDocuments('Item', updates);
            ui.notifications.info('Items reordered');
        }

        /* -------------------------------------------- */

        /**
         * Handle drop on favorites bar
         * @param {DragEvent} event  The drop event
         * @private
         */
        async _onFavoritesDrop(event: DragEvent): Promise<void> {
            event.preventDefault();
            event.stopPropagation();

            const favBar = event.currentTarget as HTMLElement;
            favBar.classList.remove('drop-hover');

            const data = TextEditor.getDragEventData(event) as any;
            if (!data?.uuid) return;

            const item = (await fromUuid(data.uuid)) as WH40KItem | null;
            if (!item || item.actor?.id !== this.document.id) return;

            await this._addToFavorites(item);
            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Add item to favorites bar
         * @param {WH40KItem} item  The item to favorite
         * @private
         */
        async _addToFavorites(item: WH40KItem): Promise<void> {
            const favorites = (this.document.getFlag('wh40k-rpg', 'favorites') as string[]) || [];

            if (favorites.includes(item.id)) {
                ui.notifications.warn(`${item.name} is already in favorites`);
                return;
            }

            if (favorites.length >= 8) {
                ui.notifications.warn('Favorites bar is full (max 8 items)');
                return;
            }

            favorites.push(item.id);
            await this.document.setFlag('wh40k-rpg', 'favorites', favorites);
            ui.notifications.info(`Added ${item.name} to favorites`);
        }

        /* -------------------------------------------- */
        /*  Drag End Handlers                           */
        /* -------------------------------------------- */

        /**
         * Enhanced drag end handler
         * @param {DragEvent} event  The drag end event
         * @private
         */
        _onEnhancedDragEnd(event: DragEvent): void {
            this._resetDrag();
        }

        /* -------------------------------------------- */

        /**
         * Reset drag state and cleanup visual feedback
         * @private
         */
        _resetDrag(): void {
            if (this._draggedItem?.element) {
                (this._draggedItem.element as HTMLElement).classList.remove('dragging');
            }

            this.element.classList.remove('drag-active');

            this.element.querySelectorAll('[data-drop-zone]').forEach((zone) => {
                zone.classList.remove('drop-valid', 'drop-invalid', 'drop-hover');
            });

            this.element.querySelectorAll('.drop-indicator').forEach((el) => el.remove());

            this._draggedItem = null;
            this._dragStartPos = null;
            this._splitResult = null;
        }

        /* -------------------------------------------- */
        /*  Animation Helpers                           */
        /* -------------------------------------------- */

        /**
         * Animate snap-to-slot effect
         * @param {WH40KItem} item  The item being equipped
         * @private
         */
        _animateSnapToSlot(item: WH40KItem): void {
            const itemEl = this.element.querySelector(`[data-item-id="${item.id}"]`);
            if (!itemEl) return;

            itemEl.classList.add('snap-to-slot');
            setTimeout(() => {
                itemEl.classList.remove('snap-to-slot');
            }, 600);
        }

        /* -------------------------------------------- */
        /*  Public API                                  */
        /* -------------------------------------------- */

        async removeFromFavorites(itemId: string): Promise<void> {
            const favorites = (this.document.getFlag('wh40k-rpg', 'favorites') as string[]) || [];
            const newFavorites = favorites.filter((id) => id !== itemId);
            await this.document.setFlag('wh40k-rpg', 'favorites', newFavorites);
        }

        async clearFavorites(): Promise<void> {
            await this.document.setFlag('wh40k-rpg', 'favorites', []);
        }

        getFavoriteItems(): unknown[] {
            const favorites = (this.document.getFlag('wh40k-rpg', 'favorites') as string[]) || [];
            return favorites.map((id) => this.document.items.get(id)).filter((i) => i);
        }
    };
}
